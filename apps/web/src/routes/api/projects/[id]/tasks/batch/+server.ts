// src/routes/api/projects/[id]/tasks/batch/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { cleanDataForTable } from '$lib/utils/data-cleaner';
import { CalendarService } from '$lib/services/calendar-service';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { updates } = await request.json();

		if (!Array.isArray(updates) || updates.length === 0) {
			return ApiResponse.badRequest('No updates provided');
		}

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (projectError) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Verify all tasks belong to this project and user
		const taskIds = updates.map((u) => u.id);
		const { data: tasks, error: tasksError } = await supabase
			.from('tasks')
			.select('id')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.in('id', taskIds);

		if (tasksError) {
			return ApiResponse.databaseError(tasksError);
		}

		const validTaskIds = tasks?.map((t) => t.id) || [];
		const invalidTaskIds = taskIds.filter((id) => !validTaskIds.includes(id));

		if (invalidTaskIds.length > 0) {
			return ApiResponse.badRequest('Some tasks not found or unauthorized', {
				invalidTaskIds
			});
		}

		// Process updates
		const results = {
			successful: [] as any[],
			failed: [] as any[],
			warnings: [] as string[],
			errors: [] as string[],
			calendarSyncRequired: [] as any[]
		};

		// Get project for end date reference
		const { data: projectData } = await supabase
			.from('projects')
			.select('end_date')
			.eq('id', params.id)
			.single();

		// Use a transaction-like approach with Promise.all
		const updatePromises = updates.map(async ({ id, data }) => {
			try {
				// Get existing task to check for type changes and calendar sync needs
				const { data: existingTask } = await supabase
					.from('tasks')
					.select(
						'task_type, start_date, duration_minutes, title, task_calendar_events(*)'
					)
					.eq('id', id)
					.single();

				// Track if calendar sync is needed
				let needsCalendarSync = false;
				let calendarOperation: 'update' | 'delete' | 'create' | null = null;

				// Clear recurring data when changing to one_off
				if (data.task_type === 'one_off' && existingTask?.task_type === 'recurring') {
					data.recurrence_pattern = null;
					data.recurrence_ends = null;
					data.recurrence_end_source = null;
					// If there are calendar events, they need to be deleted
					if (existingTask.task_calendar_events?.length > 0) {
						needsCalendarSync = true;
						calendarOperation = 'delete';
					}
				}
				// Apply recurrence end date logic if needed for recurring tasks
				else if (data.task_type === 'recurring' && data.recurrence_ends === null) {
					if (projectData?.end_date) {
						data.recurrence_ends = projectData.end_date;
						data.recurrence_end_source = 'project_inherited';
					} else {
						data.recurrence_end_source = 'indefinite';
					}
				} else if (data.task_type === 'recurring' && data.recurrence_ends) {
					data.recurrence_end_source = 'user_specified';
				}

				// Check if date changes require calendar sync
				if (data.start_date && data.start_date !== existingTask?.start_date) {
					if (existingTask?.task_calendar_events?.length > 0) {
						needsCalendarSync = true;
						calendarOperation = 'update';
					}
				}

				// Check if task is being marked as done (should remove from calendar)
				if (data.status === 'done' && existingTask?.task_calendar_events?.length > 0) {
					needsCalendarSync = true;
					calendarOperation = 'delete';
				}

				// Check if start_date is being cleared (should remove from calendar)
				if (data.start_date === null && existingTask?.task_calendar_events?.length > 0) {
					needsCalendarSync = true;
					calendarOperation = 'delete';
				}

				// Clean the task data
				const cleanedData = cleanDataForTable('tasks', {
					...data,
					updated_at: new Date().toISOString()
				});

				const { data: updatedTask, error } = await supabase
					.from('tasks')
					.update(cleanedData)
					.eq('id', id)
					.eq('project_id', params.id)
					.eq('user_id', user.id)
					.select('*, task_calendar_events(*)')
					.single();

				if (error) {
					results.failed.push({ id, error: error.message });
					results.errors.push(`Failed to update task ${id}: ${error.message}`);
				} else {
					results.successful.push(updatedTask);

					// Track calendar sync needs
					if (needsCalendarSync && updatedTask) {
						results.calendarSyncRequired.push({
							task: updatedTask,
							operation: calendarOperation,
							existingEvents: existingTask?.task_calendar_events || []
						});
					}
				}
			} catch (err) {
				results.failed.push({
					id,
					error: err instanceof Error ? err.message : 'Unknown error'
				});
				results.errors.push(
					`Failed to update task ${id}: ${err instanceof Error ? err.message : 'Unknown error'}`
				);
			}
		});

		await Promise.all(updatePromises);

		// Handle calendar synchronization for affected tasks
		if (results.calendarSyncRequired.length > 0) {
			try {
				const calendarService = new CalendarService(supabase);
				const calendarUpdates = [];
				const calendarDeletions = [];

				for (const { task, operation, existingEvents } of results.calendarSyncRequired) {
					if (operation === 'delete' && existingEvents.length > 0) {
						// Collect events to delete
						calendarDeletions.push(
							...existingEvents.map((e: any) => ({
								event_id: e.calendar_event_id,
								calendar_id: e.calendar_id || 'primary'
							}))
						);
					} else if (
						operation === 'update' &&
						existingEvents.length > 0 &&
						task.start_date
					) {
						// Prepare update operations
						const startTime = new Date(task.start_date);
						const endTime = new Date(startTime);
						endTime.setMinutes(startTime.getMinutes() + (task.duration_minutes || 60));

						for (const event of existingEvents) {
							calendarUpdates.push({
								event_id: event.calendar_event_id,
								calendar_id: event.calendar_id || 'primary',
								start_time: startTime.toISOString(),
								end_time: endTime.toISOString(),
								summary: task.title
							});
						}
					}
				}

				// Execute calendar deletions
				if (calendarDeletions.length > 0) {
					const deleteResult = await calendarService.bulkDeleteCalendarEvents(
						user.id,
						calendarDeletions,
						{ batchSize: 5 }
					);
					results.warnings.push(
						`Calendar sync: ${deleteResult.deleted} events deleted, ${deleteResult.failed} failed`
					);
				}

				// Execute calendar updates
				if (calendarUpdates.length > 0) {
					const updateResult = await calendarService.bulkUpdateCalendarEvents(
						user.id,
						calendarUpdates,
						{ batchSize: 5 }
					);
					results.warnings.push(
						`Calendar sync: ${updateResult.updated} events updated, ${updateResult.failed} failed`
					);
				}
			} catch (calendarError) {
				console.error('Calendar sync failed during batch update:', calendarError);
				results.warnings.push('Some calendar events may not have been updated');
			}
		}

		// Add summary warning if some updates failed
		if (results.failed.length > 0) {
			results.warnings.push(
				`${results.successful.length} tasks updated successfully, ${results.failed.length} failed.`
			);
		}

		return ApiResponse.success({
			successful: results.successful,
			failed: results.failed,
			summary: {
				total: updates.length,
				successful: results.successful.length,
				failed: results.failed.length
			}
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const { id: projectId } = params;
	const taskIds = url.searchParams.getAll('ids[]');

	// Verify user has access to the project

	try {
		// Fetch tasks from database

		const { data: tasks, error: tasksError } = await supabase
			.from('tasks')
			.select(`*, task_calendar_events(*)`)
			.in('id', taskIds)
			.eq('project_id', projectId)
			.eq('user_id', user.id);

		if (tasksError) {
			console.log(tasksError);
			throw Error('Failed to get tasks', tasksError);
		}

		return ApiResponse.success({ tasks });
	} catch (error) {
		console.error('Error fetching tasks:', error);

		return ApiResponse.databaseError(error);
	}
};
