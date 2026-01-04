// apps/web/src/routes/api/projects/[id]/calendar/+server.ts
import type { RequestHandler } from './$types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';

const CALENDAR_SYNC_BATCH_SIZE = 5;
const DB_BATCH_SIZE = 100;

async function mapInBatches<T, R>(
	items: T[],
	batchSize: number,
	mapper: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map(mapper));
		results.push(...batchResults);
	}
	return results;
}

function chunk<T>(items: T[], batchSize: number): T[][] {
	const batches: T[][] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		batches.push(items.slice(i, i + batchSize));
	}
	return batches;
}

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

			type TaskEventUpdate =
				Database['public']['Tables']['task_calendar_events']['Update'] & {
					id: string;
				};
			const now = new Date().toISOString();

			const eventsToDelete = taskEvents.filter(
				(taskEvent) =>
					taskEvent.calendar_event_id &&
					taskEvent.calendar_id &&
					taskEvent.calendar_id !== googleCalendarId
			);

			await mapInBatches(eventsToDelete, CALENDAR_SYNC_BATCH_SIZE, async (taskEvent) => {
				const oldCalendarId = taskEvent.calendar_id;
				const oldEventId = taskEvent.calendar_event_id;
				if (!oldEventId || !oldCalendarId) return;

				console.log(`Deleting old event ${oldEventId} from calendar ${oldCalendarId}`);
				try {
					await calendarService.deleteCalendarEvent(userId, {
						event_id: oldEventId,
						calendar_id: oldCalendarId,
						send_notifications: false
					});
					console.log(`Successfully deleted old event ${oldEventId}`);
				} catch (deleteError: any) {
					console.log(`Could not delete old event ${oldEventId}: ${deleteError.message}`);
				}
			});

			const updates = await mapInBatches(
				taskEvents,
				CALENDAR_SYNC_BATCH_SIZE,
				async (taskEvent): Promise<TaskEventUpdate | null> => {
					const task = taskEvent.tasks;
					const eventStartTime = taskEvent.event_start || task?.start_date;

					if (!eventStartTime) {
						console.log(`Skipping task ${taskEvent.task_id} - no start time available`);
						return null;
					}

					console.log(
						`Creating new event for task ${taskEvent.task_id} in project calendar`
					);

					let durationMinutes = task?.duration_minutes || 60;
					if (taskEvent.event_end && taskEvent.event_start) {
						durationMinutes = Math.floor(
							(new Date(taskEvent.event_end).getTime() -
								new Date(taskEvent.event_start).getTime()) /
								60000
						);
					}

					try {
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

						if (scheduleResult.success && scheduleResult.event_id) {
							console.log(
								`Successfully migrated event for task ${taskEvent.task_id}`
							);
							return {
								id: taskEvent.id,
								project_calendar_id: projectCalendarId,
								calendar_id: googleCalendarId,
								calendar_event_id: scheduleResult.event_id,
								event_link: scheduleResult.event_link || null,
								sync_status: 'synced' as Database['public']['Enums']['sync_status'],
								last_synced_at: now,
								sync_error: null,
								updated_at: now
							};
						}

						console.error(
							`Failed to create new event for task ${taskEvent.task_id}:`,
							'No event ID returned'
						);
						return {
							id: taskEvent.id,
							project_calendar_id: projectCalendarId,
							calendar_id: googleCalendarId,
							calendar_event_id: taskEvent.calendar_event_id,
							event_link: taskEvent.event_link || null,
							sync_status: 'error' as Database['public']['Enums']['sync_status'],
							last_synced_at: taskEvent.last_synced_at,
							sync_error: 'Failed to create event - no event ID returned',
							updated_at: now
						};
					} catch (error) {
						console.error(`Error migrating event ${taskEvent.id}:`, error);
						return {
							id: taskEvent.id,
							project_calendar_id: projectCalendarId,
							calendar_id: googleCalendarId,
							calendar_event_id: taskEvent.calendar_event_id,
							event_link: taskEvent.event_link || null,
							sync_status: 'error' as Database['public']['Enums']['sync_status'],
							last_synced_at: taskEvent.last_synced_at,
							sync_error: error instanceof Error ? error.message : 'Migration failed',
							updated_at: now
						};
					}
				}
			);

			const cleanedUpdates = updates.filter(
				(update): update is TaskEventUpdate => update !== null
			);

			if (cleanedUpdates.length > 0) {
				for (const batch of chunk(cleanedUpdates, DB_BATCH_SIZE)) {
					const { error: upsertError } = await supabase
						.from('task_calendar_events')
						.upsert(batch, { onConflict: 'id' });

					if (upsertError) {
						console.error('Error updating task calendar events batch:', upsertError);
						for (const update of batch) {
							const { id, ...updateData } = update;
							const { error: singleError } = await supabase
								.from('task_calendar_events')
								.update(updateData)
								.eq('id', id);
							if (singleError) {
								console.error(
									'Error updating task calendar event fallback:',
									singleError
								);
							}
						}
					}
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

				type TaskEventInsert =
					Database['public']['Tables']['task_calendar_events']['Insert'];
				const insertTimestamp = new Date().toISOString();

				const newEvents = await mapInBatches(
					tasksWithoutEvents,
					CALENDAR_SYNC_BATCH_SIZE,
					async (task): Promise<TaskEventInsert | null> => {
						try {
							if (!task.start_date) {
								console.log(`Skipping task ${task.id} - no start_date`);
								return null;
							}

							const scheduleResult = await calendarService.scheduleTask(userId, {
								task_id: task.id,
								start_time: task.start_date,
								duration_minutes: task.duration_minutes || 60,
								calendar_id: googleCalendarId,
								description: task.description || task.title,
								recurrence_pattern: task.recurrence_pattern || undefined,
								recurrence_ends: task.recurrence_ends || undefined
							});

							if (scheduleResult.success && scheduleResult.event_id) {
								const eventStart = new Date(task.start_date);
								const eventEnd = new Date(
									eventStart.getTime() + (task.duration_minutes || 60) * 60000
								);

								return {
									task_id: task.id,
									user_id: userId,
									calendar_id: googleCalendarId,
									project_calendar_id: projectCalendarId,
									calendar_event_id: scheduleResult.event_id,
									event_title: task.title,
									event_start: task.start_date,
									event_end: eventEnd.toISOString(),
									event_link: scheduleResult.event_link || null,
									sync_status:
										'synced' as Database['public']['Enums']['sync_status'],
									sync_source: 'build_os',
									last_synced_at: insertTimestamp
								};
							}

							console.error(
								`Failed to schedule task ${task.id}:`,
								'No event ID returned'
							);
							return null;
						} catch (error) {
							console.error(`Error processing task ${task.id}:`, error);
							return null;
						}
					}
				);

				const inserts = newEvents.filter(
					(event): event is TaskEventInsert => event !== null
				);

				if (inserts.length > 0) {
					for (const batch of chunk(inserts, DB_BATCH_SIZE)) {
						const { error: insertError } = await supabase
							.from('task_calendar_events')
							.insert(batch);

						if (insertError) {
							console.error('Error creating calendar event batch:', insertError);
							for (const eventData of batch) {
								const { error: singleError } = await supabase
									.from('task_calendar_events')
									.insert(eventData);
								if (singleError) {
									console.error(
										'Error creating calendar event record fallback:',
										singleError
									);
								}
							}
						}
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
