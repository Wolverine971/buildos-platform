// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts
import { BaseExecutor } from './base-executor';
import { CalendarService } from '$lib/services/calendar-service';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import type { CalendarEvent } from '$lib/services/calendar-service';
import {
	normalizeCalendarDateTimeInput,
	isValidIanaTimezone,
	type NormalizedCalendarDateTime
} from './calendar-datetime';

type CalendarScope = 'user' | 'project' | 'calendar_id';

interface ListCalendarEventsArgs {
	timeMin?: string;
	timeMax?: string;
	limit?: number;
	calendar_scope?: CalendarScope;
	project_id?: string;
	calendar_id?: string;
}

interface GetCalendarEventDetailsArgs {
	onto_event_id?: string;
	event_id?: string;
	calendar_id?: string;
	calendar_scope?: CalendarScope;
	project_id?: string;
}

interface CreateCalendarEventArgs {
	title: string;
	start_at: string;
	end_at?: string | null;
	timezone?: string;
	description?: string;
	location?: string;
	project_id?: string;
	task_id?: string;
	calendar_scope?: CalendarScope;
	calendar_id?: string;
	sync_to_calendar?: boolean;
}

interface UpdateCalendarEventArgs {
	onto_event_id?: string;
	event_id?: string;
	calendar_id?: string;
	title?: string;
	start_at?: string;
	end_at?: string | null;
	timezone?: string;
	description?: string;
	location?: string;
	sync_to_calendar?: boolean;
}

interface DeleteCalendarEventArgs {
	onto_event_id?: string;
	event_id?: string;
	calendar_id?: string;
	sync_to_calendar?: boolean;
}

interface ProjectCalendarArgs {
	project_id: string;
	name?: string;
	description?: string;
	color_id?: string;
	sync_enabled?: boolean;
	action?: 'create' | 'update';
}

export class CalendarExecutor extends BaseExecutor {
	private readonly calendarService: CalendarService;
	private readonly eventSyncService: OntoEventSyncService;
	private readonly projectCalendarService: ProjectCalendarService;
	private readonly googleOAuthService: GoogleOAuthService;
	private cachedUserTimezone: string | null = null;

	constructor(context: ConstructorParameters<typeof BaseExecutor>[0]) {
		super(context);
		this.calendarService = new CalendarService(this.supabase as any);
		this.eventSyncService = new OntoEventSyncService(this.supabase as any);
		this.projectCalendarService = new ProjectCalendarService(this.supabase as any);
		this.googleOAuthService = new GoogleOAuthService(this.supabase as any);
	}

	private normalizeCalendarId(value?: string | null): string | null {
		if (typeof value !== 'string') {
			return null;
		}
		const trimmed = value.trim();
		if (!trimmed) {
			return null;
		}
		if (trimmed.length > 200) {
			return null;
		}
		if (/\s/.test(trimmed)) {
			return null;
		}
		if (trimmed === 'primary') {
			return trimmed;
		}
		if (trimmed.includes('@')) {
			return trimmed;
		}
		return null;
	}

	private async getUserTimezone(): Promise<string> {
		if (this.cachedUserTimezone) {
			return this.cachedUserTimezone;
		}

		const { data } = await this.supabase
			.from('users')
			.select('timezone')
			.eq('id', this.userId)
			.maybeSingle();

		const timezone =
			typeof data?.timezone === 'string' && isValidIanaTimezone(data.timezone)
				? data.timezone
				: 'America/New_York';

		this.cachedUserTimezone = timezone;
		return timezone;
	}

	private async resolveInputTimezone(candidate?: string | null): Promise<string> {
		const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
		if (trimmed.length === 0) {
			return this.getUserTimezone();
		}
		if (!isValidIanaTimezone(trimmed)) {
			throw new Error(
				`Invalid timezone "${trimmed}". Use an IANA timezone like "America/New_York".`
			);
		}
		return trimmed;
	}

	private parseCalendarDateTime(
		value: string,
		timezone: string,
		fieldName: 'start_at' | 'end_at',
		dateBoundary: 'start' | 'end'
	): NormalizedCalendarDateTime {
		return normalizeCalendarDateTimeInput(value, timezone, {
			fieldName,
			dateBoundary
		});
	}

	private async resolveTaskMetadata(
		taskId: string,
		expectedProjectId?: string
	): Promise<{
		taskId: string;
		taskTitle: string;
		projectId: string;
		taskLink: string;
	}> {
		const { data: task, error } = await this.supabase
			.from('onto_tasks')
			.select('id, title, project_id')
			.eq('id', taskId)
			.is('deleted_at', null)
			.maybeSingle();

		if (error) {
			throw new Error(error.message);
		}

		if (!task) {
			throw new Error('Task not found');
		}

		if (expectedProjectId && task.project_id !== expectedProjectId) {
			throw new Error('Task does not belong to the specified project');
		}

		await this.assertProjectOwnership(task.project_id);

		const taskTitle = task.title ?? 'Task';
		return {
			taskId: task.id,
			taskTitle,
			projectId: task.project_id,
			taskLink: `/projects/${task.project_id}/tasks/${task.id}`
		};
	}

	private enrichTaskProps(
		existing: Record<string, unknown> | null | undefined,
		metadata: {
			taskId: string;
			taskTitle: string;
			projectId: string;
			taskLink: string;
		}
	) {
		return {
			...(existing ?? {}),
			task_id: metadata.taskId,
			task_title: metadata.taskTitle,
			task_link: metadata.taskLink,
			project_id: metadata.projectId
		};
	}

	async listCalendarEvents(args: ListCalendarEventsArgs) {
		const scope = args.calendar_scope ?? (args.project_id ? 'project' : 'user');
		const timeMin = args.timeMin ?? undefined;
		const timeMax = args.timeMax ?? undefined;
		const limit = args.limit ?? 50;

		let googleEvents: CalendarEvent[] = [];
		let googleError: string | null = null;
		let googleCalendarId: string | null = null;
		const requestedCalendarId = this.normalizeCalendarId(args.calendar_id);

		if (scope === 'project') {
			if (!args.project_id) {
				throw new Error('project_id is required when calendar_scope is project');
			}
			await this.assertProjectOwnership(args.project_id);

			const { data: projectCalendar } = await this.supabase
				.from('project_calendars')
				.select('id, calendar_id, sync_enabled')
				.eq('project_id', args.project_id)
				.eq('user_id', this.userId)
				.maybeSingle();

			if (projectCalendar?.calendar_id && projectCalendar.sync_enabled !== false) {
				googleCalendarId = projectCalendar.calendar_id;
			}
		} else if (scope === 'calendar_id') {
			if (!requestedCalendarId) {
				throw new Error('calendar_id must be a valid Google Calendar ID');
			}
			googleCalendarId = requestedCalendarId;
		} else {
			googleCalendarId = requestedCalendarId ?? 'primary';
		}

		if (googleCalendarId) {
			try {
				const response = await this.calendarService.getCalendarEvents(this.userId, {
					calendarId: googleCalendarId,
					timeMin,
					timeMax,
					maxResults: limit
				});
				googleEvents = response.events ?? [];
			} catch (error) {
				googleError =
					error instanceof Error ? error.message : 'Failed to load Google events';
			}
		}

		let ontoEvents: any[] = [];
		if (scope === 'project' && args.project_id) {
			ontoEvents = await this.eventSyncService.listProjectEvents(args.project_id, {
				timeMin,
				timeMax,
				includeDeleted: false,
				limit
			});
		} else {
			const actorId = await this.getActorId();
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
				.eq('created_by', actorId)
				.is('deleted_at', null)
				.order('start_at', { ascending: true })
				.limit(limit);

			if (args.project_id) {
				query = query.eq('project_id', args.project_id);
			}
			if (timeMin) {
				query = query.gte('start_at', timeMin);
			}
			if (timeMax) {
				query = query.lte('start_at', timeMax);
			}

			const { data, error } = await query;
			if (error) {
				throw new Error(error.message);
			}
			ontoEvents = data ?? [];
		}

		const normalizeTitle = (value?: string | null) => (value ?? '').trim().toLowerCase();

		const taskTitleById = new Map<string, string>();
		const taskIds = Array.from(
			new Set(
				ontoEvents
					.filter((event) => event.owner_entity_type === 'task' && event.owner_entity_id)
					.map((event) => event.owner_entity_id as string)
			)
		);

		if (taskIds.length > 0) {
			const { data: tasks, error } = await this.supabase
				.from('onto_tasks')
				.select('id, title')
				.in('id', taskIds);

			if (error) {
				throw new Error(error.message);
			}

			for (const task of tasks ?? []) {
				if (task.id) {
					taskTitleById.set(task.id, task.title ?? '');
				}
			}
		}

		const googleById = new Map<string, CalendarEvent>();
		const googleByTitle = new Map<string, CalendarEvent[]>();
		for (const event of googleEvents) {
			if (!event.id) continue;
			googleById.set(event.id, event);
			const summaryKey = normalizeTitle(event.summary);
			if (summaryKey) {
				const bucket = googleByTitle.get(summaryKey) ?? [];
				bucket.push(event);
				googleByTitle.set(summaryKey, bucket);
			}
		}

		const merged: Array<Record<string, any>> = [];

		for (const event of ontoEvents) {
			const syncRows = event.onto_event_sync || [];
			const externalId = syncRows.length > 0 ? syncRows[0].external_event_id : null;
			let matchedGoogle: CalendarEvent | undefined;

			if (externalId) {
				matchedGoogle = googleById.get(externalId);
				if (matchedGoogle) {
					googleById.delete(externalId);
				}
			}

			if (!matchedGoogle && !externalId) {
				const titleKey = normalizeTitle(event.title);
				const taskTitleKey = normalizeTitle(
					taskTitleById.get(event.owner_entity_id as string) ?? ''
				);
				const canMatchByTitle =
					event.owner_entity_type === 'task' && titleKey && titleKey === taskTitleKey;

				if (canMatchByTitle) {
					const bucket = googleByTitle.get(titleKey);
					if (bucket && bucket.length > 0) {
						matchedGoogle = bucket.shift();
						if (matchedGoogle?.id) {
							googleById.delete(matchedGoogle.id);
						}
					}
				}
			}

			const props = (event.props as Record<string, unknown>) ?? {};
			const taskLink =
				typeof props.task_link === 'string'
					? props.task_link
					: event.owner_entity_type === 'task' &&
						  event.project_id &&
						  event.owner_entity_id
						? `/projects/${event.project_id}/tasks/${event.owner_entity_id}`
						: null;

			merged.push({
				source: 'ontology',
				is_synced: Boolean(externalId),
				external_event_id: externalId ?? matchedGoogle?.id ?? null,
				onto_event_id: event.id,
				title: event.title,
				start_at: event.start_at,
				end_at: event.end_at,
				owner_entity_type: event.owner_entity_type,
				owner_entity_id: event.owner_entity_id,
				task_link: taskLink,
				sync_status: event.sync_status,
				sync_error: event.sync_error,
				event
			});
		}

		for (const event of googleById.values()) {
			const startAt = event.start?.dateTime || event.start?.date || null;
			const endAt = event.end?.dateTime || event.end?.date || null;
			merged.push({
				source: 'google',
				is_synced: false,
				external_event_id: event.id ?? null,
				title: event.summary,
				start_at: startAt,
				end_at: endAt,
				event
			});
		}

		merged.sort((a, b) => {
			const aTime = new Date(a.start_at || 0).getTime();
			const bTime = new Date(b.start_at || 0).getTime();
			return aTime - bTime;
		});

		return {
			events: merged,
			google_event_count: googleEvents.length,
			ontology_event_count: ontoEvents.length,
			warnings: googleError ? [googleError] : []
		};
	}

	async getCalendarEventDetails(args: GetCalendarEventDetailsArgs) {
		if (args.onto_event_id) {
			const event = await this.eventSyncService.getEvent(args.onto_event_id);
			if (!event) {
				throw new Error('Event not found');
			}
			return { source: 'ontology', event };
		}

		if (!args.event_id) {
			throw new Error('event_id is required for Google event lookup');
		}

		let calendarId = this.normalizeCalendarId(args.calendar_id) ?? 'primary';
		if (args.calendar_scope === 'project') {
			if (!args.project_id) {
				throw new Error('project_id is required for project calendar lookup');
			}
			await this.assertProjectOwnership(args.project_id);
			const { data: projectCalendar } = await this.supabase
				.from('project_calendars')
				.select('calendar_id')
				.eq('project_id', args.project_id)
				.eq('user_id', this.userId)
				.maybeSingle();
			if (projectCalendar?.calendar_id) {
				calendarId = projectCalendar.calendar_id;
			}
		} else if (args.calendar_scope === 'calendar_id') {
			const requestedCalendarId = this.normalizeCalendarId(args.calendar_id);
			if (!requestedCalendarId) {
				throw new Error('calendar_id must be a valid Google Calendar ID');
			}
			calendarId = requestedCalendarId;
		}

		const event = await this.calendarService.getCalendarEvent(this.userId, {
			event_id: args.event_id,
			calendar_id: calendarId
		});

		return { source: 'google', event };
	}

	async createCalendarEvent(args: CreateCalendarEventArgs) {
		if (!args.title || !args.start_at) {
			throw new Error('title and start_at are required');
		}

		const resolvedTimezone = await this.resolveInputTimezone(args.timezone);
		const normalizedStart = this.parseCalendarDateTime(
			args.start_at,
			resolvedTimezone,
			'start_at',
			'start'
		);
		const normalizedEnd =
			typeof args.end_at === 'string' && args.end_at.trim().length > 0
				? this.parseCalendarDateTime(args.end_at, resolvedTimezone, 'end_at', 'end')
				: null;

		if (normalizedEnd) {
			const startMs = Date.parse(normalizedStart.iso);
			const endMs = Date.parse(normalizedEnd.iso);
			if (endMs <= startMs) {
				throw new Error('end_at must be after start_at');
			}
		}

		const actorId = await this.getActorId();
		let projectId = args.project_id ?? null;
		let taskMetadata: {
			taskId: string;
			taskTitle: string;
			projectId: string;
			taskLink: string;
		} | null = null;

		if (args.task_id) {
			taskMetadata = await this.resolveTaskMetadata(args.task_id, projectId ?? undefined);
			projectId = taskMetadata.projectId;
		}

		const scope = args.calendar_scope ?? (projectId ? 'project' : 'user');
		if (scope === 'project' && !projectId) {
			throw new Error('project_id is required when calendar_scope is project');
		}
		const requestedCalendarId = this.normalizeCalendarId(args.calendar_id);
		if (scope === 'calendar_id' && !requestedCalendarId) {
			throw new Error('calendar_id must be a valid Google Calendar ID');
		}

		let ownerType: 'task' | 'project' | 'actor' | 'standalone' = 'actor';
		let ownerId: string | null = actorId;

		if (taskMetadata) {
			ownerType = 'task';
			ownerId = taskMetadata.taskId;
		} else if (projectId) {
			ownerType = 'project';
			ownerId = projectId;
		}

		if (projectId) {
			await this.assertProjectOwnership(projectId);
		}

		const props = taskMetadata
			? {
					...this.enrichTaskProps({}, taskMetadata),
					task_event_kind: normalizedEnd ? 'range' : 'start'
				}
			: undefined;

		const inferredTimezoneUsed =
			!normalizedStart.hadExplicitTimezone || Boolean(normalizedEnd?.assumedTimezone);
		const timezoneForEvent =
			typeof args.timezone === 'string' && args.timezone.trim().length > 0
				? resolvedTimezone
				: inferredTimezoneUsed
					? resolvedTimezone
					: undefined;

		const resolvedOwnerType = ownerType as 'task' | 'project' | 'actor' | 'standalone';
		const result = await this.eventSyncService.createEvent(this.userId, {
			orgId: null,
			projectId,
			owner: {
				type: resolvedOwnerType,
				id: resolvedOwnerType === 'standalone' ? null : ownerId
			},
			typeKey: ownerType === 'task' ? 'event.task_work' : 'event.general',
			title: args.title,
			description: args.description ?? null,
			location: args.location ?? null,
			startAt: normalizedStart.iso,
			endAt: normalizedEnd?.iso ?? null,
			timezone: timezoneForEvent,
			createdBy: actorId,
			props,
			calendarScope: scope,
			calendarId: requestedCalendarId,
			syncToCalendar: args.sync_to_calendar
		});

		if (taskMetadata && projectId) {
			const { data: existingEdge } = await this.supabase
				.from('onto_edges')
				.select('id')
				.eq('src_id', taskMetadata.taskId)
				.eq('src_kind', 'task')
				.eq('dst_id', result.event.id)
				.eq('dst_kind', 'event')
				.eq('rel', 'has_event')
				.maybeSingle();

			if (!existingEdge) {
				await this.supabase.from('onto_edges').insert({
					project_id: projectId,
					src_id: taskMetadata.taskId,
					src_kind: 'task',
					dst_id: result.event.id,
					dst_kind: 'event',
					rel: 'has_event'
				});
			}
		}

		return result;
	}

	async updateCalendarEvent(args: UpdateCalendarEventArgs) {
		if (args.onto_event_id) {
			const existing = await this.eventSyncService.getEvent(args.onto_event_id);
			if (!existing) {
				throw new Error('Event not found');
			}

			const resolvedTimezone = await this.resolveInputTimezone(
				args.timezone ?? existing.timezone
			);
			const normalizedStart =
				typeof args.start_at === 'string'
					? this.parseCalendarDateTime(
							args.start_at,
							resolvedTimezone,
							'start_at',
							'start'
						)
					: undefined;
			const normalizedEnd =
				typeof args.end_at === 'string'
					? this.parseCalendarDateTime(args.end_at, resolvedTimezone, 'end_at', 'end')
					: args.end_at === null
						? null
						: undefined;

			const startForValidation = normalizedStart?.iso ?? existing.start_at;
			if (normalizedEnd && typeof normalizedEnd === 'object') {
				const startMs = Date.parse(startForValidation);
				const endMs = Date.parse(normalizedEnd.iso);
				if (endMs <= startMs) {
					throw new Error('end_at must be after start_at');
				}
			}

			const inferredTimezoneUsed =
				(normalizedStart && !normalizedStart.hadExplicitTimezone) ||
				(normalizedEnd && !normalizedEnd.hadExplicitTimezone);
			const timezoneForUpdate =
				args.timezone !== undefined || inferredTimezoneUsed ? resolvedTimezone : undefined;

			let nextProps: Record<string, unknown> | undefined;
			if (existing.owner_entity_type === 'task' && existing.owner_entity_id) {
				const existingProps = (existing.props as Record<string, unknown>) ?? {};
				const taskMetadata = await this.resolveTaskMetadata(
					existing.owner_entity_id,
					existing.project_id ?? undefined
				);
				nextProps = this.enrichTaskProps(existingProps, taskMetadata);

				if (!('task_event_kind' in existingProps)) {
					const inferredKind =
						args.end_at !== undefined ? (args.end_at ? 'range' : 'start') : 'range';
					nextProps = {
						...nextProps,
						task_event_kind: inferredKind
					};
				}

				const { data: existingEdge } = await this.supabase
					.from('onto_edges')
					.select('id')
					.eq('src_id', taskMetadata.taskId)
					.eq('src_kind', 'task')
					.eq('dst_id', existing.id)
					.eq('dst_kind', 'event')
					.eq('rel', 'has_event')
					.maybeSingle();

				if (!existingEdge) {
					await this.supabase.from('onto_edges').insert({
						project_id: taskMetadata.projectId,
						src_id: taskMetadata.taskId,
						src_kind: 'task',
						dst_id: existing.id,
						dst_kind: 'event',
						rel: 'has_event'
					});
				}
			}

			const updated = await this.eventSyncService.updateEvent(this.userId, {
				eventId: args.onto_event_id,
				title: args.title,
				description: args.description ?? null,
				location: args.location ?? null,
				startAt: normalizedStart?.iso,
				endAt:
					normalizedEnd && typeof normalizedEnd === 'object'
						? normalizedEnd.iso
						: normalizedEnd,
				timezone: timezoneForUpdate,
				props: nextProps as any,
				syncToCalendar: args.sync_to_calendar
			});
			return { source: 'ontology', event: updated };
		}

		if (!args.event_id) {
			throw new Error('event_id is required for Google event update');
		}

		const resolvedTimezone = await this.resolveInputTimezone(args.timezone);
		const normalizedStart =
			typeof args.start_at === 'string'
				? this.parseCalendarDateTime(args.start_at, resolvedTimezone, 'start_at', 'start')
				: undefined;
		const normalizedEnd =
			typeof args.end_at === 'string'
				? this.parseCalendarDateTime(args.end_at, resolvedTimezone, 'end_at', 'end')
				: undefined;

		if (normalizedStart && normalizedEnd) {
			const startMs = Date.parse(normalizedStart.iso);
			const endMs = Date.parse(normalizedEnd.iso);
			if (endMs <= startMs) {
				throw new Error('end_at must be after start_at');
			}
		}

		const inferredTimezoneUsed =
			(normalizedStart && !normalizedStart.hadExplicitTimezone) ||
			(normalizedEnd && !normalizedEnd.hadExplicitTimezone);
		const timezoneForUpdate =
			args.timezone !== undefined || inferredTimezoneUsed ? resolvedTimezone : undefined;

		const calendarId = this.normalizeCalendarId(args.calendar_id) ?? 'primary';
		const updated = await this.calendarService.updateCalendarEvent(this.userId, {
			event_id: args.event_id,
			calendar_id: calendarId,
			start_time: normalizedStart?.iso,
			end_time: normalizedEnd?.iso,
			summary: args.title,
			description: args.description,
			location: args.location,
			timeZone: timezoneForUpdate
		});

		return { source: 'google', result: updated };
	}

	async deleteCalendarEvent(args: DeleteCalendarEventArgs) {
		if (args.onto_event_id) {
			const deleted = await this.eventSyncService.deleteEvent(this.userId, {
				eventId: args.onto_event_id,
				syncToCalendar: args.sync_to_calendar
			});
			return { source: 'ontology', event: deleted };
		}

		if (!args.event_id) {
			throw new Error('event_id is required for Google event delete');
		}

		const calendarId = this.normalizeCalendarId(args.calendar_id) ?? 'primary';
		const result = await this.calendarService.deleteCalendarEvent(this.userId, {
			event_id: args.event_id,
			calendar_id: calendarId,
			send_notifications: false
		});

		return { source: 'google', result };
	}

	async getProjectCalendar(args: ProjectCalendarArgs) {
		await this.assertProjectOwnership(args.project_id);
		const response = await this.projectCalendarService.getProjectCalendar(
			args.project_id,
			this.userId
		);
		const payload = await response.json().catch(() => null);
		if (!payload?.success) {
			throw new Error(payload?.error || 'Failed to fetch project calendar');
		}
		return payload.data ?? null;
	}

	async setProjectCalendar(args: ProjectCalendarArgs) {
		await this.assertProjectOwnership(args.project_id);

		const { data: existing } = await this.supabase
			.from('project_calendars')
			.select('*')
			.eq('project_id', args.project_id)
			.eq('user_id', this.userId)
			.maybeSingle();

		if (!existing || args.action === 'create') {
			const status = await this.googleOAuthService.safeGetCalendarStatus(this.userId);
			if (!status.isConnected) {
				throw new Error('Google Calendar is not connected');
			}

			const response = await this.projectCalendarService.createProjectCalendar({
				projectId: args.project_id,
				userId: this.userId,
				name: args.name,
				description: args.description,
				colorId: args.color_id as any
			});

			const payload = await response.json().catch(() => null);
			if (!payload?.success) {
				throw new Error(payload?.error || 'Failed to create project calendar');
			}
			return payload.data ?? null;
		}

		const response = await this.projectCalendarService.updateProjectCalendar(
			args.project_id,
			this.userId,
			{
				name: args.name,
				description: args.description,
				colorId: args.color_id as any,
				syncEnabled: args.sync_enabled
			}
		);

		const payload = await response.json().catch(() => null);
		if (!payload?.success) {
			throw new Error(payload?.error || 'Failed to update project calendar');
		}

		return payload.data ?? null;
	}
}
