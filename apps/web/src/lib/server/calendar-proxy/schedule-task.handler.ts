// apps/web/src/lib/server/calendar-proxy/schedule-task.handler.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { CalendarService } from '$lib/services/calendar-service';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';
import { ApiResponse } from '$lib/utils/api-response';
import { recurrencePatternSchema, scheduleTaskParamsSchema } from './request-schemas';

interface ScheduleTaskHandlerDependencies {
	calendarService: CalendarService;
	multiCalendarEnabled: boolean;
	params: any;
	supabase: TypedSupabaseClient;
	user: { id: string };
}

export async function handleScheduleTask({
	calendarService,
	multiCalendarEnabled,
	params,
	supabase,
	user
}: ScheduleTaskHandlerDependencies): Promise<Response> {
	if (multiCalendarEnabled) {
		const scheduleParams = scheduleTaskParamsSchema.safeParse(params);
		if (!scheduleParams.success) {
			return ApiResponse.badRequest(
				'Invalid task scheduling parameters',
				scheduleParams.error.flatten()
			);
		}
		const value = scheduleParams.data;
		const { data: taskRecord, error: taskError } = await supabase
			.from('onto_tasks')
			.select('*, project:onto_projects(id, name)')
			.eq('id', value.task_id)
			.is('deleted_at', null)
			.single();
		if (taskError || !taskRecord) return ApiResponse.notFound('Task');

		const task = taskRecord as typeof taskRecord & {
			project?: { id: string; name: string } | null;
		};
		const taskProps = (task.props as Record<string, unknown> | null) ?? {};
		const durationMinutes =
			value.duration_minutes ??
			(typeof taskProps.duration_minutes === 'number'
				? Math.max(1, Math.min(taskProps.duration_minutes, 1440))
				: 60);
		const start = new Date(value.start_time);
		const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
		const projectId = task.project?.id ?? task.project_id ?? null;
		const descriptionSections: string[] = [];
		if (projectId && task.project?.name) {
			descriptionSections.push(
				`Project: ${task.project.name}\nhttps://build-os.com/projects/${projectId}`
			);
		}
		if (task.description) descriptionSections.push(task.description);
		if (value.description) descriptionSections.push(value.description);
		if (projectId) {
			descriptionSections.push(
				`📋 View Task: https://build-os.com/projects/${projectId}/tasks/${value.task_id}\n[BuildOS Task #${value.task_id}]`
			);
		}

		const storedPattern = recurrencePatternSchema.safeParse(taskProps.recurrence_pattern);
		const recurrencePattern =
			value.recurrence_pattern ?? (storedPattern.success ? storedPattern.data : undefined);
		const recurrenceEnds =
			value.recurrence_ends ??
			(typeof taskProps.recurrence_ends === 'string' ? taskProps.recurrence_ends : undefined);
		const isRecurring =
			Boolean(recurrencePattern) &&
			(value.recurrence_pattern !== undefined || taskProps.task_type === 'recurring');
		const recurrenceRule =
			isRecurring && recurrencePattern
				? recurrencePatternBuilder.buildRRule({
						pattern: { type: recurrencePattern },
						endOption: recurrenceEnds
							? { type: 'date', value: recurrenceEnds }
							: { type: 'never' },
						startDate: value.start_time
					})
				: undefined;
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});
		if (actorError || !actorId) {
			throw actorError ?? new Error('Failed to resolve the current actor');
		}

		// Ontology tasks cannot be persisted in the legacy task_calendar_events table: its task_id
		// foreign key intentionally still points at legacy tasks. Model the calendar block as an
		// ontology event and map that event to Google instead. Keeping the event projectless preserves
		// the user-calendar ownership semantics while the project-scoped edge retains task context.
		const eventService = new OntoEventSyncService(supabase);
		const result = await eventService.createEvent(user.id, {
			projectId: null,
			owner: { type: 'task', id: value.task_id },
			typeKey: 'event.task_work',
			title: task.title,
			description: descriptionSections.join('\n\n') || null,
			startAt: start.toISOString(),
			endAt: end.toISOString(),
			timezone: value.timeZone ?? null,
			recurrence: recurrenceRule ? { rrule: recurrenceRule } : {},
			props: {
				task_id: value.task_id,
				task_title: task.title,
				project_id: projectId,
				task_event_kind: 'range',
				color_id: value.color_id ?? null
			},
			createdBy: actorId as string,
			calendarScope: value.calendarSourceId || value.calendar_id ? 'calendar_id' : 'user',
			calendarId: value.calendar_id ?? null,
			calendarSourceId: value.calendarSourceId ?? null,
			syncToCalendar: true,
			createProjectCalendarIfMissing: false
		});

		if (!result.sync?.success || !result.sync.externalEventId) {
			await eventService.deleteEvent(user.id, {
				eventId: result.event.id,
				syncToCalendar: false
			});
			throw new Error(result.sync?.error ?? 'Calendar event sync did not return an event id');
		}

		if (projectId) {
			const { error: edgeError } = await supabase.from('onto_edges').insert({
				project_id: projectId,
				src_id: value.task_id,
				src_kind: 'task',
				dst_id: result.event.id,
				dst_kind: 'event',
				rel: 'has_event'
			});
			if (edgeError) {
				await eventService.deleteEvent(user.id, {
					eventId: result.event.id,
					syncToCalendar: true
				});
				throw edgeError;
			}
		}

		return ApiResponse.success({
			success: true,
			event_id: result.sync.externalEventId,
			onto_event_id: result.event.id,
			event_link: result.event.external_link ?? undefined,
			calendar_id: result.sync.calendarId ?? value.calendar_id ?? 'primary',
			calendarSourceId: result.sync.calendarSourceId ?? undefined,
			task_id: value.task_id,
			summary: result.event.title,
			start: { dateTime: start.toISOString(), timeZone: value.timeZone },
			end: { dateTime: end.toISOString(), timeZone: value.timeZone },
			recurrence: recurrenceRule ? [recurrenceRule] : undefined,
			timeZone: value.timeZone
		});
	}
	const scheduleResult = await calendarService.scheduleTask(user.id, params);
	return ApiResponse.success(scheduleResult);
}
