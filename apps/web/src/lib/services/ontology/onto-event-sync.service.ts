// apps/web/src/lib/services/ontology/onto-event-sync.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { CalendarService } from '$lib/services/calendar-service';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { OntoEventService, type OntoEventOwner } from './onto-event.service';

type OntoEventRow = Database['public']['Tables']['onto_events']['Row'];
type OntoEventSyncRow = Database['public']['Tables']['onto_event_sync']['Row'];
type ProjectCalendarRow = Database['public']['Tables']['project_calendars']['Row'];
type OntoTaskRow = Database['public']['Tables']['onto_tasks']['Row'];
type TaskEventKind = 'range' | 'start' | 'due';

export type CalendarScope = 'project' | 'user' | 'calendar_id';

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
	syncToCalendar?: boolean;
	createProjectCalendarIfMissing?: boolean;
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
	syncTaskFromEvent?: boolean;
}

export interface DeleteOntoEventRequest {
	eventId: string;
	syncToCalendar?: boolean;
}

export interface CreateOntoEventResult {
	event: OntoEventRow;
	sync?: {
		success: boolean;
		provider?: string;
		externalEventId?: string | null;
		calendarId?: string | null;
		error?: string;
	};
}

const DEFAULT_EVENT_DURATION_MINUTES = 30;

export class OntoEventSyncService {
	private readonly calendarService: CalendarService;
	private readonly projectCalendarService: ProjectCalendarService;
	private readonly googleOAuthService: GoogleOAuthService;

	constructor(private readonly supabase: SupabaseClient<Database>) {
		this.calendarService = new CalendarService(supabase);
		this.projectCalendarService = new ProjectCalendarService(supabase);
		this.googleOAuthService = new GoogleOAuthService(supabase);
	}

	async listProjectEvents(
		projectId: string,
		params: {
			timeMin?: string | null;
			timeMax?: string | null;
			ownerType?: string | null;
			ownerId?: string | null;
			includeDeleted?: boolean;
			limit?: number | null;
		}
	): Promise<Array<OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }>> {
		let query = this.supabase
			.from('onto_events')
			.select(
				`*,
				onto_event_sync (
					id,
					calendar_id,
					provider,
					external_event_id,
					sync_status,
					sync_error,
					last_synced_at
				)`
			)
			.eq('project_id', projectId)
			.order('start_at', { ascending: true });

		if (!params.includeDeleted) {
			query = query.is('deleted_at', null);
		}

		if (params.ownerType) {
			query = query.eq('owner_entity_type', params.ownerType);
		}

		if (params.ownerId) {
			query = query.eq('owner_entity_id', params.ownerId);
		}

		if (params.timeMin) {
			query = query.gte('start_at', params.timeMin);
		}

		if (params.timeMax) {
			query = query.lte('start_at', params.timeMax);
		}

		if (params.limit) {
			query = query.limit(params.limit);
		}

		const { data, error } = await query;
		if (error) {
			throw new Error(error.message);
		}

		return (data ?? []) as Array<OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }>;
	}

	async getEvent(
		eventId: string
	): Promise<(OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }) | null> {
		const { data, error } = await this.supabase
			.from('onto_events')
			.select(
				`*,
				onto_event_sync (
					id,
					calendar_id,
					provider,
					external_event_id,
					sync_status,
					sync_error,
					last_synced_at
				)`
			)
			.eq('id', eventId)
			.maybeSingle();

		if (error) {
			throw new Error(error.message);
		}

		return data as (OntoEventRow & { onto_event_sync?: OntoEventSyncRow[] }) | null;
	}

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

		const shouldSync = request.syncToCalendar !== false;
		if (!shouldSync) {
			return { event };
		}

		const syncResult = await this.syncEventToCalendar(userId, event, {
			scope: request.calendarScope ?? 'project',
			calendarId: request.calendarId ?? null,
			createProjectCalendarIfMissing: request.createProjectCalendarIfMissing ?? true
		});

		return { event: syncResult.event, sync: syncResult.sync };
	}

	async updateEvent(userId: string, request: UpdateOntoEventRequest): Promise<OntoEventRow> {
		const existing = await this.getEvent(request.eventId);
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

		await this.updateCalendarFromEvent(userId, updated, existing.onto_event_sync ?? []);
		return updated;
	}

	async deleteEvent(userId: string, request: DeleteOntoEventRequest): Promise<OntoEventRow> {
		const existing = await this.getEvent(request.eventId);
		if (!existing) {
			throw new Error('Event not found');
		}

		const { data: updated, error } = await this.supabase
			.from('onto_events')
			.update({
				deleted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', request.eventId)
			.select('*')
			.single();

		if (error || !updated) {
			throw new Error(error?.message ?? 'Failed to delete event');
		}

		if (request.syncToCalendar !== false) {
			await this.deleteCalendarEvent(userId, existing, existing.onto_event_sync ?? []);
		}

		return updated;
	}

	private async syncEventToCalendar(
		userId: string,
		event: OntoEventRow,
		options: {
			scope: CalendarScope;
			calendarId: string | null;
			createProjectCalendarIfMissing: boolean;
		}
	): Promise<CreateOntoEventResult> {
		const nowIso = new Date().toISOString();
		const status = await this.googleOAuthService.safeGetCalendarStatus(userId);

		if (!status.isConnected) {
			await this.markEventSyncError(event.id, 'calendar_not_connected');
			return {
				event,
				sync: {
					success: false,
					error: 'Google Calendar is not connected'
				}
			};
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
				const calendarEvent = await this.calendarService.createStandaloneEvent(userId, {
					summary: event.title,
					description: event.description ?? undefined,
					start: new Date(event.start_at),
					end: new Date(event.end_at ?? event.start_at),
					timeZone: event.timezone ?? undefined,
					colorId: projectCalendar.color_id ?? undefined,
					calendar_id: projectCalendar.calendar_id
				});

				const { data: syncRow } = await this.supabase
					.from('onto_event_sync')
					.insert({
						event_id: event.id,
						calendar_id: projectCalendar.id,
						provider: 'google',
						external_event_id: calendarEvent.eventId,
						sync_status: 'synced',
						last_synced_at: nowIso
					})
					.select('*')
					.single();

				const { data: updated } = await this.supabase
					.from('onto_events')
					.update({
						external_link: calendarEvent.eventLink ?? null,
						last_synced_at: nowIso,
						sync_status: 'synced',
						sync_error: null
					})
					.eq('id', event.id)
					.select('*')
					.single();

				return {
					event: updated ?? event,
					sync: {
						success: true,
						provider: 'google',
						externalEventId: syncRow?.external_event_id ?? calendarEvent.eventId,
						calendarId: syncRow?.calendar_id ?? projectCalendar.id
					}
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Calendar sync failed';
				await this.markEventSyncError(event.id, message);
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
			const calendarEvent = await this.calendarService.createStandaloneEvent(userId, {
				summary: event.title,
				description: event.description ?? undefined,
				start: new Date(event.start_at),
				end: new Date(event.end_at ?? event.start_at),
				timeZone: event.timezone ?? undefined,
				calendar_id: googleCalendarId
			});

			const nextProps = {
				...(event.props as Record<string, unknown>),
				external_event_id: calendarEvent.eventId,
				external_calendar_id: googleCalendarId,
				provider: 'google'
			};

			const { data: updated } = await this.supabase
				.from('onto_events')
				.update({
					props: nextProps,
					external_link: calendarEvent.eventLink ?? null,
					last_synced_at: nowIso,
					sync_status: 'synced',
					sync_error: null
				})
				.eq('id', event.id)
				.select('*')
				.single();

			return {
				event: updated ?? event,
				sync: {
					success: true,
					provider: 'google',
					externalEventId: calendarEvent.eventId,
					calendarId: googleCalendarId
				}
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar sync failed';
			await this.markEventSyncError(event.id, message);
			return {
				event,
				sync: {
					success: false,
					error: message
				}
			};
		}
	}

	private async updateCalendarFromEvent(
		userId: string,
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<void> {
		const mapping = await this.resolveExternalMapping(event, syncRows);
		if (!mapping) return;

		try {
			await this.calendarService.updateCalendarEvent(userId, {
				event_id: mapping.externalEventId,
				calendar_id: mapping.calendarId,
				start_time: event.start_at,
				end_time: event.end_at ?? undefined,
				summary: event.title,
				description: event.description ?? undefined,
				location: event.location ?? undefined,
				timeZone: event.timezone ?? undefined
			});

			const nowIso = new Date().toISOString();
			await this.markEventSynced(event.id, nowIso, mapping.syncRowId);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar update failed';
			await this.markEventSyncError(event.id, message, mapping.syncRowId);
		}
	}

	private async deleteCalendarEvent(
		userId: string,
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<void> {
		const mapping = await this.resolveExternalMapping(event, syncRows);
		if (!mapping) return;

		try {
			await this.calendarService.deleteCalendarEvent(userId, {
				event_id: mapping.externalEventId,
				calendar_id: mapping.calendarId,
				send_notifications: false
			});

			const nowIso = new Date().toISOString();
			await this.markEventSynced(event.id, nowIso, mapping.syncRowId, 'cancelled');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Calendar delete failed';
			await this.markEventSyncError(event.id, message, mapping.syncRowId);
		}
	}

	private async resolveExternalMapping(
		event: OntoEventRow,
		syncRows: OntoEventSyncRow[]
	): Promise<{
		externalEventId: string;
		calendarId: string;
		syncRowId?: string;
	} | null> {
		if (syncRows.length > 0) {
			const syncRow = syncRows[0];
			if (!syncRow) return null; // TypeScript guard - array[0] can be undefined
			const calendar = await this.supabase
				.from('project_calendars')
				.select('calendar_id')
				.eq('id', syncRow.calendar_id)
				.maybeSingle();

			if (calendar.data?.calendar_id) {
				return {
					externalEventId: syncRow.external_event_id,
					calendarId: calendar.data.calendar_id,
					syncRowId: syncRow.id
				};
			}
		}

		const props = (event.props as Record<string, unknown>) ?? {};
		const externalEventId = props.external_event_id as string | undefined;
		const externalCalendarId = props.external_calendar_id as string | undefined;

		if (externalEventId && externalCalendarId) {
			return {
				externalEventId,
				calendarId: externalCalendarId
			};
		}

		return null;
	}

	private async resolveProjectCalendar(
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

		const response = await this.projectCalendarService.ensureProjectCalendar(projectId, userId);
		const payload = await response.json().catch(() => null);
		if (!payload?.success) {
			return null;
		}

		return payload.data as ProjectCalendarRow;
	}

	private async markEventSynced(
		eventId: string,
		timestamp: string,
		syncRowId?: string,
		status: string = 'synced'
	): Promise<void> {
		await this.supabase
			.from('onto_events')
			.update({
				last_synced_at: timestamp,
				sync_status: status,
				sync_error: null
			})
			.eq('id', eventId);

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

	private async markEventSyncError(
		eventId: string,
		message: string,
		syncRowId?: string
	): Promise<void> {
		const trimmed = message?.slice(0, 500) ?? 'Calendar sync failed';
		await this.supabase
			.from('onto_events')
			.update({
				sync_status: 'failed',
				sync_error: trimmed
			})
			.eq('id', eventId);

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

	private async syncTaskFromEvent(event: OntoEventRow): Promise<void> {
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
