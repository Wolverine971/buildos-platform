// apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts
//
// Worker adapter for the four reviewed calendar WRITES — `create_calendar_event`,
// `update_calendar_event`, `delete_calendar_event`, `set_project_calendar`. It is
// the write twin of `calendar-read-port.ts`: the same source-aware provider
// services (`createWorkerGoogleCalendarServices`), the same lazy construction,
// the same "no legacy single-OAuth fallback" rule.
//
// Four properties this file must keep:
//
//  1. Google is called DIRECTLY, with no queue hop. `OntoEventSyncService` is
//     constructed WITHOUT `enqueueSync` and WITHOUT `legacyCalendar`, so a
//     project-scoped write falls through to the synchronous Google path
//     (A4 contract).
//  2. Nothing here reads OAuth environment variables at construction time. A
//     worker deployed without the Calendar OAuth env still boots; the write then
//     reports `not_configured` as structured data, never a boot crash.
//  3. Every write authorizes explicitly. The worker uses a service-role client,
//     so RLS grants nothing: `userId` comes from the trusted turn claim, project
//     targets go through the access adapter before `project_calendars` /
//     `onto_events` are touched, and a user-scope event must be owned by the
//     turn's actor.
//  4. Attendees and reminders are NEVER sent to Google. The reviewed argument
//     table cannot express them and the table normalizer strips them; this file
//     never builds either field.
//
// A 401 / `invalid_grant` from the provider is not a thrown tool error. It comes
// back as `{ ok: false, error_code: 'reconnect_required', connection_id }` with
// the same `client_action` envelope the Gmail connection handoff uses, and the
// ontology row survives with `synced: false` and `sync_error` recorded.

import { GoogleCalendarConnectionError } from '@buildos/shared-agent-ops/calendar/google-calendar-runtime';
import {
	type OntoEventCalendarWriter,
	OntoEventSyncService
} from '@buildos/shared-agent-ops/calendar/onto-event-sync.service';
import { ProjectCalendarService } from '@buildos/shared-agent-ops/calendar/project-calendar.service';
import type { Database } from '@buildos/shared-types';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromZonedTime } from 'date-fns-tz';
import { AgenticChatToolAccessDeniedError } from '@buildos/agentic-chat-runtime/tools';
import { knownFailure, uncertainFailure } from '../mutationAdapterBoundary';
import { WorkerAgenticChatToolAccessAdapter } from '../workerAccessAdapter';
import {
	type WorkerGoogleCalendarServicesOptions,
	createWorkerGoogleCalendarServices
} from './calendar-services';

type WorkerGoogleCalendarServices = ReturnType<typeof createWorkerGoogleCalendarServices>;

export type AgenticChatCalendarWriteToolNameV1 =
	| 'create_calendar_event'
	| 'update_calendar_event'
	| 'delete_calendar_event'
	| 'set_project_calendar';

export type AgenticChatCalendarWriteRequestV1 = {
	toolName: string;
	userId: string;
	sessionId: string | null;
	/** Project fence the reviewed row already resolved, or null when unfenced. */
	projectId: string | null;
	arguments: Record<string, unknown>;
};

/** Runner seam for the `calendar_service` rows of the reviewed mutation table. */
export type AgenticChatCalendarWritePortV1 = {
	execute(request: AgenticChatCalendarWriteRequestV1): Promise<Record<string, unknown>>;
};

export type AgenticChatCalendarScopeV1 = 'user' | 'project' | 'calendar_id';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}(:?\d{2})?)$/i;
const DEFAULT_TIMEZONE = 'UTC';
const CALENDAR_SCOPES = new Set<AgenticChatCalendarScopeV1>(['user', 'project', 'calendar_id']);
const GOOGLE_COLOR_IDS = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']);

/**
 * Provider failures that mean "this Google account must be reconnected before
 * any write can land", rather than "the write failed". `not_configured` is kept
 * separate: it is a deployment gap, not a user action.
 */
const RECONNECT_REASON_CODES = new Set([
	'reconnect_required',
	'refresh_token_required',
	'connection_not_found',
	'source_not_found'
]);

export type AgenticChatCalendarWriteErrorCodeV1 = 'reconnect_required' | 'not_configured';

/**
 * Classify a provider failure without depending on `instanceof` surviving a
 * bundle boundary, the way `calendar-read-port.ts` already does.
 */
export function calendarWriteFailureCode(
	error: unknown
): AgenticChatCalendarWriteErrorCodeV1 | null {
	const candidate = error as
		| { code?: unknown; name?: unknown; message?: unknown; status?: unknown }
		| null
		| undefined;
	const code =
		error instanceof GoogleCalendarConnectionError
			? error.code
			: typeof candidate?.code === 'string' &&
				  candidate.name === 'GoogleCalendarConnectionError'
				? candidate.code
				: null;
	if (code === 'not_configured') return 'not_configured';
	if (code !== null && RECONNECT_REASON_CODES.has(code)) return 'reconnect_required';

	// Raw provider rejections: a 401 or an `invalid_grant` body both mean the
	// stored grant is dead, whoever threw it.
	const status = candidate?.status;
	const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
	if (
		status === 401 ||
		(error as { response?: { status?: unknown } })?.response?.status === 401
	) {
		return 'reconnect_required';
	}
	if (message.includes('invalid_grant') || message.includes('expired or revoked')) {
		return 'reconnect_required';
	}
	return null;
}

export type WorkerAgenticChatCalendarWritePortOptions = {
	/** Test seam: supply the composed provider services instead of building them. */
	services?: () => WorkerGoogleCalendarServices;
	serviceOptions?: WorkerGoogleCalendarServicesOptions;
	/** Test seam: supply the shared ontology-event write service. */
	createEventSync?: (input: {
		client: SupabaseClient<Database>;
		services: WorkerGoogleCalendarServices;
		calendarWriter: OntoEventCalendarWriter;
	}) => OntoEventSyncService;
	/** Test seam: supply the shared project-calendar write service. */
	createProjectCalendarService?: (input: {
		client: SupabaseClient<Database>;
		services: WorkerGoogleCalendarServices;
	}) => ProjectCalendarService;
	/** Test seam: supply the project/actor authorization port. */
	createAccess?: (input: {
		client: SupabaseClient<Database>;
		userId: string;
	}) => WorkerAgenticChatToolAccessAdapter;
	appBaseUrl?: string;
};

/**
 * One port instance serves the whole worker process; every provider service is
 * constructed per execution, never cached across turns or users.
 */
export function createWorkerAgenticChatCalendarWritePort(input: {
	client: SupabaseClient<Database>;
	options?: WorkerAgenticChatCalendarWritePortOptions;
}): AgenticChatCalendarWritePortV1 {
	const { client } = input;
	const options = input.options ?? {};

	return {
		execute(request: AgenticChatCalendarWriteRequestV1): Promise<Record<string, unknown>> {
			const execution = new CalendarWriteExecution(client, options, request);
			switch (request.toolName) {
				case 'create_calendar_event':
					return execution.createEvent();
				case 'update_calendar_event':
					return execution.updateEvent();
				case 'delete_calendar_event':
					return execution.deleteEvent();
				case 'set_project_calendar':
					return execution.setProjectCalendar();
				default:
					return Promise.reject(
						knownFailure(
							'mutation_adapter_not_allowlisted',
							`No calendar write is enabled for ${request.toolName}`
						)
					);
			}
		}
	};
}

/** One turn-scoped calendar write. Provider services are built on first use. */
class CalendarWriteExecution {
	private services: WorkerGoogleCalendarServices | null = null;
	private access: WorkerAgenticChatToolAccessAdapter | null = null;
	private eventSync: OntoEventSyncService | null = null;
	private projectCalendars: ProjectCalendarService | null = null;
	/** Set by the writer proxy when a provider call failed on the connection. */
	private capturedFailure: AgenticChatCalendarWriteErrorCodeV1 | null = null;

	constructor(
		private readonly client: SupabaseClient<Database>,
		private readonly options: WorkerAgenticChatCalendarWritePortOptions,
		private readonly request: AgenticChatCalendarWriteRequestV1
	) {}

	// -----------------------------------------------------------------
	// Lazily constructed dependencies
	// -----------------------------------------------------------------

	private requireServices(): WorkerGoogleCalendarServices {
		this.services ??= this.options.services
			? this.options.services()
			: createWorkerGoogleCalendarServices(
					this.client as unknown as TypedSupabaseClient,
					this.options.serviceOptions
				);
		return this.services;
	}

	private requireAccess(): WorkerAgenticChatToolAccessAdapter {
		this.access ??= this.options.createAccess
			? this.options.createAccess({ client: this.client, userId: this.request.userId })
			: new WorkerAgenticChatToolAccessAdapter({
					client: this.client,
					userId: this.request.userId
				});
		return this.access;
	}

	/**
	 * The shared ontology write service, wired for direct Google writes: a
	 * source-aware writer, the source-aware project-calendar gateway, and NO
	 * `enqueueSync` / `legacyCalendar`, so project scope writes synchronously.
	 */
	private requireEventSync(): OntoEventSyncService {
		if (this.eventSync) return this.eventSync;
		const services = this.requireServices();
		const calendarWriter = this.captureConnectionFailures(services.write);
		this.eventSync = this.options.createEventSync
			? this.options.createEventSync({ client: this.client, services, calendarWriter })
			: new OntoEventSyncService(this.client as unknown as TypedSupabaseClient, {
					calendarWriter,
					sourceProjectCalendarService: this.requireProjectCalendars(),
					appBaseUrl: this.options.appBaseUrl ?? process.env.PUBLIC_APP_URL
				});
		return this.eventSync;
	}

	private requireProjectCalendars(): ProjectCalendarService {
		if (this.projectCalendars) return this.projectCalendars;
		const services = this.requireServices();
		this.projectCalendars = this.options.createProjectCalendarService
			? this.options.createProjectCalendarService({ client: this.client, services })
			: new ProjectCalendarService(this.client as unknown as TypedSupabaseClient, {
					projectResourceService: services.projectResources
				});
		return this.projectCalendars;
	}

	/**
	 * `OntoEventSyncService` swallows every Google failure and records it on the
	 * row, which is what keeps the ontology write durable. Wrapping the writer is
	 * how the tool still learns that the failure was a dead grant rather than a
	 * transient provider error.
	 */
	private captureConnectionFailures(writer: OntoEventCalendarWriter): OntoEventCalendarWriter {
		const capture = <TArgs extends unknown[], TResult>(
			fn: (...args: TArgs) => Promise<TResult>
		) => {
			return async (...args: TArgs): Promise<TResult> => {
				try {
					return await fn(...args);
				} catch (error) {
					this.capturedFailure ??= calendarWriteFailureCode(error);
					throw error;
				}
			};
		};
		return {
			createStandaloneEvent: capture(writer.createStandaloneEvent.bind(writer)),
			updateEvent: capture(writer.updateEvent.bind(writer)),
			deleteEvent: capture(writer.deleteEvent.bind(writer))
		};
	}

	// -----------------------------------------------------------------
	// create_calendar_event
	// -----------------------------------------------------------------

	async createEvent(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const title = requireText(args.title, 'title');
		const timezone = await this.resolveTimezone(optionalText(args.timezone, 'timezone'));
		const start = this.normalizeDateTime(requireText(args.start_at, 'start_at'), timezone, {
			field: 'start_at',
			boundary: 'start'
		});
		const rawEnd = optionalText(args.end_at, 'end_at');
		const end = rawEnd
			? this.normalizeDateTime(rawEnd, timezone, { field: 'end_at', boundary: 'end' })
			: null;
		if (end && Date.parse(end.iso) <= Date.parse(start.iso)) {
			throw knownFailure(
				'create_calendar_event_invalid_arguments',
				'end_at must be after start_at'
			);
		}

		let projectId = optionalUuidArg(args.project_id, 'project_id');
		const taskId = optionalUuidArg(args.task_id, 'task_id');
		let task: { id: string; title: string; projectId: string } | null = null;
		if (taskId) {
			task = await this.resolveTask(taskId, projectId);
			projectId = task.projectId;
		}
		this.assertFenceAgrees(projectId);

		const scope = resolveScope(args.calendar_scope, projectId ? 'project' : 'user');
		if (scope === 'project' && !projectId) {
			throw knownFailure(
				'create_calendar_event_invalid_arguments',
				'project_id is required when calendar_scope is project'
			);
		}
		const calendarId = normalizeCalendarId(args.calendar_id);
		if (scope === 'calendar_id' && !calendarId) {
			throw knownFailure(
				'create_calendar_event_invalid_arguments',
				'calendar_id must be a valid Google Calendar ID'
			);
		}
		const calendarSourceId = optionalUuidArg(args.calendar_source_id, 'calendar_source_id');

		// Authorization before anything touches onto_events.
		if (projectId) await this.assertProjectWriteAccess(projectId);
		const actorId = await this.requireAccess().getActorId();

		const owner: { type: 'task' | 'project' | 'actor'; id: string | null } = task
			? { type: 'task', id: task.id }
			: projectId
				? { type: 'project', id: projectId }
				: { type: 'actor', id: actorId };
		const inferredTimezone = !start.hadExplicitTimezone || Boolean(end?.assumedTimezone);
		const created = await this.runProvider('create_calendar_event', () =>
			this.requireEventSync().createEvent(this.request.userId, {
				orgId: null,
				projectId,
				owner,
				typeKey: task ? 'event.task_work' : 'event.general',
				title,
				description: optionalText(args.description, 'description') ?? null,
				location: optionalText(args.location, 'location') ?? null,
				startAt: start.iso,
				endAt: end?.iso ?? null,
				timezone:
					optionalText(args.timezone, 'timezone') || inferredTimezone
						? timezone
						: undefined,
				createdBy: actorId,
				props: task
					? {
							task_id: task.id,
							task_title: task.title,
							project_id: task.projectId,
							task_event_kind: end ? 'range' : 'start'
						}
					: undefined,
				calendarScope: scope,
				calendarId,
				calendarSourceId,
				syncToCalendar: optionalBoolean(args.sync_to_calendar, 'sync_to_calendar'),
				activityLog: {
					changeSource: 'chat',
					...(this.request.sessionId ? { chatSessionId: this.request.sessionId } : {}),
					actorContext: { changedByActorId: actorId }
				}
			})
		);

		const eventId = typeof created?.event?.id === 'string' ? created.event.id : null;
		if (!eventId) {
			// A connection failure raised before the ontology row was written leaves
			// nothing to report but the reason.
			const captured = this.capturedProviderOutcome();
			if (captured) {
				return { ...captured, event_id: null, scope, google_event_id: null };
			}
			throw uncertainFailure(
				'create_calendar_event_receipt_invalid',
				'create_calendar_event returned no ontology event id'
			);
		}
		const taskLink = task
			? await this.ensureTaskEventEdge({
					projectId: task.projectId,
					taskId: task.id,
					eventId
				})
			: null;
		return {
			...(await this.eventOutcome(eventId, scope)),
			...(taskLink ? { task_link_created: taskLink.created } : {}),
			...(taskLink?.error ? { task_link_error: taskLink.error } : {})
		};
	}

	// -----------------------------------------------------------------
	// update_calendar_event
	// -----------------------------------------------------------------

	async updateEvent(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const ontoEventId = optionalUuidArg(args.onto_event_id, 'onto_event_id');
		if (!ontoEventId) return this.updateProviderEvent();

		const existing = await this.loadAuthorizedEvent(ontoEventId, 'update_calendar_event');
		const timezone = await this.resolveTimezone(
			optionalText(args.timezone, 'timezone') ?? existing.timezone
		);
		const startText = optionalText(args.start_at, 'start_at');
		const start = startText
			? this.normalizeDateTime(startText, timezone, { field: 'start_at', boundary: 'start' })
			: null;
		const clearsEnd = args.end_at === null;
		const endText = optionalText(args.end_at, 'end_at');
		const end = endText
			? this.normalizeDateTime(endText, timezone, { field: 'end_at', boundary: 'end' })
			: null;
		const startForValidation = start?.iso ?? existing.startAt;
		if (end && Date.parse(end.iso) <= Date.parse(startForValidation)) {
			throw knownFailure(
				'update_calendar_event_invalid_arguments',
				'end_at must be after start_at'
			);
		}
		const inferredTimezone =
			(start && !start.hadExplicitTimezone) || (end && !end.hadExplicitTimezone);
		const actorId = await this.requireAccess().getActorId();

		await this.runProvider('update_calendar_event', () =>
			this.requireEventSync().updateEvent(this.request.userId, {
				eventId: ontoEventId,
				...(args.title !== undefined ? { title: requireText(args.title, 'title') } : {}),
				...(Object.hasOwn(args, 'description')
					? { description: optionalText(args.description, 'description') ?? null }
					: {}),
				...(Object.hasOwn(args, 'location')
					? { location: optionalText(args.location, 'location') ?? null }
					: {}),
				...(start ? { startAt: start.iso } : {}),
				...(end ? { endAt: end.iso } : clearsEnd ? { endAt: null } : {}),
				...(args.timezone !== undefined || inferredTimezone ? { timezone } : {}),
				syncToCalendar: optionalBoolean(args.sync_to_calendar, 'sync_to_calendar'),
				activityLog: {
					changeSource: 'chat',
					...(this.request.sessionId ? { chatSessionId: this.request.sessionId } : {}),
					actorContext: { changedByActorId: actorId }
				}
			})
		);
		return this.eventOutcome(ontoEventId, existing.scope);
	}

	/**
	 * The provider-only branch: the model is holding a Google event id from a
	 * calendar read with no ontology twin. The write service resolves the target
	 * from the turn's own user id, so a source the user does not own never
	 * resolves.
	 */
	private async updateProviderEvent(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const providerEventId = requireText(args.event_id, 'event_id');
		const timezone = await this.resolveTimezone(optionalText(args.timezone, 'timezone'));
		const startText = optionalText(args.start_at, 'start_at');
		const endText = optionalText(args.end_at, 'end_at');
		const start = startText
			? this.normalizeDateTime(startText, timezone, { field: 'start_at', boundary: 'start' })
			: null;
		const end = endText
			? this.normalizeDateTime(endText, timezone, { field: 'end_at', boundary: 'end' })
			: null;
		if (start && end && Date.parse(end.iso) <= Date.parse(start.iso)) {
			throw knownFailure(
				'update_calendar_event_invalid_arguments',
				'end_at must be after start_at'
			);
		}
		const zone =
			args.timezone !== undefined ||
			(start && !start.hadExplicitTimezone) ||
			(end && !end.hadExplicitTimezone)
				? timezone
				: undefined;

		const updated = await this.runProvider('update_calendar_event', () =>
			this.requireServices().write.updateEvent({
				userId: this.request.userId,
				providerEventId,
				selector: this.providerSelector(),
				requestBody: {
					...(args.title !== undefined
						? { summary: requireText(args.title, 'title') }
						: {}),
					...(Object.hasOwn(args, 'description')
						? { description: optionalText(args.description, 'description') ?? '' }
						: {}),
					...(Object.hasOwn(args, 'location')
						? { location: optionalText(args.location, 'location') ?? '' }
						: {}),
					...(start ? { start: { dateTime: start.iso, timeZone: zone } } : {}),
					...(end ? { end: { dateTime: end.iso, timeZone: zone } } : {})
				},
				sendUpdates: 'none'
			})
		);
		if (this.capturedProviderOutcome()) return this.capturedProviderOutcome()!;
		return {
			ok: true,
			event_id: null,
			google_event_id: updated.providerEventId,
			html_link: updated.event.htmlLink ?? null,
			calendar_id: updated.providerCalendarId,
			scope: resolveScope(args.calendar_scope, 'user'),
			synced: true
		};
	}

	// -----------------------------------------------------------------
	// delete_calendar_event
	// -----------------------------------------------------------------

	async deleteEvent(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const ontoEventId = optionalUuidArg(args.onto_event_id, 'onto_event_id');
		if (!ontoEventId) return this.deleteProviderEvent();

		const existing = await this.loadAuthorizedEvent(ontoEventId, 'delete_calendar_event');
		const actorId = await this.requireAccess().getActorId();
		await this.runProvider('delete_calendar_event', () =>
			this.requireEventSync().deleteEvent(this.request.userId, {
				eventId: ontoEventId,
				syncToCalendar: optionalBoolean(args.sync_to_calendar, 'sync_to_calendar'),
				activityLog: {
					changeSource: 'chat',
					...(this.request.sessionId ? { chatSessionId: this.request.sessionId } : {}),
					actorContext: { changedByActorId: actorId }
				}
			})
		);
		return { ...(await this.eventOutcome(ontoEventId, existing.scope)), deleted: true };
	}

	private async deleteProviderEvent(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const providerEventId = requireText(args.event_id, 'event_id');
		const result = await this.runProvider('delete_calendar_event', () =>
			this.requireServices().write.deleteEvent({
				userId: this.request.userId,
				providerEventId,
				selector: this.providerSelector(),
				sendUpdates: 'none'
			})
		);
		if (this.capturedProviderOutcome()) return this.capturedProviderOutcome()!;
		return {
			ok: true,
			event_id: null,
			google_event_id: result.providerEventId,
			html_link: null,
			calendar_id: result.providerCalendarId,
			scope: resolveScope(args.calendar_scope, 'user'),
			synced: true,
			deleted: true,
			already_missing: result.alreadyMissing
		};
	}

	// -----------------------------------------------------------------
	// set_project_calendar
	// -----------------------------------------------------------------

	async setProjectCalendar(): Promise<Record<string, unknown>> {
		const args = this.request.arguments;
		const projectId = requireUuidArg(args.project_id, 'project_id');
		this.assertFenceAgrees(projectId);
		await this.assertProjectWriteAccess(projectId);

		const action = optionalText(args.action, 'action');
		if (action !== undefined && action !== 'create' && action !== 'update') {
			throw knownFailure(
				'set_project_calendar_invalid_arguments',
				'action must be create or update'
			);
		}
		const colorId = optionalText(args.color_id, 'color_id');
		if (colorId !== undefined && !GOOGLE_COLOR_IDS.has(colorId)) {
			throw knownFailure(
				'set_project_calendar_invalid_arguments',
				'color_id must be a Google calendar color id between 1 and 11'
			);
		}
		const name = optionalText(args.name, 'name');
		const description = optionalText(args.description, 'description');
		const syncEnabled = optionalBoolean(args.sync_enabled, 'sync_enabled');

		const { data: existing } = await this.client
			.from('project_calendars')
			.select('id')
			.eq('project_id', projectId)
			.eq('user_id', this.request.userId)
			.maybeSingle();

		const service = this.requireProjectCalendars();
		const outcome = await this.runProvider('set_project_calendar', () =>
			!existing || action === 'create'
				? service.createProjectCalendarRecord({
						projectId,
						userId: this.request.userId,
						...(name !== undefined ? { name } : {}),
						...(description !== undefined ? { description } : {}),
						...(colorId !== undefined ? { colorId: colorId as never } : {})
					})
				: service.updateProjectCalendarRecord(projectId, this.request.userId, {
						...(name !== undefined ? { name } : {}),
						...(description !== undefined ? { description } : {}),
						...(colorId !== undefined ? { colorId: colorId as never } : {}),
						...(syncEnabled !== undefined ? { syncEnabled } : {})
					})
		);
		const captured = this.capturedProviderOutcome();
		if (captured) {
			return {
				...captured,
				project_id: projectId,
				calendar_id: null,
				sync_mode: await this.readSyncMode(projectId)
			};
		}
		if (outcome.status === 'error') {
			throw knownFailure(`set_project_calendar_failed`, outcome.message);
		}
		return {
			ok: true,
			project_id: projectId,
			calendar_id: outcome.data.calendar_id ?? null,
			sync_mode: await this.readSyncMode(projectId)
		};
	}

	private async readSyncMode(projectId: string): Promise<string> {
		try {
			return await this.requireProjectCalendars().getProjectCalendarSyncMode(projectId);
		} catch {
			return 'actor_projection';
		}
	}

	// -----------------------------------------------------------------
	// Shared helpers
	// -----------------------------------------------------------------

	/**
	 * Run one provider-backed call. A dead grant or a missing OAuth deployment
	 * becomes structured data on `capturedFailure`; every other error keeps its
	 * disposition (the ontology row may already exist, so the outcome is
	 * uncertain rather than a clean refusal).
	 */
	private async runProvider<T>(toolName: string, run: () => Promise<T>): Promise<T> {
		try {
			return await run();
		} catch (error) {
			const code = calendarWriteFailureCode(error);
			if (code) {
				this.capturedFailure ??= code;
				return undefined as T;
			}
			if ((error as { name?: unknown })?.name === 'AgenticChatMutationAdapterError') {
				throw error;
			}
			throw uncertainFailure(
				`${toolName}_outcome_uncertain`,
				error instanceof Error ? error.message : `${toolName} failed`
			);
		}
	}

	private capturedProviderOutcome(): Record<string, unknown> | null {
		if (!this.capturedFailure) return null;
		return { ok: false, error_code: this.capturedFailure, synced: false };
	}

	/**
	 * The public receipt payload for an ontology event: read the committed row
	 * back so `synced` reflects what actually reached Google, not what was asked.
	 */
	private async eventOutcome(
		eventId: string,
		scope: AgenticChatCalendarScopeV1
	): Promise<Record<string, unknown>> {
		const { data } = await this.client
			.from('onto_events')
			.select('id, external_link, props, sync_status, sync_error')
			.eq('id', eventId)
			.maybeSingle();
		const props = (data?.props ?? {}) as Record<string, unknown>;
		const synced = data?.sync_status === 'synced' || data?.sync_status === 'cancelled';
		return {
			ok: this.capturedFailure === null,
			event_id: eventId,
			google_event_id:
				typeof props.external_event_id === 'string' ? props.external_event_id : null,
			html_link: data?.external_link ?? null,
			calendar_id:
				typeof props.external_calendar_id === 'string' ? props.external_calendar_id : null,
			scope,
			synced: this.capturedFailure === null && synced,
			...(data?.sync_error ? { sync_error: data.sync_error } : {}),
			...(this.capturedFailure ? { error_code: this.capturedFailure } : {})
		};
	}

	private providerSelector(): { calendarSourceId?: string; calendarId?: string } {
		const args = this.request.arguments;
		const calendarSourceId = optionalUuidArg(args.calendar_source_id, 'calendar_source_id');
		const calendarId = normalizeCalendarId(args.calendar_id);
		return {
			...(calendarSourceId ? { calendarSourceId } : {}),
			...(calendarId ? { calendarId } : {})
		};
	}

	/** The reviewed row already fenced the turn; a widened target never runs. */
	private assertFenceAgrees(projectId: string | null): void {
		if (
			projectId !== null &&
			this.request.projectId !== null &&
			this.request.projectId !== projectId
		) {
			throw knownFailure(
				'mutation_project_scope_mismatch',
				`${this.request.toolName} target project is outside the admitted turn context`
			);
		}
	}

	private async assertProjectWriteAccess(projectId: string): Promise<void> {
		try {
			await this.requireAccess().assertProjectAccess(projectId, 'write');
		} catch (error) {
			if (
				error instanceof AgenticChatToolAccessDeniedError ||
				(error as { name?: unknown })?.name === 'AgenticChatToolAccessDeniedError'
			) {
				throw knownFailure(
					`${this.request.toolName}_access_denied`,
					'Project not found or access denied'
				);
			}
			throw error;
		}
	}

	private async resolveTask(
		taskId: string,
		expectedProjectId: string | null
	): Promise<{ id: string; title: string; projectId: string }> {
		const { data, error } = await this.client
			.from('onto_tasks')
			.select('id, title, project_id')
			.eq('id', taskId)
			.is('deleted_at', null)
			.maybeSingle();
		if (error) {
			throw uncertainFailure(
				`${this.request.toolName}_task_lookup_failed`,
				error.message ?? 'Failed to load task'
			);
		}
		if (!data?.project_id) {
			throw knownFailure(`${this.request.toolName}_task_not_found`, 'Task not found');
		}
		if (expectedProjectId && expectedProjectId !== data.project_id) {
			throw knownFailure(
				`${this.request.toolName}_invalid_arguments`,
				'task_id must belong to project_id'
			);
		}
		return { id: data.id, title: data.title ?? '', projectId: data.project_id };
	}

	/**
	 * Load one ontology event and prove the turn may write it. A project event is
	 * gated by project membership; a user-scope event must belong to this turn's
	 * actor, because a service-role read alone proves nothing.
	 */
	private async loadAuthorizedEvent(
		eventId: string,
		toolName: string
	): Promise<{
		scope: AgenticChatCalendarScopeV1;
		timezone: string | null;
		startAt: string;
	}> {
		const { data, error } = await this.client
			.from('onto_events')
			.select(
				'id, project_id, owner_entity_type, owner_entity_id, created_by, timezone, start_at'
			)
			.eq('id', eventId)
			.is('deleted_at', null)
			.maybeSingle();
		if (error) {
			throw uncertainFailure(
				`${toolName}_event_lookup_failed`,
				error.message ?? 'Failed to load event'
			);
		}
		if (!data) {
			throw knownFailure(`${toolName}_event_not_found`, 'Event not found');
		}
		if (data.project_id) {
			await this.assertProjectWriteAccess(data.project_id);
			return { scope: 'project', timezone: data.timezone, startAt: data.start_at };
		}
		const actorId = await this.requireAccess().getActorId();
		const ownedByActor =
			data.created_by === actorId ||
			(data.owner_entity_type === 'actor' && data.owner_entity_id === actorId);
		if (!ownedByActor) {
			throw knownFailure(`${toolName}_access_denied`, 'Event not found or access denied');
		}
		return { scope: 'user', timezone: data.timezone, startAt: data.start_at };
	}

	/**
	 * Supabase never throws, so a failed edge read or insert would otherwise be
	 * dropped while the tool reported a fully linked event. A failed read never
	 * falls through to the insert: a duplicate edge is worse than a missing one.
	 */
	private async ensureTaskEventEdge(params: {
		projectId: string;
		taskId: string;
		eventId: string;
	}): Promise<{ created: boolean; error?: string }> {
		const { data: existing, error: selectError } = await this.client
			.from('onto_edges')
			.select('id')
			.eq('src_id', params.taskId)
			.eq('src_kind', 'task')
			.eq('dst_id', params.eventId)
			.eq('dst_kind', 'event')
			.eq('rel', 'has_event')
			.maybeSingle();
		if (selectError) {
			return {
				created: false,
				error: `Could not verify the task-event link (read failed: ${selectError.message}); no link was created.`
			};
		}
		if (existing) return { created: true };

		const { error: insertError } = await this.client.from('onto_edges').insert({
			project_id: params.projectId,
			src_id: params.taskId,
			src_kind: 'task',
			dst_id: params.eventId,
			dst_kind: 'event',
			rel: 'has_event'
		});
		if (insertError) {
			return {
				created: false,
				error: `The event was created but is not linked to the task (${insertError.message}).`
			};
		}
		return { created: true };
	}

	private async resolveTimezone(candidate: string | null | undefined): Promise<string> {
		const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
		if (trimmed) {
			if (!isValidIanaTimezone(trimmed)) {
				throw knownFailure(
					`${this.request.toolName}_invalid_arguments`,
					`Invalid timezone "${trimmed}". Use an IANA timezone like "America/New_York".`
				);
			}
			return trimmed;
		}
		const { data } = await this.client
			.from('users')
			.select('timezone')
			.eq('id', this.request.userId)
			.maybeSingle();
		const stored = typeof data?.timezone === 'string' ? data.timezone.trim() : '';
		return stored && isValidIanaTimezone(stored) ? stored : DEFAULT_TIMEZONE;
	}

	private normalizeDateTime(
		raw: string,
		timezone: string,
		options: { field: string; boundary: 'start' | 'end' }
	): { iso: string; hadExplicitTimezone: boolean; assumedTimezone: string | null } {
		try {
			return normalizeCalendarDateTime(raw, timezone, options.boundary);
		} catch {
			throw knownFailure(
				`${this.request.toolName}_invalid_arguments`,
				`${options.field} must be a valid ISO 8601 datetime`
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function isValidIanaTimezone(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim()) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
		return true;
	} catch {
		return false;
	}
}

/**
 * The same normalization the web executor applies: an explicit offset is
 * honored verbatim, a bare date becomes the first/last second of that civil day
 * in the resolved zone, and a zone-less datetime is read as wall clock there.
 */
export function normalizeCalendarDateTime(
	rawValue: string,
	timezone: string,
	boundary: 'start' | 'end' = 'start'
): { iso: string; hadExplicitTimezone: boolean; assumedTimezone: string | null } {
	const value = rawValue.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
	if (!value) throw new Error('datetime is required');

	if (value.includes('T') && TIMEZONE_SUFFIX_PATTERN.test(value)) {
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) throw new Error('invalid datetime');
		return { iso: parsed.toISOString(), hadExplicitTimezone: true, assumedTimezone: null };
	}

	const wallClock = DATE_ONLY_PATTERN.test(value)
		? `${value}T${boundary === 'end' ? '23:59:59' : '00:00:00'}`
		: value;
	const parsed = fromZonedTime(wallClock, timezone);
	if (Number.isNaN(parsed.getTime())) throw new Error('invalid datetime');
	return {
		iso: parsed.toISOString(),
		hadExplicitTimezone: false,
		assumedTimezone: timezone
	};
}

function resolveScope(value: unknown, fallback: AgenticChatCalendarScopeV1) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value !== 'string' || !CALENDAR_SCOPES.has(value as AgenticChatCalendarScopeV1)) {
		throw knownFailure(
			'mutation_arguments_not_admitted',
			'calendar_scope must be one of: user, project, calendar_id'
		);
	}
	return value as AgenticChatCalendarScopeV1;
}

function normalizeCalendarId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 200 || /\s/.test(trimmed)) return null;
	if (trimmed === 'primary' || trimmed.includes('@')) return trimmed;
	return null;
}

function requireText(value: unknown, field: string): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} is required`);
	}
	return value.trim();
}

function optionalText(value: unknown, field: string): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'string') {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a string`);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') {
		throw knownFailure('mutation_arguments_not_admitted', `${field} must be a boolean`);
	}
	return value;
}

function requireUuidArg(value: unknown, field: string): string {
	const resolved = optionalUuidArg(value, field);
	if (!resolved) {
		throw knownFailure('mutation_arguments_not_admitted', `${field} is required`);
	}
	return resolved;
}

function optionalUuidArg(value: unknown, field: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
		throw knownFailure('mutation_scope_invalid', `${field} must be a canonical UUID`);
	}
	return value.trim().toLowerCase();
}
