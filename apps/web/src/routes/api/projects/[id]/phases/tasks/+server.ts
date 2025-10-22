// apps/web/src/routes/api/projects/[id]/phases/tasks/+server.ts
// for moving tasks between phases

import type { RequestHandler } from './$types';
import { ApiResponse } from '$utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';
import type { TaskCalendarEvent, TaskWithCalendarEvents } from '$lib/types/project-page.types';

// Move task between phases
export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId } = params;
		const moveData = await request.json();
		const { taskId, newStartDate, toPhaseId } = moveData;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.badRequest(`Project not found`);
		}

		// Verify task exists and belongs to project
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`*, task_calendar_events(
							id,
							calendar_event_id,
							calendar_id,
							event_start,
							event_end,
							sync_status
						)`
			)
			.eq('id', taskId)
			.eq('project_id', projectId)
			.single();

		if (taskError || !task) {
			return ApiResponse.badRequest(`Task not found`);
		}

		// Verify target phase exists (if not moving to backlog)
		if (toPhaseId && toPhaseId !== 'backlog') {
			const { data: phaseData, error: phaseError } = await supabase
				.from('phases')
				.select('id')
				.eq('id', toPhaseId)
				.eq('project_id', projectId)
				.single();

			if (phaseError || !phaseData) {
				return ApiResponse.badRequest(`Target phase not found`);
			}
		}

		await supabase.from('phase_tasks').delete().eq('task_id', taskId);

		// Set task start_date to null
		const { error: updateError } = await supabase
			.from('tasks')
			.update({
				start_date: newStartDate || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		if (updateError) {
			console.error('Error updating task start date:', updateError);
			return ApiResponse.internalError('Failed to update task date');
		}

		// Add to new phase (if not moving to backlog)
		if (toPhaseId && toPhaseId !== 'backlog') {
			// Get the maximum order for this phase to append at the end
			const { data: maxOrderTask } = await supabase
				.from('phase_tasks')
				.select('order')
				.eq('phase_id', toPhaseId)
				.order('order', { ascending: false })
				.limit(1)
				.maybeSingle();

			const newOrder = maxOrderTask ? maxOrderTask.order + 1 : 1;

			const { error: insertError } = await supabase.from('phase_tasks').insert({
				phase_id: toPhaseId,
				task_id: taskId,
				suggested_start_date: newStartDate || null,
				assignment_reason: 'Manual assignment',
				order: newOrder
			});

			if (insertError) {
				console.error('Error assigning task to phase:', insertError);
				return ApiResponse.internalError('Failed to assign task to phase');
			}
		}

		// Delete calendar events using bulk operation
		await checkAndDeleteCalendarEvents(task as TaskWithCalendarEvents, user, supabase);

		return ApiResponse.success();
	} catch (error) {
		console.error('Error moving task:', error);
		return ApiResponse.internalError(error);
	}
};

const checkAndDeleteCalendarEvents = async (
	task: Partial<TaskWithCalendarEvents>,
	user: any,
	supabase: any
) => {
	if (task.task_calendar_events && task.task_calendar_events.length > 0) {
		// Filter out already deleted events
		const eventsToDelete = task.task_calendar_events.filter(
			(event: TaskCalendarEvent) => event.sync_status !== 'deleted'
		);

		if (eventsToDelete.length > 0) {
			try {
				const calendarService = new CalendarService(supabase);

				// Use the bulk delete method with optimized parallel processing
				const result = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					eventsToDelete.map((event) => ({
						id: event.id,
						calendar_event_id: event.calendar_event_id,
						calendar_id: event.calendar_id
					})),
					{
						reason: 'Task moved to backlog due to phase date change',
						batchSize: 5 // Process 5 events in parallel
					}
				);

				if (!result.success) {
					console.error(
						`Error deleting calendar events for task ${task.id}:`,
						result.errors.join(', ')
					);

					if (result.warnings.length > 0) {
						console.warn('Warnings during deletion:', result.warnings);
					}
				} else {
					console.log(
						`Successfully deleted ${result.deletedCount} calendar events for task ${task.id}`
					);
				}
			} catch (calendarError) {
				console.error(`Error calling calendar service for task ${task.id}:`, calendarError);
			}
		}
	}
};
