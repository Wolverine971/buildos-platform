// src/routes/api/projects/[id]/tasks/unschedule-all/+server.ts
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$utils/api-response';

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
		const body = await request.json();
		const { removeCalendarEvents = true, clearDates = false, moveToBacklog = false } = body;

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.error('Project not found', 404);
		}

		// Get tasks based on what we're doing
		// If clearDates is true, get ALL tasks in the project
		// If moving to backlog, get ALL tasks in phases
		// Otherwise, get only scheduled tasks
		let tasksQuery = supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events (*),
				phase_tasks (phase_id)
			`
			)
			.eq('project_id', projectId)
			.is('deleted_at', null);

		if (clearDates) {
			// Get ALL tasks in the project when clearing dates
			// No additional filtering needed - we want all tasks
		} else if (moveToBacklog) {
			// Get all tasks that are in phases (have phase associations)
			const { data: phaseTasks, error: phaseTasksError } = await supabase
				.from('phase_tasks')
				.select('task_id')
				.in(
					'phase_id',
					// Get all phase IDs for this project
					(
						await supabase.from('phases').select('id').eq('project_id', projectId)
					).data?.map((p) => p.id) || []
				);

			if (phaseTasksError) {
				console.error('Failed to fetch phase tasks:', phaseTasksError);
				return ApiResponse.error('Failed to fetch phase tasks', 500);
			}

			const taskIds = phaseTasks?.map((pt) => pt.task_id) || [];
			if (taskIds.length === 0) {
				return ApiResponse.success({
					unscheduledTasks: [],
					totalUnscheduled: 0,
					calendarEventsRemoved: 0
				});
			}

			tasksQuery = tasksQuery.in('id', taskIds);
		} else {
			// Only get scheduled tasks
			tasksQuery = tasksQuery.not('start_date', 'is', null);
		}

		const { data: tasks, error: tasksError } = await tasksQuery;

		if (tasksError) {
			console.error('Failed to fetch tasks:', tasksError);
			return ApiResponse.error('Failed to fetch tasks', 500);
		}

		if (!tasks || tasks.length === 0) {
			return ApiResponse.success({
				unscheduledTasks: [],
				totalUnscheduled: 0,
				calendarEventsRemoved: 0
			});
		}

		const now = new Date().toISOString();
		let calendarEventsRemoved = 0;

		// Get user's calendar credentials if we need to remove calendar events
		let calendarService: CalendarService | null = null;

		if (removeCalendarEvents) {
			calendarService = new CalendarService(supabase);
		}

		// Prepare bulk updates for tasks
		const taskIds = tasks.map((t) => t.id);
		const updates: any = {
			updated_at: now
		};

		// Clear dates if clearDates is true OR if moving to backlog
		// (tasks in backlog shouldn't have dates)
		if (clearDates || moveToBacklog) {
			updates.start_date = null;
			updates.completed_at = null; // Clear completion date if present
			// Note: tasks don't have a due_date field in the database
		}

		// Bulk update all tasks
		const { data: updatedTasks, error: updateError } = await supabase
			.from('tasks')
			.update(updates)
			.in('id', taskIds)
			.select('*, task_calendar_events(*)');

		if (updateError) {
			console.error('Failed to update tasks:', updateError);
			return ApiResponse.error('Failed to update tasks', 500);
		}

		// Bulk remove phase_tasks associations if moveToBacklog is true
		if (moveToBacklog) {
			const { error: phaseTaskDeleteError } = await supabase
				.from('phase_tasks')
				.delete()
				.in('task_id', taskIds);

			if (phaseTaskDeleteError) {
				console.error('Failed to delete phase_tasks:', phaseTaskDeleteError);
			}
		}

		// Collect all calendar events to remove
		const calendarEventsToDelete: Array<{
			event_id: string;
			calendar_id: string;
			record_id: string;
		}> = [];

		for (const task of tasks) {
			if (task.task_calendar_events?.length > 0) {
				for (const eventRecord of task.task_calendar_events) {
					if (eventRecord.calendar_event_id) {
						calendarEventsToDelete.push({
							event_id: eventRecord.calendar_event_id,
							calendar_id: eventRecord.calendar_id || 'primary',
							record_id: eventRecord.id
						});
					}
				}
			}
		}

		// Bulk delete calendar events if needed
		if (removeCalendarEvents && calendarEventsToDelete.length > 0) {
			// Delete from Google Calendar using bulk operation
			if (calendarService) {
				try {
					const deleteRequests = calendarEventsToDelete.map((event) => ({
						id: event.record_id,
						calendar_event_id: event.event_id,
						calendar_id: event.calendar_id
					}));

					const result = await calendarService.bulkDeleteCalendarEvents(
						user.id,
						deleteRequests
					);
					calendarEventsRemoved = result.deletedCount;

					if (result.errors.length > 0) {
						console.error('Some calendar events failed to delete:', result.errors);
					}
				} catch (calendarError) {
					console.error('Failed to bulk delete calendar events:', calendarError);
				}
			}

			// Bulk delete calendar event records from database
			const recordIds = calendarEventsToDelete.map((e) => e.record_id);
			const { error: deleteError } = await supabase
				.from('task_calendar_events')
				.delete()
				.in('id', recordIds);

			if (deleteError) {
				console.error('Failed to delete calendar event records:', deleteError);
			}
		}

		// Return updated tasks without calendar events
		const unscheduledTasks =
			updatedTasks?.map((task) => ({
				...task,
				task_calendar_events: []
			})) || [];

		// Handle recurring tasks if any
		const recurringTasks = tasks.filter((t) => t.recurrence_pattern);
		if (recurringTasks.length > 0 || clearDates) {
			// When clearDates is true, we need to handle ALL tasks that might have recurrence
			const taskIdsToClean = clearDates ? taskIds : recurringTasks.map((t) => t.id);

			// Bulk delete all recurring task instances
			const { error: instanceDeleteError } = await supabase
				.from('recurring_task_instances')
				.delete()
				.in('task_id', taskIdsToClean);

			if (instanceDeleteError) {
				console.error('Failed to delete recurring instances:', instanceDeleteError);
			}

			// Clear recurrence pattern when unscheduling recurring tasks
			// Always clear recurrence if we're clearing dates OR moveToBacklog
			if (clearDates || moveToBacklog) {
				const { error: recurrenceUpdateError } = await supabase
					.from('tasks')
					.update({
						recurrence_pattern: null,
						recurrence_ends: null,
						recurrence_end_source: null,
						task_type: 'one_off' // Convert to one-off when unscheduling
					})
					.in('id', taskIdsToClean);

				if (recurrenceUpdateError) {
					console.error('Failed to clear recurrence patterns:', recurrenceUpdateError);
				}
			}
		}

		return ApiResponse.success({
			unscheduledTasks,
			totalUnscheduled: unscheduledTasks.length,
			calendarEventsRemoved
		});
	} catch (error) {
		console.error('Error unscheduling tasks:', error);
		return ApiResponse.error('Failed to unschedule tasks', 500);
	}
};
