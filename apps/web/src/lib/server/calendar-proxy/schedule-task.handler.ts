// apps/web/src/lib/server/calendar-proxy/schedule-task.handler.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { GoogleCalendarWriteService } from '$lib/server/google-calendar-write.service';
import type { CalendarService } from '$lib/services/calendar-service';
import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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
		const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
		const result = await service.createEvent({
			userId: user.id,
			selector: {
				calendarSourceId: value.calendarSourceId,
				calendarId: value.calendar_id
			},
			requestBody: {
				summary: task.title,
				description: descriptionSections.join('\n\n'),
				start: { dateTime: start.toISOString(), timeZone: value.timeZone },
				end: { dateTime: end.toISOString(), timeZone: value.timeZone },
				colorId: value.color_id,
				recurrence: recurrenceRule ? [recurrenceRule] : undefined
			},
			taskTracking: {
				taskId: value.task_id,
				eventStart: start.toISOString(),
				eventEnd: end.toISOString(),
				eventTitle: task.title,
				isMasterEvent: Boolean(recurrenceRule),
				recurrenceRule
			}
		});
		return ApiResponse.success({
			success: true,
			event_id: result.providerEventId,
			event_link: result.event.htmlLink ?? undefined,
			calendar_id: result.providerCalendarId,
			calendarSourceId: result.calendarSourceId,
			task_id: value.task_id,
			summary: result.event.summary ?? undefined,
			start: result.event.start ?? undefined,
			end: result.event.end ?? undefined,
			recurrence: result.event.recurrence ?? undefined,
			timeZone: value.timeZone
		});
	}
	const scheduleResult = await calendarService.scheduleTask(user.id, params);
	return ApiResponse.success(scheduleResult);
}
