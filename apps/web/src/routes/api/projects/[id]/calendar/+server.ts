// apps/web/src/routes/api/projects/[id]/calendar/+server.ts
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';

/**
 * Background process to migrate all project tasks to use the new project calendar
 * This runs asynchronously and doesn't block the API response
 */
async function migrateTasksToProjectCalendar(
	projectId: string,
	googleCalendarId: string,
	projectCalendarId: string,
	userId: string,
	supabase: SupabaseClient<Database>
) {
	console.log(`Starting background migration of tasks to project calendar ${googleCalendarId}`);

	try {
		const calendarService = new CalendarService(supabase);

		// 1. Get all tasks for this project that have calendar events
		const { data: taskEvents, error: fetchError } = await supabase
			.from('task_calendar_events')
			.select(
				'*, tasks!inner(project_id, title, start_date, duration_minutes, recurrence_pattern, recurrence_ends, description)'
			)
			.eq('tasks.project_id', projectId)
			.eq('user_id', userId);

		if (fetchError) {
			console.error('Error fetching task calendar events:', fetchError);
			return;
		}

		if (!taskEvents || taskEvents.length === 0) {
			console.log('No task calendar events to migrate');
		} else {
			console.log(`Found ${taskEvents.length} task calendar events to migrate`);

			// Process existing events: delete from old calendar and recreate in new calendar
			for (const taskEvent of taskEvents) {
				try {
					const oldCalendarId = taskEvent.calendar_id;
					const oldEventId = taskEvent.calendar_event_id;

					// Delete the old event from Google Calendar if it exists
					if (oldEventId && oldCalendarId && oldCalendarId !== googleCalendarId) {
						console.log(
							`Deleting old event ${oldEventId} from calendar ${oldCalendarId}`
						);
						try {
							await calendarService.deleteCalendarEvent(userId, {
								event_id: oldEventId,
								calendar_id: oldCalendarId,
								send_notifications: false
							});
							console.log(`Successfully deleted old event ${oldEventId}`);
						} catch (deleteError: any) {
							// Event might not exist in Google Calendar anymore
							console.log(
								`Could not delete old event ${oldEventId}: ${deleteError.message}`
							);
						}
					}

					// Create new event in the project calendar
					const task = taskEvent.tasks;
					// Use event_start from task_calendar_events or fall back to task.start_date
					const eventStartTime = taskEvent.event_start || task?.start_date;

					if (eventStartTime) {
						console.log(
							`Creating new event for task ${taskEvent.task_id} in project calendar`
						);

						// Calculate duration from existing event or use task duration
						let durationMinutes = task?.duration_minutes || 60;
						if (taskEvent.event_end && taskEvent.event_start) {
							durationMinutes = Math.floor(
								(new Date(taskEvent.event_end).getTime() -
									new Date(taskEvent.event_start).getTime()) /
									60000
							);
						}

						const scheduleResult = await calendarService.scheduleTask(userId, {
							task_id: taskEvent.task_id,
							start_time: eventStartTime,
							duration_minutes: durationMinutes,
							calendar_id: googleCalendarId,
							description:
								task?.description || taskEvent.event_title || task?.title || 'Task',
							recurrence_pattern: task?.recurrence_pattern || undefined,
							recurrence_ends: task?.recurrence_ends || undefined
						});

						if (scheduleResult.success && scheduleResult.event) {
							// Update the task_calendar_events record with new event info
							await supabase
								.from('task_calendar_events')
								.update({
									project_calendar_id: projectCalendarId,
									calendar_id: googleCalendarId,
									calendar_event_id: scheduleResult.event.id || '',
									event_link: scheduleResult.event.htmlLink || null,
									sync_status:
										'synced' as Database['public']['Enums']['sync_status'],
									last_synced_at: new Date().toISOString(),
									sync_error: null,
									updated_at: new Date().toISOString()
								})
								.eq('id', taskEvent.id);

							console.log(
								`Successfully migrated event for task ${taskEvent.task_id}`
							);
						} else {
							console.error(
								`Failed to create new event for task ${taskEvent.task_id}:`,
								scheduleResult.error
							);
							// Update with error status
							await supabase
								.from('task_calendar_events')
								.update({
									project_calendar_id: projectCalendarId,
									calendar_id: googleCalendarId,
									sync_status:
										'error' as Database['public']['Enums']['sync_status'],
									sync_error: scheduleResult.error || 'Failed to create event',
									updated_at: new Date().toISOString()
								})
								.eq('id', taskEvent.id);
						}
					} else {
						console.log(`Skipping task ${taskEvent.task_id} - no start time available`);
					}
				} catch (error) {
					console.error(`Error migrating event ${taskEvent.id}:`, error);
					// Update with error status
					await supabase
						.from('task_calendar_events')
						.update({
							project_calendar_id: projectCalendarId,
							calendar_id: googleCalendarId,
							sync_status: 'error' as Database['public']['Enums']['sync_status'],
							sync_error: error instanceof Error ? error.message : 'Migration failed',
							updated_at: new Date().toISOString()
						})
						.eq('id', taskEvent.id);
				}
			}
		}

		// 2. Get all tasks for this project that might need calendar events created
		const { data: allTasks, error: tasksError } = await supabase
			.from('tasks')
			.select('*')
			.eq('project_id', projectId)
			.not('start_date', 'is', null);

		if (tasksError) {
			console.error('Error fetching project tasks:', tasksError);
			return;
		}

		if (allTasks && allTasks.length > 0) {
			// Check which tasks don't have calendar events yet
			const { data: existingEvents } = await supabase
				.from('task_calendar_events')
				.select('task_id')
				.eq('user_id', userId)
				.in(
					'task_id',
					allTasks.map((t) => t.id)
				);

			const tasksWithEvents = new Set(existingEvents?.map((e) => e.task_id) || []);
			const tasksWithoutEvents = allTasks.filter((t) => !tasksWithEvents.has(t.id));

			if (tasksWithoutEvents.length > 0) {
				console.log(`Found ${tasksWithoutEvents.length} tasks without calendar events`);

				for (const task of tasksWithoutEvents) {
					try {
						// Skip if no start_date (shouldn't happen due to filter, but be safe)
						if (!task.start_date) {
							console.log(`Skipping task ${task.id} - no start_date`);
							continue;
						}

						// Create a new calendar event in Google Calendar
						const scheduleResult = await calendarService.scheduleTask(userId, {
							task_id: task.id,
							start_time: task.start_date,
							duration_minutes: task.duration_minutes || 60,
							calendar_id: googleCalendarId,
							description: task.description || task.title,
							recurrence_pattern: task.recurrence_pattern || undefined,
							recurrence_ends: task.recurrence_ends || undefined
						});

						if (scheduleResult.success && scheduleResult.event) {
							// Calculate event end time based on duration
							const eventStart = new Date(task.start_date);
							const eventEnd = new Date(
								eventStart.getTime() + (task.duration_minutes || 60) * 60000
							);

							// Create the task_calendar_events record
							const eventData = {
								task_id: task.id,
								user_id: userId,
								calendar_id: googleCalendarId,
								project_calendar_id: projectCalendarId,
								calendar_event_id: scheduleResult.event.id || '',
								event_title: task.title,
								event_start: task.start_date,
								event_end: eventEnd.toISOString(),
								event_link: scheduleResult.event.htmlLink || null,
								sync_status: 'synced' as Database['public']['Enums']['sync_status'],
								sync_source: 'build_os',
								last_synced_at: new Date().toISOString()
							};

							const { error: insertError } = await supabase
								.from('task_calendar_events')
								.insert(eventData);

							if (insertError) {
								console.error(
									`Error creating calendar event record for task ${task.id}:`,
									insertError
								);
							} else {
								console.log(
									`Successfully created calendar event for task ${task.id}`
								);
							}
						} else {
							console.error(
								`Failed to schedule task ${task.id}:`,
								scheduleResult.error
							);
						}
					} catch (error) {
						console.error(`Error processing task ${task.id}:`, error);
					}
				}

				console.log(`Processed ${tasksWithoutEvents.length} tasks without events`);
			}
		}

		// 3. Mark the project as having calendar sync enabled
		const { error: projectUpdateError } = await supabase
			.from('projects')
			.update({
				calendar_sync_enabled: true,
				updated_at: new Date().toISOString()
			})
			.eq('id', projectId);

		if (projectUpdateError) {
			console.error('Error updating project with calendar sync status:', projectUpdateError);
		}

		// 4. Update the project_calendars record with last sync time
		const { error: calendarUpdateError } = await supabase
			.from('project_calendars')
			.update({
				last_synced_at: new Date().toISOString(),
				sync_status: 'active' as Database['public']['Enums']['calendar_sync_status']
			})
			.eq('id', projectCalendarId);

		if (calendarUpdateError) {
			console.error('Error updating project calendar sync status:', calendarUpdateError);
		}

		console.log(`Background migration completed for project ${projectId}`);
	} catch (error) {
		console.error('Error in background task migration:', error);
		// Log error but don't throw - this is a background process
	}
}

/**
 * GET /api/projects/[id]/calendar
 * Get project calendar details
 */
export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;
	const service = new ProjectCalendarService(supabase);

	const response = await service.getProjectCalendar(projectId, session.user.id);

	const result = await response.json();
	// Return using ApiResponse based on the service result
	if (result.success) {
		return ApiResponse.success(result.data, result.message);
	} else {
		return ApiResponse.error(result.error || 'Failed to get calendar', 400);
	}
};

/**
 * POST /api/projects/[id]/calendar
 * Create a new Google Calendar for the project
 */
export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized();
	}

	try {
		const body = await request.json();
		const projectId = params.id;
		const service = new ProjectCalendarService(supabase);

		const response = await service.createProjectCalendar({
			projectId,
			userId: session.user.id,
			name: body.name,
			description: body.description,
			colorId: body.colorId,
			timeZone: body.timeZone
		});
		const result = await response.json();

		// Return using ApiResponse based on the service result
		if (result.success) {
			// Trigger background process to migrate tasks to the new calendar
			// This runs asynchronously without blocking the response
			migrateTasksToProjectCalendar(
				projectId,
				result.data.calendar_id,
				result.data.id,
				session.user.id,
				supabase
			).catch((error) => {
				console.error('Background task migration failed:', error);
				// Don't fail the calendar creation if migration fails
			});

			return ApiResponse.created(
				result.data,
				result.message || 'Calendar created successfully'
			);
		} else {
			return ApiResponse.error(result.error || 'Failed to create calendar', 400);
		}
	} catch (error: any) {
		console.error('Error creating project calendar:', error);
		return ApiResponse.internalError(error, 'Failed to create project calendar');
	}
};

/**
 * PUT /api/projects/[id]/calendar
 * Update project calendar settings
 */
export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized();
	}

	try {
		const body = await request.json();
		const projectId = params.id;
		const service = new ProjectCalendarService(supabase);

		const response = await service.updateProjectCalendar(projectId, session.user.id, {
			name: body.name,
			description: body.description,
			colorId: body.colorId,
			syncEnabled: body.syncEnabled
		});

		const result = await response.json();
		// Return using ApiResponse based on the service result
		if (result.success) {
			return ApiResponse.success(
				result.data,
				result.message || 'Calendar updated successfully'
			);
		} else {
			return ApiResponse.error(result.error || 'Failed to update calendar', 400);
		}
	} catch (error: any) {
		console.error('Error updating project calendar:', error);
		return ApiResponse.internalError(error, 'Failed to update project calendar');
	}
};

/**
 * DELETE /api/projects/[id]/calendar
 * Delete the project calendar
 */
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;
	const service = new ProjectCalendarService(supabase);

	const response = await service.deleteProjectCalendar(projectId, session.user.id);

	const result = await response.json();
	// Return using ApiResponse based on the service result
	if (result.success) {
		return ApiResponse.success(result.data, result.message || 'Calendar deleted successfully');
	} else {
		return ApiResponse.error(result.error || 'Failed to delete calendar', 400);
	}
};
