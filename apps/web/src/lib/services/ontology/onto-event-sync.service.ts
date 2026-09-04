// apps/web/src/lib/services/ontology/onto-event-sync.service.ts
// Thin web shim over the shared ontology event write service.
//
// The whole write path (create/update/delete, Google mutation, mapping repair,
// project sync-job processing, task write-back) now lives in
// @buildos/shared-agent-ops/calendar/onto-event-sync.service so the worker runs
// the same code. This class only supplies the web-specific edges:
//
//   * PUBLIC_APP_URL for the deep links baked into calendar descriptions
//   * the legacy singleton-OAuth CalendarService (`user_calendar_tokens`)
//   * the multi-calendar allowlist read from `$env/dynamic/private`
//   * admin-client factories for the source-aware writer / project resources
//   * ErrorLoggerService for Google delete failures
//   * `enqueueProjectEventSyncJobs`, the queue fan-out that keeps project-scoped
//     writes asynchronous on web. The worker omits it and writes to Google inline.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { CalendarService } from '$lib/services/calendar-service';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GoogleCalendarProjectResourceService } from '$lib/server/google-calendar-project-resource.service';
import { GoogleCalendarWriteService } from '$lib/server/google-calendar-write.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import {
	OntoEventSyncService as SharedOntoEventSyncService,
	type OntoEventCalendarErrorLogParams,
	type OntoEventCalendarWriter,
	type OntoEventProjectCalendarPort,
	type OntoEventSyncServiceOptions as SharedOntoEventSyncServiceOptions,
	type ProjectCalendarSyncMode,
	type ProjectEventSyncAction,
	DEFAULT_PROJECT_CALENDAR_SYNC_MODE
} from '@buildos/shared-agent-ops/calendar/onto-event-sync.service';
import { PUBLIC_APP_URL } from '$env/static/public';
import { env as privateEnv } from '$env/dynamic/private';

export type {
	CalendarScope,
	CreateOntoEventRequest,
	CreateOntoEventResult,
	DeleteOntoEventRequest,
	OntoEventActivityLogOptions,
	UpdateOntoEventRequest
} from '@buildos/shared-agent-ops/calendar/onto-event-sync.service';

type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];

export interface OntoEventSyncServiceOptions {
	calendarWriter?: OntoEventCalendarWriter;
	projectCalendarService?: OntoEventProjectCalendarPort;
	sourceProjectCalendarService?: OntoEventProjectCalendarPort;
	sourceRoutingEnabled?: (userId: string) => boolean;
}

export class OntoEventSyncService extends SharedOntoEventSyncService {
	/** Kept as a field so existing web tests can spy on the legacy client. */
	protected readonly calendarService: CalendarService;

	constructor(supabase: SupabaseClient<Database>, options: OntoEventSyncServiceOptions = {}) {
		const calendarService = new CalendarService(supabase);
		const errorLogger = ErrorLoggerService.getInstance(supabase);

		const sharedOptions: SharedOntoEventSyncServiceOptions = {
			calendarWriter: options.calendarWriter,
			createCalendarWriter: () => new GoogleCalendarWriteService(createAdminSupabaseClient()),
			projectCalendarService:
				options.projectCalendarService ?? new ProjectCalendarService(supabase),
			sourceProjectCalendarService: options.sourceProjectCalendarService,
			createSourceProjectCalendarService: () =>
				new ProjectCalendarService(supabase, {
					projectResourceService: new GoogleCalendarProjectResourceService(
						createAdminSupabaseClient()
					)
				}),
			sourceRoutingEnabled:
				options.sourceRoutingEnabled ??
				(options.calendarWriter
					? () => true
					: (userId: string) => isMultiCalendarUserAllowed(userId, privateEnv)),
			legacyCalendar: calendarService,
			appBaseUrl: PUBLIC_APP_URL,
			logCalendarError: (params: OntoEventCalendarErrorLogParams) =>
				errorLogger
					.logCalendarError(params.error, 'delete', params.eventId, params.userId, {
						projectId: params.projectId ?? undefined,
						calendarEventId: params.externalEventId,
						calendarId: params.calendarId,
						reason: params.reason,
						phase: params.phase,
						ontoEventId: params.eventId,
						syncRowId: params.syncRowId,
						...(params.metadata ?? {})
					})
					.then(() => undefined)
		};

		super(supabase, sharedOptions);

		this.calendarService = calendarService;
		// Assigned after `super` because it closes over `this`; the base only ever
		// calls it from a later write, never during construction.
		this.enqueueSync = (triggeredByUserId, event, action) =>
			this.enqueueProjectEventSyncJobs(triggeredByUserId, event, action);
	}

	/**
	 * Web-only queue fan-out. Project-scoped calendar writes are handed to the
	 * `sync_calendar` queue so every member mapping is processed out of band; the
	 * worker instead writes to Google inline through the shared service.
	 */
	private async enqueueProjectEventSyncJobs(
		triggeredByUserId: string,
		event: OntoEventRow,
		action: ProjectEventSyncAction
	): Promise<{
		mode: ProjectCalendarSyncMode;
		targetUserIds: string[];
		enqueued: number;
	}> {
		if (!event.project_id) {
			return {
				mode: DEFAULT_PROJECT_CALENDAR_SYNC_MODE,
				targetUserIds: [],
				enqueued: 0
			};
		}

		const { mode, targetUserIds } = await this.resolveProjectSyncTargets(
			event.project_id,
			triggeredByUserId
		);
		const eventVersion = event.updated_at ?? event.created_at ?? new Date().toISOString();

		let enqueued = 0;
		for (const targetUserId of targetUserIds) {
			const dedupKey = [
				'onto-project-event-sync',
				action,
				event.id,
				targetUserId,
				eventVersion
			].join(':');

			const metadata = {
				kind: 'onto_project_event_sync',
				action,
				eventId: event.id,
				projectId: event.project_id,
				targetUserId,
				triggeredByUserId,
				createCalendarIfMissing: targetUserId === triggeredByUserId,
				eventUpdatedAt: eventVersion
			};

			// Enqueues work for targetUserId, who is frequently NOT the caller, and
			// add_queue_job is SECURITY INVOKER — so this must not run on the
			// user-scoped client or it breaks once queue_jobs enforces RLS.
			const { error } = await createAdminSupabaseClient().rpc('add_queue_job', {
				p_user_id: targetUserId,
				p_job_type: 'sync_calendar',
				p_metadata: metadata as unknown as Json,
				p_priority: 5,
				p_scheduled_for: new Date().toISOString(),
				p_dedup_key: dedupKey
			});

			if (error) {
				console.error('[OntoEventSyncService] Failed to enqueue calendar sync job:', error);
				continue;
			}

			enqueued += 1;
		}

		if (enqueued === 0) {
			await this.markEventSyncError(event.id, 'Failed to enqueue calendar sync job');
		}

		return {
			mode,
			targetUserIds,
			enqueued
		};
	}
}
