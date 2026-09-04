// packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts
// Write half of the ontology event sync service, shared by web and the worker.
//
// Moved from apps/web/src/lib/services/ontology/onto-event-sync.service.ts. The
// behavior is unchanged; only the host-specific edges became constructor
// injection:
//
//   * `$env` (PUBLIC_APP_URL) -> `appBaseUrl`
//   * `GoogleOAuthService.safeGetCalendarStatus` -> `hasStoredCalendarCredential`,
//     a direct presence read of the stored Google credential row
//   * `ErrorLoggerService.logCalendarError` -> `logCalendarError`
//   * `$lib/services/calendar-service` (legacy singleton OAuth) -> `legacyCalendar`
//   * `createAdminSupabaseClient()` -> `createCalendarWriter` /
//     `createSourceProjectCalendarService` factories
//   * `enqueueProjectEventSyncJobs` (queue fan-out) -> `enqueueSync`
//
// `enqueueSync` is the one behavioral fork between the two hosts. Web passes its
// queue fan-out, so project-scoped writes stay asynchronous exactly as before.
// The worker passes nothing, so project scope falls through to the synchronous
// `syncEventToCalendar` / `updateCalendarFromEvent` / `deleteCalendarEvent`
// paths and talks to Google directly with no queue hop.
import type { Database, Json, ProjectLogChangeSource } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import {
	logCreateAsync,
	logDeleteAsync,
	logUpdateAsync,
	type ActivityLogActorContext
} from '../ops/async-activity-logger';
import type { GoogleCalendarMutationSelector } from './google-calendar-write.service';
import type { GoogleCalendarWriteService } from './google-calendar-write.service';
import type { LegacyOntoEventCalendarClient } from './legacy-google-calendar.port';
import { OntoEventReadService } from './onto-event-read.service';
import { OntoEventService, type OntoEventOwner } from './onto-event.service';
import {
	DEFAULT_PROJECT_CALENDAR_SYNC_MODE,
	type ProjectCalendarSyncMode
} from './project-calendar-read.service';
import { ProjectCalendarService } from './project-calendar.service';

type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];
type OntoEventSyncRow = Database['public']['Tables']['onto_event_sync']['Row'];
type ProjectCalendarRow = Database['public']['Tables']['project_calendars']['Row'];
type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];
type TaskEventKind = 'range' | 'start' | 'due';

export type CalendarScope = 'project' | 'user' | 'calendar_id';
export type ProjectEventSyncAction = 'upsert' | 'delete';

type ExternalEventMapping = {
	externalEventId: string;
	calendarId: string;
	calendarSourceId?: string;
	syncRowId?: string;
};

export interface OntoEventActivityLogOptions {
	changeSource?: ProjectLogChangeSource;
	chatSessionId?: string;
	actorContext?: ActivityLogActorContext;
}

export interface CreateOntoEventRequest {
	orgId?: string | null;
	projectId?: string | null;
	owner: OntoEventOwner;
	typeKey?: string;
	stateKey?: string;
	title: string;
	startAt: string;
	endAt?: string | null;
	allDay?: boolean;
	timezone?: string | null;
	description?: string | null;
	location?: string | null;
	recurrence?: Json;
	externalLink?: string | null;
	props?: Json;
	createdBy: string;
	calendarScope?: CalendarScope;
	calendarId?: string | null;
	calendarSourceId?: string | null;
	syncToCalendar?: boolean;
	deferCalendarSync?: boolean;
	createProjectCalendarIfMissing?: boolean;
	activityLog?: OntoEventActivityLogOptions;
}

export interface UpdateOntoEventRequest {
	eventId: string;
	title?: string;
	description?: string | null;
	location?: string | null;
	startAt?: string;
	endAt?: string | null;
	allDay?: boolean;
	timezone?: string | null;
	stateKey?: string;
	typeKey?: string;
	recurrence?: Json;
	externalLink?: string | null;
	props?: Json;
	syncToCalendar?: boolean;
	deferCalendarSync?: boolean;
	syncTaskFromEvent?: boolean;
	activityLog?: OntoEventActivityLogOptions;
}

export interface DeleteOntoEventRequest {
	eventId: string;
	syncToCalendar?: boolean;
	deferCalendarSync?: boolean;
	activityLog?: OntoEventActivityLogOptions;
}

export interface CreateOntoEventResult {
	event: OntoEventRow;
	sync?: {
		success: boolean;
		provider?: string;
		externalEventId?: string | null;
		calendarId?: string | null;
		calendarSourceId?: string | null;
		error?: string;
	};
}

export type OntoEventCalendarWriter = Pick<
	GoogleCalendarWriteService,
	'createStandaloneEvent' | 'updateEvent' | 'deleteEvent'
>;

export type OntoEventProjectCalendarPort = Pick<
	ProjectCalendarService,
	'ensureProjectCalendarRecord' | 'getProjectCalendarSyncMode'
>;

/** Queue fan-out hook. Web supplies its `add_queue_job` implementation. */
export type OntoEventProjectSyncEnqueuer = (
	triggeredByUserId: string,
	event: OntoEventRow,
	action: ProjectEventSyncAction
) => Promise<{
	mode: ProjectCalendarSyncMode;
	targetUserIds: string[];
	enqueued: number;
}>;

export interface OntoEventCalendarErrorLogParams {
	error: unknown;
	userId: string;
	eventId: string;
	projectId?: string | null;
	externalEventId?: string;
	calendarId?: string;
	syncRowId?: string;
	phase: 'inline_delete' | 'project_sync_job_delete';
	reason: string;
	metadata?: Record<string, unknown>;
}

export interface OntoEventSyncServiceOptions {
	/** Source-aware Google writer, eagerly supplied or lazily constructed. */
	calendarWriter?: OntoEventCalendarWriter;
	createCalendarWriter?: () => OntoEventCalendarWriter;
	/** Project-calendar gateway used for non source-aware users. */
	projectCalendarService?: OntoEventProjectCalendarPort;
	/** Project-calendar gateway used for source-aware users. */
	sourceProjectCalendarService?: OntoEventProjectCalendarPort;
	createSourceProjectCalendarService?: () => OntoEventProjectCalendarPort;
	sourceRoutingEnabled?: (userId: string) => boolean;
	/** Legacy singleton-OAuth Google client (web only; the worker omits it). */
	legacyCalendar?: LegacyOntoEventCalendarClient;
	/** Absolute app origin used for the project/task deep links in descriptions. */
	appBaseUrl?: string;
	/** Queue fan-out for project-scoped writes. Omit for direct Google writes. */
	enqueueSync?: OntoEventProjectSyncEnqueuer;
	/** Structured sink for Google delete failures. */
	logCalendarError?: (params: OntoEventCalendarErrorLogParams) => Promise<void>;
}

const DEFAULT_EVENT_DURATION_MINUTES = 30;
export const FALLBACK_APP_URL = 'https://build-os.com';

function buildEventActivitySnapshot(event: OntoEventRow): Record<string, unknown> {
	return {
		title: event.title,
		type_key: event.type_key,
		state_key: event.state_key,
		start_at: event.start_at,
		end_at: event.end_at,
		owner_entity_type: event.owner_entity_type,
		owner_entity_id: event.owner_entity_id,
		project_id: event.project_id
	};
}

function mergeActivityActorContext(
	activityLog: OntoEventActivityLogOptions | undefined,
	changedByActorId?: string | null
): ActivityLogActorContext | undefined {
	const actorContext = activityLog?.actorContext;
	if (!actorContext && !changedByActorId) {
		return undefined;
	}

	return {
		...(actorContext ?? {}),
		changedByActorId: actorContext?.changedByActorId ?? changedByActorId ?? null
	};
}

function isProbablyGoogleCalendarLink(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	if (!normalized.startsWith('http')) return false;

	return (
		normalized.includes('calendar.google.com') ||
		normalized.includes('www.google.com/calendar') ||
		normalized.includes('google.com/calendar')
	);
}

function providerRecurrenceRules(recurrence: Json | null): string[] | undefined {
	if (!recurrence || typeof recurrence !== 'object' || Array.isArray(recurrence)) {
		return undefined;
	}

	const value = recurrence as Record<string, Json | undefined>;
	const providerRules = value.provider_rules;
	if (Array.isArray(providerRules)) {
		const rules = providerRules.filter(
			(rule): rule is string => typeof rule === 'string' && rule.trim().length > 0
		);
		if (rules.length > 0) return rules;
	}

	const rrule = value.rrule;
	return typeof rrule === 'string' && rrule.trim().length > 0 ? [rrule] : undefined;
}

function parseGoogleEventMappingFromExternalLink(link: string | null | undefined): {
	externalEventId: string;
	calendarId: string;
} | null {
	if (!link) return null;

	try {
		const url = new URL(link);
		const encoded = url.searchParams.get('eid');
		if (!encoded) return null;

		const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const decoded = Buffer.from(padded, 'base64').toString('utf8');
		const separatorIndex = decoded.lastIndexOf(' ');

		if (separatorIndex <= 0 || separatorIndex >= decoded.length - 1) {
			return null;
		}

		const externalEventId = decoded.slice(0, separatorIndex).trim();
		const calendarId = decoded.slice(separatorIndex + 1).trim();

		if (!externalEventId || !calendarId) {
			return null;
		}

		return {
			externalEventId,
			calendarId
		};
	} catch {
		return null;
	}
}

export class OntoEventSyncService extends OntoEventReadService {
	protected readonly appBaseUrl: string;
	protected readonly legacyCalendar?: LegacyOntoEventCalendarClient;
	protected readonly projectCalendarService: OntoEventProjectCalendarPort;
	protected sourceProjectCalendarService?: OntoEventProjectCalendarPort;
	protected calendarWriter?: OntoEventCalendarWriter;
	protected readonly sourceRoutingEnabled: (userId: string) => boolean;
	/**
	 * Web assigns its queue fan-out here (also settable through options). When it
	 * stays undefined every project-scoped write runs inline against Google.
	 */
	protected enqueueSync?: OntoEventProjectSyncEnqueuer;

	private readonly createCalendarWriter?: () => OntoEventCalendarWriter;
	private readonly createSourceProjectCalendarService?: () => OntoEventProjectCalendarPort;
	private readonly logCalendarErrorHook?: (
		params: OntoEventCalendarErrorLogParams
	) => Promise<void>;

	constructor(supabase: TypedSupabaseClient, options: OntoEventSyncServiceOptions = {}) {
		super(supabase);
		this.appBaseUrl = (options.appBaseUrl || FALLBACK_APP_URL).replace(/\/$/, '');
		this.legacyCalendar = options.legacyCalendar;
		this.projectCalendarService =
			options.projectCalendarService ?? new ProjectCalendarService(supabase);
		this.sourceProjectCalendarService = options.sourceProjectCalendarService;
		this.createSourceProjectCalendarService = options.createSourceProjectCalendarService;
		this.calendarWriter = options.calendarWriter;
		this.createCalendarWriter = options.createCalendarWriter;
		this.sourceRoutingEnabled = options.sourceRoutingEnabled ?? (() => true);
		this.enqueueSync = options.enqueueSync;
		this.logCalendarErrorHook = options.logCalendarError;
	}

	// ---------------------------------------------------------------------
	// Host edges
	// ---------------------------------------------------------------------

	protected usesSourceRouting(userId: string): boolean {
		return this.sourceRoutingEnabled(userId);
	}

	protected getCalendarWriter(): OntoEventCalendarWriter {
		if (!this.calendarWriter) {
			if (!this.createCalendarWriter) {
				throw new Error('No Google Calendar writer is configured for source-aware sync');
			}
			this.calendarWriter = this.createCalendarWriter();
		}
		return this.calendarWriter;
	}

	protected getProjectCalendarService(userId: string): OntoEventProjectCalendarPort {
		if (!this.usesSourceRouting(userId)) return this.projectCalendarService;
		if (!this.sourceProjectCalendarService) {
			this.sourceProjectCalendarService =
				this.createSourceProjectCalendarService?.() ?? this.projectCalendarService;
		}
		return this.sourceProjectCalendarService;
	}

	/**
	 * Replaces the web-only `GoogleOAuthService.safeGetCalendarStatus` gate.
	 * Legacy (non source-aware) sync only needs to know whether the user still
	 * has stored Google credentials, which is a presence read of the credential
	 * row. Any failure reads as "not connected", matching the old safe getter.
	 */
	protected async hasStoredCalendarCredential(userId: string): Promise<boolean> {
		try {
			const { data, error } = await this.supabase
				.from('user_calendar_tokens')
				.select('access_token, refresh_token')
				.eq('user_id', userId)
				.maybeSingle();

			if (error || !data) return false;
			return Boolean(data.access_token && data.refresh_token);
		} catch (error) {
			console.warn(
				'[OntoEventSyncService] Failed to read stored calendar credential:',
				error
			);
			return false;
		}
	}

	protected requireLegacyCalendar(): LegacyOntoEventCalendarClient {
		if (!this.legacyCalendar) {
			throw new Error(
				'Legacy Google Calendar client is not available in this runtime; enable source-aware routing'
			);
		}
		return this.legacyCalendar;
	}

	protected buildProjectUrl(projectId: string): string {
		return `${this.appBaseUrl}/projects/${projectId}`;
	}

	protected buildTaskUrl(projectId: string, taskId: string): string {
		return `${this.appBaseUrl}/projects/${projectId}/tasks/${taskId}`;
	}

	protected buildAppUrlFromPath(path: string): string {
		const normalizedPath = path.startsWith('/') ? path : `/${path}`;
		return `${this.appBaseUrl}${normalizedPath}`;
	}

	protected async logGoogleDeleteFailure(params: OntoEventCalendarErrorLogParams): Promise<void> {
		try {
			if (this.logCalendarErrorHook) {
				await this.logCalendarErrorHook(params);
				return;
			}

			console.error('[OntoEventSyncService] Google calendar delete failed:', {
				userId: params.userId,
				eventId: params.eventId,
				projectId: params.projectId ?? undefined,
				calendarEventId: params.externalEventId,
				calendarId: params.calendarId,
				syncRowId: params.syncRowId,
				phase: params.phase,
				reason: params.reason,
				...(params.metadata ?? {}),
				error: params.error
			});
		} catch (loggingError) {
			console.warn(
				'[OntoEventSyncService] Failed to log Google delete failure:',
				loggingError
			);
		}
	}

	protected defer(label: string, task: () => Promise<void>): void {
		queueMicrotask(() => {
			task().catch((error) => {
				console.warn(`[OntoEventSyncService] Deferred ${label} failed:`, error);
			});
		});
	}

	// ---------------------------------------------------------------------
	// Public write API
	// ---------------------------------------------------------------------

	async createEvent(
		userId: string,
		request: CreateOntoEventRequest
	): Promise<CreateOntoEventResult> {
		const startAt = new Date(request.startAt);
		if (Number.isNaN(startAt.getTime())) {
			throw new Error('Invalid start_at value');
		}

		const endAt = request.endAt ? new Date(request.endAt) : null;
		const resolvedEnd =
			endAt && !Number.isNaN(endAt.getTime())
				? endAt
				: new Date(startAt.getTime() + DEFAULT_EVENT_DURATION_MINUTES * 60 * 1000);

		const event = await OntoEventService.createEvent(this.supabase as any, {
			orgId: request.orgId ?? null,
			projectId: request.projectId ?? null,
			owner: request.owner,
			typeKey: request.typeKey ?? 'event.general',
			stateKey: request.stateKey ?? 'scheduled',
			title: request.title,
			description: request.description ?? null,
			location: request.location ?? null,
			startAt: request.startAt,
			endAt: request.endAt ?? resolvedEnd.toISOString(),
			allDay: request.allDay ?? false,
			timezone: request.timezone ?? null,
			recurrence: request.recurrence ?? {},
			externalLink: request.externalLink ?? null,
			props: request.props ?? {},
			createdBy: request.createdBy
		});

		if (event.project_id) {
			await logCreateAsync(
				this.supabase,
				event.project_id,
				'event',
				event.id,
				buildEventActivitySnapshot(event),
				userId,
				request.activityLog?.changeSource ?? 'api',
				request.activityLog?.chatSessionId,
				mergeActivityActorContext(request.activityLog, request.createdBy)
			);
		}

		const shouldSync = request.syncToCalendar !== false;
		if (!shouldSync) {
			return { event };
		}

		const syncOptions = {
			scope: request.calendarScope ?? 'project',
			calendarId: request.calendarId ?? null,
			calendarSourceId: request.calendarSourceId ?? null,
			createProjectCalendarIfMissing: request.createProjectCalendarIfMissing ?? true
		};

		if (syncOptions.scope === 'project' && event.project_id && this.enqueueSync) {
			const enqueueResult = await this.enqueueSync(userId, event, 'upsert');
			return {
				event,
				sync: {
					success: enqueueResult.enqueued > 0,
					provider: 'google',
					error:
						enqueueResult.enqueued > 0
							? undefined
							: 'No eligible calendar sync targets were found'
				}
			};
		}

		// Project scope without a queue (worker): fall through to the same
		// synchronous Google write the user/calendar_id scopes already use.
		if (request.deferCalendarSync && !(syncOptions.scope === 'project' && event.project_id)) {
			this.defer('calendar create', async () => {
				const latest = await this.getEvent(event.id, userId);
				if (!latest) return;
				if ((latest as any).deleted_at) return;
				await this.syncEventToCalendar(userId, latest as any, syncOptions);
			});
			return { event };
		}

		const syncResult = await this.syncEventToCalendar(userId, event, syncOptions);

		return { event: syncResult.event, sync: syncResult.sync };
	}

	async updateEvent(userId: string, request: UpdateOntoEventRequest): Promise<OntoEventRow> {
		const existing = await this.getEvent(request.eventId, userId);
		if (!existing) {
			throw new Error('Event not found');
		}

		const updated = await OntoEventService.updateEvent(this.supabase as any, {
			id: request.eventId,
			title: request.title,
			description: request.description,
			location: request.location,
			startAt: request.startAt,
			endAt: request.endAt,
			allDay: request.allDay,
			timezone: request.timezone,
			stateKey: request.stateKey,
			typeKey: request.typeKey,
			recurrence: request.recurrence,
			externalLink: request.externalLink,
			props: request.props
		});

		const projectId = updated.project_id ?? existing.project_id;
		if (projectId) {
			await logUpdateAsync(
				this.supabase,
				projectId,
				'event',
				updated.id,
				buildEventActivitySnapshot(existing),
				buildEventActivitySnapshot(updated),
				userId,
				request.activityLog?.changeSource ?? 'api',
				request.activityLog?.chatSessionId,
				mergeActivityActorContext(request.activityLog)
			);
		}

		if (request.syncTaskFromEvent !== false) {
			try {
				await this.syncTaskFromEvent(updated);
			} catch (error) {
				console.warn('[OntoEventSyncService] Failed to sync task from event:', error);
			}
		}

		if (request.syncToCalendar === false) {
			return updated;
		}

		if (updated.project_id && this.enqueueSync) {
			await this.enqueueSync(userId, updated, 'upsert');
			return updated;
		}

		if (request.deferCalendarSync && !updated.project_id) {
			this.defer('calendar update', async () => {
				const latest = await this.getEvent(request.eventId, userId);
				if (!latest) return;
				if ((latest as any).deleted_at) return;
				await this.updateCalendarFromEvent(
					userId,
					latest as any,
					latest.onto_event_sync ?? []
				);
			});
			return updated;
		}

		await this.updateCalendarFromEvent(userId, updated, existing.onto_event_sync ?? []);
		return updated;
	}

	async deleteEvent(userId: string, request: DeleteOntoEventRequest): Promise<OntoEventRow> {
		const existing = await this.getEvent(request.eventId, userId);
		if (!existing) {
			throw new Error('Event not found');
		}
		const shouldSyncExternalDelete =
			request.syncToCalendar !== false &&
			((existing.onto_event_sync?.length ?? 0) > 0 ||
				this.hasPriorExternalReference(existing));
		const deletedAt = new Date().toISOString();

		const { data: updated, error } = await this.supabase
			.from('onto_events')
			.update({
				deleted_at: deletedAt,
				updated_at: deletedAt,
				...(shouldSyncExternalDelete
					? {
							sync_status: 'pending',
							sync_error: null
						}
					: {})
			})
			.eq('id', request.eventId)
			.select('*')
			.single();

		if (error || !updated) {
			throw new Error(error?.message ?? 'Failed to delete event');
		}

		const projectId = updated.project_id ?? existing.project_id;
		if (projectId) {
			await logDeleteAsync(
				this.supabase,
				projectId,
				'event',
				existing.id,
				buildEventActivitySnapshot(existing),
				userId,
				request.activityLog?.changeSource ?? 'api',
				request.activityLog?.chatSessionId,
				mergeActivityActorContext(request.activityLog)
			);
		}

		if (request.syncToCalendar !== false) {
			if (updated.project_id && this.enqueueSync) {
				await this.enqueueSync(userId, updated, 'delete');
			} else if (request.deferCalendarSync && !updated.project_id) {
				this.defer('calendar delete', async () => {
					const latest = await this.getEvent(request.eventId, userId);
					if (!latest) return;
					await this.deleteCalendarEvent(
						userId,
						latest as any,
						latest.onto_event_sync ?? []
					);
				});
			} else {
				await this.deleteCalendarEvent(userId, existing, existing.onto_event_sync ?? []);
			}
		}

		return updated;
	}

	// ---------------------------------------------------------------------
	// Google mutation paths
	// ---------------------------------------------------------------------

	protected async buildCalendarEventDescription(
		event: OntoEventRow
	): Promise<string | undefined> {
		const existingDescription = (event.description ?? '').trim();
		const props = (event.props as Record<string, unknown>) ?? {};

		const taskId =
			event.owner_entity_type === 'task' && event.owner_entity_id
				? event.owner_entity_id
				: typeof props.task_id === 'string'
					? props.task_id
					: null;

		const projectId =
			event.project_id ?? (typeof props.project_id === 'string' ? props.project_id : null);

		const notes =
			existingDescription.length > 0 && !isProbablyGoogleCalendarLink(existingDescription)
				? existingDescription
				: '';

		if (!taskId) {
			return notes.length > 0 ? notes : undefined;
		}

		let resolvedProjectId = projectId;
		let taskTitle: string | null =
			typeof props.task_title === 'string' ? props.task_title : null;
		let taskDescription: string | null = null;
		let projectName: string | null = null;

		try {
			const { data: task, error } = await this.supabase
				.from('onto_tasks')
				.select('id, title, description, project_id')
				.eq('id', taskId)
				.is('deleted_at', null)
				.maybeSingle();

			if (!error && task) {
				taskTitle = task.title ?? taskTitle;
				taskDescription = task.description ?? null;
				resolvedProjectId = resolvedProjectId ?? task.project_id ?? null;
			}
		} catch (error) {
			console.warn(
				'[OntoEventSyncService] Failed to load task metadata for calendar sync:',
				error
			);
		}

		if (resolvedProjectId) {
			try {
				const { data: project, error } = await this.supabase
					.from('onto_projects')
					.select('id, name')
					.eq('id', resolvedProjectId)
					.is('deleted_at', null)
					.maybeSingle();

				if (!error && project?.name) {
					projectName = project.name;
				}
			} catch (error) {
				console.warn(
					'[OntoEventSyncService] Failed to load project metadata for calendar sync:',
					error
				);
			}
		}

		const taskUrl =
			resolvedProjectId && taskId
				? this.buildTaskUrl(resolvedProjectId, taskId)
				: typeof props.task_link === 'string'
					? this.buildAppUrlFromPath(props.task_link)
					: null;

		const projectUrl = resolvedProjectId ? this.buildProjectUrl(resolvedProjectId) : null;

		const sections: string[] = [];

		if (projectUrl) {
			if (!existingDescription.includes(projectUrl)) {
				sections.push(
					projectName
						? `Project: ${projectName}\n${projectUrl}`
						: `Project: ${projectUrl}`
				);
			}
		}

		if (taskUrl) {
			const marker = `[BuildOS Task #${taskId}]`;
			const taskUrlSansScheme = taskUrl.replace(/^https?:\/\//, '');
			const hasTaskReference =
				existingDescription.includes(marker) ||
				existingDescription.includes(taskUrl) ||
				existingDescription.includes(taskUrlSansScheme);

			if (!hasTaskReference) {
				const label = taskTitle ? `📋 View Task: ${taskTitle}` : '📋 View Task';
				const block = `${label}\n${taskUrl}\n${marker}`;
				sections.push(block);
			}
		}

		if (taskDescription?.trim()) {
			sections.push(taskDescription.trim());
		}

		if (notes.length > 0) {
			sections.push(notes);
		}

		const combined = sections.join('\n\n').trim();
		return combined.length > 0 ? combined : undefined;
	}

	protected async syncEventToCalendar(
		userId: string,
		event: OntoEventRow,
		options: {
			scope: CalendarScope;
			calendarId: string | null;
			calendarSourceId: string | null;
			createProjectCalendarIfMissing: boolean;
			expectedEventVersion?: string | null;
		}
	): Promise<CreateOntoEventResult> {
		const nowIso = new Date().toISOString();
		const sourceAware = this.usesSourceRouting(userId);
		if (options.calendarSourceId && !sourceAware) {
			await this.markEventSyncError(event.id, 'calendar_source_selection_not_enabled');
			return {
				event,
				sync: {
					success: false,
					error: 'Google Calendar source selection is not enabled'
				}
			};
		}
		if (!sourceAware) {
			const isConnected = await this.hasStoredCalendarCredential(userId);

			if (!isConnected) {
				await this.markEventSyncError(event.id, 'calendar_not_connected');
				return {
					event,
					sync: {
						success: false,
						error: 'Google Calendar is not connected'
					}
				};
			}
		}

		if (options.scope === 'project') {
			const projectCalendar = await this.resolveProjectCalendar(
				event.project_id ?? null,
				userId,
				options.createProjectCalendarIfMissing
			);

			if (!projectCalendar) {
				await this.markEventSyncError(event.id, 'project_calendar_missing');
				return {
					event,
					sync: {
						success: false,
						error: 'Project calendar not found'
					}
				};
			}

			if (projectCalendar.sync_enabled === false) {
				await this.markEventSyncError(event.id, 'project_calendar_sync_disabled');
				return {
					event,
					sync: {
						success: false,
						error: 'Project calendar sync is disabled'
					}
				};
			}

			try {
				const description = await this.buildCalendarEventDescription(event);
				let externalEventId: string;
				let eventLink: string | null;
				let calendarSourceId: string | null = projectCalendar.calendar_source_id;

				if (sourceAware) {
					const calendarEvent = await this.getCalendarWriter().createStandaloneEvent({
						userId,
						selector: { projectId: event.project_id ?? undefined },
						summary: event.title,
						description,
						start: new Date(event.start_at),
						end: new Date(event.end_at ?? event.start_at),
						timeZone: event.timezone ?? undefined,
						colorId: projectCalendar.color_id ?? undefined,
						recurrence: providerRecurrenceRules(event.recurrence),
						ontoEventId: event.id
					});
					externalEventId = calendarEvent.providerEventId;
					eventLink = calendarEvent.event.htmlLink ?? null;
					calendarSourceId = calendarEvent.calendarSourceId;
				} else {
					const calendarEvent = await this.requireLegacyCalendar().createStandaloneEvent(
						userId,
						{
							summary: event.title,
							description,
							start: new Date(event.start_at),
							end: new Date(event.end_at ?? event.start_at),
							timeZone: event.timezone ?? undefined,
							colorId: projectCalendar.color_id ?? undefined,
							calendar_id: projectCalendar.calendar_id
						}
					);
					externalEventId = calendarEvent.eventId;
					eventLink = calendarEvent.eventLink ?? null;

					const { error: mappingError } = await this.supabase
						.from('onto_event_sync')
						.upsert(
							{
								event_id: event.id,
								project_calendar_id: projectCalendar.id,
								user_id: userId,
								provider: 'google',
								external_event_id: calendarEvent.eventId,
								sync_status: 'synced',
								last_synced_at: nowIso
							},
							{
								onConflict: 'event_id,user_id,provider'
							}
						)
						.select('id')
						.single();
					if (mappingError) throw new Error(mappingError.message);
				}

				const nextProps = {
					...(event.props as Record<string, unknown>),
					external_event_id: externalEventId,
					external_calendar_id: projectCalendar.calendar_id,
					external_calendar_source_id: calendarSourceId,
					provider: 'google'
				};

				let eventUpdateQuery = this.supabase
					.from('onto_events')
					.update({
						props: nextProps,
						external_link: eventLink,
						last_synced_at: nowIso,
						sync_status: 'synced',
						sync_error: null
					})
					.eq('id', event.id);
				if (options.expectedEventVersion) {
					eventUpdateQuery = eventUpdateQuery.eq(
						'updated_at',
						options.expectedEventVersion
					);
				}

				const { data: updated } = await eventUpdateQuery.select('*').single();

				return {
					event: updated ?? event,
					sync: {
						success: true,
						provider: 'google',
						externalEventId,
						calendarId: projectCalendar.id,
						calendarSourceId
					}
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Calendar sync failed';
				await this.markEventSyncError(
					event.id,
					message,
					undefined,
					options.expectedEventVersion ?? undefined
				);
				return {
					event,
					sync: {
						success: false,
						error: message
					}
				};
			}
		}

		const googleCalendarId = options.calendarId ?? 'primary';
		try {
			const description = await this.buildCalendarEventDescription(event);
			let externalEventId: string;
			let providerCalendarId = googleCalendarId;
			let calendarSourceId: string | null = null;
			let eventLink: string | null;
			if (sourceAware) {
				const calendarEvent = await this.getCalendarWriter().createStandaloneEvent({
					userId,
					selector: options.calendarSourceId
						? { calendarSourceId: options.calendarSourceId }
						: options.calendarId
							? { calendarId: options.calendarId }
							: undefined,
					summary: event.title,
					description,
					start: new Date(event.start_at),
					end: new Date(event.end_at ?? event.start_at),
					timeZone: event.timezone ?? undefined,
					recurrence: providerRecurrenceRules(event.recurrence),
					ontoEventId: event.id
				});
				externalEventId = calendarEvent.providerEventId;
				providerCalendarId = calendarEvent.providerCalendarId;
				calendarSourceId = calendarEvent.calendarSourceId;
				eventLink = calendarEvent.event.htmlLink ?? null;
			} else {
				const calendarEvent = await this.requireLegacyCalendar().createStandaloneEvent(
					userId,
					{
						summary: event.title,
						description,
						start: new Date(event.start_at),
						end: new Date(event.end_at ?? event.start_at),
						timeZone: event.timezone ?? undefined,
						calendar_id: googleCalendarId
					}
				);
				externalEventId = calendarEvent.eventId;
				eventLink = calendarEvent.eventLink ?? null;
			}

			const nextProps = {
				...(event.props as Record<string, unknown>),
				external_event_id: externalEventId,
				external_calendar_id: providerCalendarId,
				external_calendar_source_id: calendarSourceId,
				provider: 'google'
			};

			let eventUpdateQuery = this.supabase
				.from('onto_events')
				.update({
					props: nextProps,
					external_link: eventLink,
					last_synced_at: nowIso,
					sync_status: 'synced',
					sync_error: null
				})
				.eq('id', event.id);
			if (options.expectedEventVersion) {
				eventUpdateQuery = eventUpdateQuery.eq('updated_at', options.expectedEventVersion);
			}

			const { data: updated } = await eventUpdateQuery.select('*').single();

			return {
				event: updated ?? event,
				sync: {
					success: true,
					provider: 'google',
					externalEventId,
					calendarId: providerCalendarId,
					calendarSourceId
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar sync failed';
			await this.markEventSyncError(
				event.id,
				message,
				undefined,
				options.expectedEventVersion ?? undefined
			);
			return {
				event,
				sync: {
					success: false,
					error: message
				}
			};
		}
	}

	protected async updateCalendarFromEvent(
		userId: string,
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<void> {
		const mapping = await this.resolveExternalMapping(userId, event, syncRows);
		if (!mapping) {
			if (event.project_id) {
				if (this.hasPriorExternalReference(event)) {
					await this.markEventSyncError(event.id, 'missing_project_sync_mapping');
					return;
				}
				const projectCalendar = await this.resolveProjectCalendar(
					event.project_id,
					userId,
					false
				);
				if (!projectCalendar || projectCalendar.sync_enabled === false) {
					return;
				}

				if (!this.usesSourceRouting(userId)) {
					const isConnected = await this.hasStoredCalendarCredential(userId);
					if (!isConnected) {
						return;
					}
				}

				await this.syncEventToCalendar(userId, event, {
					scope: 'project',
					calendarId: null,
					calendarSourceId: null,
					createProjectCalendarIfMissing: false,
					expectedEventVersion: event.updated_at ?? event.created_at
				});
			}
			return;
		}

		try {
			const description = await this.buildCalendarEventDescription(event);
			if (this.usesSourceRouting(userId)) {
				await this.getCalendarWriter().updateEvent({
					userId,
					providerEventId: mapping.externalEventId,
					selector: this.buildSourceAwareMutationSelector(event.id, mapping),
					requestBody: {
						summary: event.title,
						description,
						location: event.location ?? undefined,
						start: {
							dateTime: event.start_at,
							timeZone: event.timezone ?? undefined
						},
						end: {
							dateTime: event.end_at ?? event.start_at,
							timeZone: event.timezone ?? undefined
						},
						recurrence: providerRecurrenceRules(event.recurrence)
					}
				});
			} else {
				await this.requireLegacyCalendar().updateCalendarEvent(userId, {
					event_id: mapping.externalEventId,
					calendar_id: mapping.calendarId,
					start_time: event.start_at,
					end_time: event.end_at ?? undefined,
					summary: event.title,
					description,
					location: event.location ?? undefined,
					timeZone: event.timezone ?? undefined
				});
			}

			const nowIso = new Date().toISOString();
			let syncRowId = mapping.syncRowId;
			if (!syncRowId && event.project_id) {
				syncRowId = await this.repairProjectSyncRow({
					userId,
					event,
					externalEventId: mapping.externalEventId,
					calendarId: mapping.calendarId,
					timestamp: nowIso
				});
			}
			await this.markEventSynced(event.id, nowIso, syncRowId);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar update failed';
			await this.markEventSyncError(event.id, message, mapping.syncRowId);
		}
	}

	protected async deleteCalendarEvent(
		userId: string,
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<void> {
		const mapping = await this.resolveExternalMapping(userId, event, syncRows);
		if (!mapping) return;

		try {
			if (this.usesSourceRouting(userId)) {
				await this.getCalendarWriter().deleteEvent({
					userId,
					providerEventId: mapping.externalEventId,
					selector: this.buildSourceAwareMutationSelector(event.id, mapping),
					sendUpdates: 'none'
				});
			} else {
				await this.requireLegacyCalendar().deleteCalendarEvent(userId, {
					event_id: mapping.externalEventId,
					calendar_id: mapping.calendarId,
					send_notifications: false,
					sendUpdates: 'none'
				});
			}

			const nowIso = new Date().toISOString();
			await this.markEventSynced(event.id, nowIso, mapping.syncRowId, 'cancelled');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar delete failed';
			await this.logGoogleDeleteFailure({
				error,
				userId,
				eventId: event.id,
				projectId: event.project_id,
				externalEventId: mapping.externalEventId,
				calendarId: mapping.calendarId,
				syncRowId: mapping.syncRowId,
				phase: 'inline_delete',
				reason: message
			});
			await this.markEventSyncError(event.id, message, mapping.syncRowId);
		}
	}

	// ---------------------------------------------------------------------
	// Mapping resolution and repair
	// ---------------------------------------------------------------------

	protected async resolveExternalMapping(
		userId: string,
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<ExternalEventMapping | null> {
		if (syncRows.length > 0) {
			const userCandidates = syncRows.filter(
				(syncRow) => syncRow.user_id === userId || syncRow.user_id == null
			);

			for (const syncRow of userCandidates) {
				if (syncRow.calendar_source_id && syncRow.external_calendar_id) {
					return {
						externalEventId: syncRow.external_event_id,
						calendarId: syncRow.external_calendar_id,
						calendarSourceId: syncRow.calendar_source_id,
						syncRowId: syncRow.id
					};
				}
				if (!syncRow.project_calendar_id) continue;
				const calendar = await this.supabase
					.from('project_calendars')
					.select('calendar_id, calendar_source_id, user_id')
					.eq('id', syncRow.project_calendar_id)
					.maybeSingle();

				if (calendar.data?.calendar_id && calendar.data.user_id === userId) {
					return {
						externalEventId: syncRow.external_event_id,
						calendarId: calendar.data.calendar_id,
						calendarSourceId: calendar.data.calendar_source_id ?? undefined,
						syncRowId: syncRow.id
					};
				}
			}
		}

		const props = (event.props as Record<string, unknown>) ?? {};
		const externalEventId =
			typeof props.external_event_id === 'string' ? props.external_event_id.trim() : '';
		const externalCalendarId =
			typeof props.external_calendar_id === 'string' ? props.external_calendar_id.trim() : '';
		const externalCalendarSourceId =
			typeof props.external_calendar_source_id === 'string'
				? props.external_calendar_source_id.trim()
				: '';
		const linkMapping = parseGoogleEventMappingFromExternalLink(event.external_link);

		if (event.project_id) {
			const recoveredEventId = externalEventId || linkMapping?.externalEventId;
			const recoveredCalendarId = externalCalendarId || linkMapping?.calendarId;
			if (recoveredEventId && recoveredCalendarId) {
				const projectCalendar = this.usesSourceRouting(userId)
					? await this.resolveProjectCalendar(event.project_id, userId, false)
					: null;
				return {
					externalEventId: recoveredEventId,
					calendarId: recoveredCalendarId,
					calendarSourceId:
						externalCalendarSourceId ||
						(projectCalendar?.calendar_id === recoveredCalendarId
							? (projectCalendar.calendar_source_id ?? undefined)
							: undefined)
				};
			}

			if (recoveredEventId) {
				const projectCalendar = await this.resolveProjectCalendar(
					event.project_id,
					userId,
					false
				);
				if (projectCalendar?.calendar_id) {
					return {
						externalEventId: recoveredEventId,
						calendarId: projectCalendar.calendar_id,
						calendarSourceId: projectCalendar.calendar_source_id ?? undefined
					};
				}
			}

			return null;
		}

		if (externalEventId && externalCalendarId) {
			return {
				externalEventId,
				calendarId: externalCalendarId,
				calendarSourceId: externalCalendarSourceId || undefined
			};
		}

		if (linkMapping) {
			return linkMapping;
		}

		return null;
	}

	protected buildSourceAwareMutationSelector(
		eventId: string,
		mapping: ExternalEventMapping
	): GoogleCalendarMutationSelector {
		if (mapping.syncRowId) {
			return { ontoEventId: eventId };
		}
		if (mapping.calendarSourceId) {
			return { calendarSourceId: mapping.calendarSourceId };
		}

		// Legacy ontology imports can have only the provider calendar ID in props.
		// The source-aware writer resolves this ID to exactly one owned source and
		// rejects ambiguous matches instead of silently choosing the default account.
		return { calendarId: mapping.calendarId };
	}

	protected hasPriorExternalReference(event: OntoEventRow): boolean {
		const props = (event.props as Record<string, unknown> | null) ?? {};
		const hasPropEventId =
			typeof props.external_event_id === 'string' &&
			props.external_event_id.trim().length > 0;
		const hasPropCalendarId =
			typeof props.external_calendar_id === 'string' &&
			props.external_calendar_id.trim().length > 0;
		const hasLinkMapping = Boolean(
			parseGoogleEventMappingFromExternalLink(event.external_link)
		);
		const hasSyncTimestamp =
			typeof event.last_synced_at === 'string' && event.last_synced_at.trim().length > 0;

		return (
			hasPropEventId ||
			hasPropCalendarId ||
			hasLinkMapping ||
			hasSyncTimestamp ||
			event.sync_status === 'synced'
		);
	}

	protected async repairProjectSyncRow(params: {
		userId: string;
		event: OntoEventRow;
		externalEventId: string;
		calendarId: string;
		timestamp: string;
	}): Promise<string | undefined> {
		const { userId, event, externalEventId, calendarId, timestamp } = params;
		if (!event.project_id) return undefined;

		const { data: projectCalendar } = await this.supabase
			.from('project_calendars')
			.select('id, calendar_id, calendar_source_id')
			.eq('project_id', event.project_id)
			.eq('user_id', userId)
			.maybeSingle();

		if (!projectCalendar?.id || !projectCalendar.calendar_id) {
			return undefined;
		}

		if (projectCalendar.calendar_id !== calendarId) {
			return undefined;
		}

		const { data: repaired } = await this.supabase
			.from('onto_event_sync')
			.upsert(
				{
					event_id: event.id,
					project_calendar_id: projectCalendar.id,
					calendar_source_id: projectCalendar.calendar_source_id,
					user_id: userId,
					provider: 'google',
					external_event_id: externalEventId,
					external_calendar_id: calendarId,
					sync_status: 'synced',
					sync_error: null,
					last_synced_at: timestamp
				},
				{
					onConflict: 'event_id,user_id,provider'
				}
			)
			.select('id')
			.maybeSingle();

		return repaired?.id;
	}

	protected async resolveProjectCalendar(
		projectId: string | null,
		userId: string,
		createIfMissing: boolean
	): Promise<ProjectCalendarRow | null> {
		if (!projectId) return null;

		const { data: existing, error } = await this.supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', projectId)
			.eq('user_id', userId)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw new Error(error.message);
		}

		if (existing) return existing;
		if (!createIfMissing) return null;

		return this.getProjectCalendarService(userId).ensureProjectCalendarRecord(
			projectId,
			userId
		);
	}

	// ---------------------------------------------------------------------
	// Project fan-out targets
	// ---------------------------------------------------------------------

	protected async getProjectCalendarSyncMode(
		projectId: string
	): Promise<ProjectCalendarSyncMode> {
		return this.projectCalendarService.getProjectCalendarSyncMode(projectId);
	}

	protected async resolveProjectSyncTargets(
		projectId: string,
		triggeredByUserId: string
	): Promise<{ mode: ProjectCalendarSyncMode; targetUserIds: string[] }> {
		const mode = await this.getProjectCalendarSyncMode(projectId);
		if (mode === 'actor_projection') {
			return {
				mode,
				targetUserIds: [triggeredByUserId]
			};
		}

		const { data: mappings, error } = await this.supabase
			.from('project_calendars')
			.select('user_id')
			.eq('project_id', projectId)
			.or('sync_enabled.is.null,sync_enabled.eq.true');

		if (error) {
			throw new Error(error.message);
		}

		const targetUserIds = Array.from(
			new Set((mappings ?? []).map((mapping) => mapping.user_id).filter(Boolean))
		);

		return {
			mode,
			targetUserIds: targetUserIds.length > 0 ? targetUserIds : [triggeredByUserId]
		};
	}

	protected isStaleEventVersion(
		expectedEventUpdatedAt: string | null | undefined,
		currentEventUpdatedAt: string | null | undefined
	): boolean {
		if (!expectedEventUpdatedAt || !currentEventUpdatedAt) {
			return false;
		}

		const expectedTimestamp = Date.parse(expectedEventUpdatedAt);
		const currentTimestamp = Date.parse(currentEventUpdatedAt);
		if (Number.isNaN(expectedTimestamp) || Number.isNaN(currentTimestamp)) {
			return false;
		}

		return expectedTimestamp < currentTimestamp;
	}

	protected isGoogleNotFoundError(error: unknown): boolean {
		const message = error instanceof Error ? error.message.toLowerCase() : '';
		return message.includes('not found') || message.includes('404');
	}

	/**
	 * Duck-typed on purpose: `GoogleOAuthConnectionError` is a web-only class, so
	 * the shared check matches on the same `name`/`code` shape both hosts throw.
	 */
	protected isCalendarConnectionError(error: unknown): boolean {
		if (!error || typeof error !== 'object') return false;
		const candidate = error as {
			name?: unknown;
			code?: unknown;
			requiresReconnection?: unknown;
		};
		return (
			(candidate.name === 'GoogleOAuthConnectionError' &&
				candidate.requiresReconnection === true) ||
			(candidate.name === 'GoogleCalendarConnectionError' &&
				(candidate.code === 'reconnect_required' ||
					candidate.code === 'connection_not_found'))
		);
	}

	// ---------------------------------------------------------------------
	// Project sync job processing
	// ---------------------------------------------------------------------

	async processProjectEventSyncJob(input: {
		action: ProjectEventSyncAction;
		eventId: string;
		projectId: string;
		targetUserId: string;
		createCalendarIfMissing?: boolean;
		expectedEventUpdatedAt?: string;
	}): Promise<{
		outcome: 'synced' | 'deleted' | 'skipped';
		reason: string;
	}> {
		const event = await this.getEvent(input.eventId, input.targetUserId);
		if (!event) {
			return {
				outcome: 'skipped',
				reason: 'event_not_found'
			};
		}

		if (!event.project_id || event.project_id !== input.projectId) {
			return {
				outcome: 'skipped',
				reason: 'project_mismatch'
			};
		}
		const eventVersion = event.updated_at ?? event.created_at;
		const isRetryingStillDeletedEvent = input.action === 'delete' && Boolean(event.deleted_at);
		if (
			this.isStaleEventVersion(input.expectedEventUpdatedAt, eventVersion) &&
			!isRetryingStillDeletedEvent
		) {
			return {
				outcome: 'skipped',
				reason: 'stale_event_version'
			};
		}

		const syncRows = event.onto_event_sync ?? [];
		const shouldDelete = input.action === 'delete' || Boolean(event.deleted_at);
		if (shouldDelete) {
			const mapping = await this.resolveExternalMapping(input.targetUserId, event, syncRows);
			if (!mapping) {
				return {
					outcome: 'skipped',
					reason: 'no_external_mapping'
				};
			}

			try {
				if (this.usesSourceRouting(input.targetUserId)) {
					await this.getCalendarWriter().deleteEvent({
						userId: input.targetUserId,
						providerEventId: mapping.externalEventId,
						selector: this.buildSourceAwareMutationSelector(event.id, mapping),
						sendUpdates: 'none'
					});
				} else {
					await this.requireLegacyCalendar().deleteCalendarEvent(input.targetUserId, {
						event_id: mapping.externalEventId,
						calendar_id: mapping.calendarId,
						send_notifications: false,
						sendUpdates: 'none'
					});
				}

				const nowIso = new Date().toISOString();
				await this.markEventSynced(
					event.id,
					nowIso,
					mapping.syncRowId,
					'cancelled',
					eventVersion
				);
				return {
					outcome: 'deleted',
					reason: 'deleted_external_event'
				};
			} catch (error) {
				if (this.isCalendarConnectionError(error)) {
					const message =
						error instanceof Error ? error.message : 'Google Calendar is not connected';
					await this.markEventSyncError(
						event.id,
						message,
						mapping.syncRowId,
						eventVersion
					);
					return {
						outcome: 'skipped',
						reason: 'calendar_not_connected'
					};
				}

				if (this.isGoogleNotFoundError(error)) {
					const nowIso = new Date().toISOString();
					await this.markEventSynced(
						event.id,
						nowIso,
						mapping.syncRowId,
						'cancelled',
						eventVersion
					);
					return {
						outcome: 'deleted',
						reason: 'external_event_already_missing'
					};
				}

				const message = error instanceof Error ? error.message : 'Calendar delete failed';
				await this.logGoogleDeleteFailure({
					error,
					userId: input.targetUserId,
					eventId: event.id,
					projectId: event.project_id,
					externalEventId: mapping.externalEventId,
					calendarId: mapping.calendarId,
					syncRowId: mapping.syncRowId,
					phase: 'project_sync_job_delete',
					reason: message,
					metadata: {
						action: input.action,
						expectedEventUpdatedAt: input.expectedEventUpdatedAt ?? null,
						currentEventUpdatedAt: eventVersion ?? null
					}
				});
				await this.markEventSyncError(event.id, message, mapping.syncRowId, eventVersion);
				throw error instanceof Error ? error : new Error(message);
			}
		}

		const mapping = await this.resolveExternalMapping(input.targetUserId, event, syncRows);
		if (!mapping) {
			if (this.hasPriorExternalReference(event)) {
				await this.markEventSyncError(
					event.id,
					'missing_project_sync_mapping',
					undefined,
					eventVersion
				);
				return {
					outcome: 'skipped',
					reason: 'missing_project_sync_mapping'
				};
			}

			if (!this.usesSourceRouting(input.targetUserId)) {
				const isConnected = await this.hasStoredCalendarCredential(input.targetUserId);
				if (!isConnected) {
					return {
						outcome: 'skipped',
						reason: 'calendar_not_connected'
					};
				}
			}

			const projectCalendar = await this.resolveProjectCalendar(
				event.project_id,
				input.targetUserId,
				input.createCalendarIfMissing ?? false
			);
			if (!projectCalendar || projectCalendar.sync_enabled === false) {
				return {
					outcome: 'skipped',
					reason: 'project_calendar_unavailable'
				};
			}

			const syncResult = await this.syncEventToCalendar(input.targetUserId, event, {
				scope: 'project',
				calendarId: null,
				calendarSourceId: null,
				createProjectCalendarIfMissing: input.createCalendarIfMissing ?? false,
				expectedEventVersion: eventVersion
			});

			if (!syncResult.sync?.success) {
				throw new Error(syncResult.sync?.error || 'Calendar sync failed');
			}

			return {
				outcome: 'synced',
				reason: 'created_external_event'
			};
		}

		try {
			const description = await this.buildCalendarEventDescription(event);
			if (this.usesSourceRouting(input.targetUserId)) {
				await this.getCalendarWriter().updateEvent({
					userId: input.targetUserId,
					providerEventId: mapping.externalEventId,
					selector: this.buildSourceAwareMutationSelector(event.id, mapping),
					requestBody: {
						summary: event.title,
						description,
						location: event.location ?? undefined,
						start: {
							dateTime: event.start_at,
							timeZone: event.timezone ?? undefined
						},
						end: {
							dateTime: event.end_at ?? event.start_at,
							timeZone: event.timezone ?? undefined
						}
					}
				});
			} else {
				await this.requireLegacyCalendar().updateCalendarEvent(input.targetUserId, {
					event_id: mapping.externalEventId,
					calendar_id: mapping.calendarId,
					start_time: event.start_at,
					end_time: event.end_at ?? undefined,
					summary: event.title,
					description,
					location: event.location ?? undefined,
					timeZone: event.timezone ?? undefined
				});
			}

			const nowIso = new Date().toISOString();
			let syncRowId = mapping.syncRowId;
			if (!syncRowId) {
				syncRowId = await this.repairProjectSyncRow({
					userId: input.targetUserId,
					event,
					externalEventId: mapping.externalEventId,
					calendarId: mapping.calendarId,
					timestamp: nowIso
				});
			}
			await this.markEventSynced(event.id, nowIso, syncRowId, 'synced', eventVersion);
			return {
				outcome: 'synced',
				reason: 'updated_external_event'
			};
		} catch (error) {
			if (this.isCalendarConnectionError(error)) {
				const message =
					error instanceof Error ? error.message : 'Google Calendar is not connected';
				await this.markEventSyncError(event.id, message, mapping.syncRowId, eventVersion);
				return {
					outcome: 'skipped',
					reason: 'calendar_not_connected'
				};
			}

			if (this.isGoogleNotFoundError(error)) {
				await this.markEventSyncError(
					event.id,
					'external_event_not_found',
					mapping.syncRowId,
					eventVersion
				);
				return {
					outcome: 'skipped',
					reason: 'external_event_not_found'
				};
			}

			const message = error instanceof Error ? error.message : 'Calendar update failed';
			await this.markEventSyncError(event.id, message, mapping.syncRowId, eventVersion);
			throw error instanceof Error ? error : new Error(message);
		}
	}

	// ---------------------------------------------------------------------
	// Sync bookkeeping
	// ---------------------------------------------------------------------

	protected async markEventSynced(
		eventId: string,
		timestamp: string,
		syncRowId?: string,
		status: string = 'synced',
		expectedEventVersion?: string
	): Promise<void> {
		let eventUpdateQuery = this.supabase
			.from('onto_events')
			.update({
				last_synced_at: timestamp,
				sync_status: status,
				sync_error: null
			})
			.eq('id', eventId);
		if (expectedEventVersion) {
			eventUpdateQuery = eventUpdateQuery.eq('updated_at', expectedEventVersion);
		}
		await eventUpdateQuery;

		if (syncRowId) {
			await this.supabase
				.from('onto_event_sync')
				.update({
					last_synced_at: timestamp,
					sync_status: status,
					sync_error: null
				})
				.eq('id', syncRowId);
		}
	}

	protected async markEventSyncError(
		eventId: string,
		message: string,
		syncRowId?: string,
		expectedEventVersion?: string
	): Promise<void> {
		const trimmed = message?.slice(0, 500) ?? 'Calendar sync failed';
		let eventUpdateQuery = this.supabase
			.from('onto_events')
			.update({
				sync_status: 'failed',
				sync_error: trimmed
			})
			.eq('id', eventId);
		if (expectedEventVersion) {
			eventUpdateQuery = eventUpdateQuery.eq('updated_at', expectedEventVersion);
		}
		await eventUpdateQuery;

		if (syncRowId) {
			await this.supabase
				.from('onto_event_sync')
				.update({
					sync_status: 'failed',
					sync_error: trimmed
				})
				.eq('id', syncRowId);
		}
	}

	protected async syncTaskFromEvent(event: OntoEventRow): Promise<void> {
		if (event.owner_entity_type !== 'task' || !event.owner_entity_id) {
			return;
		}

		const props = (event.props as Record<string, unknown>) ?? {};
		const kind = props.task_event_kind as TaskEventKind | undefined;
		if (!kind) {
			return;
		}

		if (props.task_id && props.task_id !== event.owner_entity_id) {
			return;
		}

		const { data: task, error } = await this.supabase
			.from('onto_tasks')
			.select('id, start_at, due_at')
			.eq('id', event.owner_entity_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (error || !task) {
			return;
		}

		const startAt = event.start_at ? new Date(event.start_at) : null;
		const endAt = event.end_at ? new Date(event.end_at) : null;

		if (startAt && Number.isNaN(startAt.getTime())) {
			return;
		}
		if (endAt && Number.isNaN(endAt.getTime())) {
			return;
		}

		const updates: Partial<OntoTaskRow> = {};

		if (kind === 'range') {
			if (!startAt || !endAt || endAt < startAt) {
				return;
			}
			updates.start_at = startAt.toISOString();
			updates.due_at = endAt.toISOString();
		} else if (kind === 'start') {
			if (!startAt) {
				return;
			}
			updates.start_at = startAt.toISOString();
		} else if (kind === 'due') {
			const due = endAt ?? startAt;
			if (!due) {
				return;
			}
			updates.due_at = due.toISOString();
		}

		if (updates.start_at === task.start_at && updates.due_at === task.due_at) {
			return;
		}

		if (updates.start_at === task.start_at) {
			delete updates.start_at;
		}
		if (updates.due_at === task.due_at) {
			delete updates.due_at;
		}

		if (Object.keys(updates).length === 0) {
			return;
		}

		updates.updated_at = new Date().toISOString();

		const { error: updateError } = await this.supabase
			.from('onto_tasks')
			.update(updates)
			.eq('id', task.id);

		if (updateError) {
			throw new Error(updateError.message);
		}
	}
}

export { DEFAULT_PROJECT_CALENDAR_SYNC_MODE };
export type { ProjectCalendarSyncMode };
