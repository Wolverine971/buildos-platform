// apps/web/src/routes/api/projects/[id]/phases/[phaseId]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';

// Update phase (name, description, dates)
export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession },
	fetch
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId, phaseId } = params;
		const updates = await request.json();

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		// Verify phase belongs to project
		const { data: phase, error: phaseError } = await supabase
			.from('phases')
			.select('*')
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.single();

		if (phaseError || !phase) {
			return ApiResponse.notFound('Phase not found');
		}

		// Validate dates if being updated
		if (updates.start_date && updates.end_date) {
			const startDate = new Date(updates.start_date);
			const endDate = new Date(updates.end_date);

			if (startDate >= endDate) {
				return ApiResponse.badRequest('End date must be after start date');
			}

			// Check for tasks that need to be moved to backlog
			const { data: phaseTasks } = await supabase
				.from('phase_tasks')
				.select(
					`
					task_id,
					tasks!inner(
						id,
						title,
						start_date,
						status,
						task_calendar_events(
							id,
							calendar_event_id,
							calendar_id,
							event_start,
							event_end,
							sync_status
						)
					)
				`
				)
				.eq('phase_id', phaseId);

			if (phaseTasks && phaseTasks.length > 0) {
				// Find tasks with start_dates outside the new phase timeframe
				const tasksToMoveToBacklog = phaseTasks.filter((pt) => {
					const task = pt.tasks as any;
					if (!task.start_date || task.status === 'done') return false;

					const taskStart = new Date(task.start_date);
					return taskStart < startDate || taskStart > endDate;
				});

				if (tasksToMoveToBacklog.length > 0) {
					const movedTasks = [];
					const calendarDeletionErrors = [];

					// Collect all calendar events to delete
					const allEventsToDelete = [];
					const taskIdToTitleMap = new Map();

					for (const phaseTask of tasksToMoveToBacklog) {
						const task = phaseTask.tasks as any;
						taskIdToTitleMap.set(task.id, task.title);

						try {
							// Set task start_date to null (move to backlog)
							await supabase
								.from('tasks')
								.update({
									start_date: null,
									updated_at: new Date().toISOString()
								})
								.eq('id', task.id);

							// Remove phase_tasks association
							await supabase
								.from('phase_tasks')
								.delete()
								.eq('task_id', task.id)
								.eq('phase_id', phaseId);

							// Collect calendar events for bulk deletion
							if (task.task_calendar_events && task.task_calendar_events.length > 0) {
								const eventsToDelete = task.task_calendar_events.filter(
									(event: any) => event.sync_status !== 'deleted'
								);

								eventsToDelete.forEach((event: any) => {
									allEventsToDelete.push({
										id: event.id,
										calendar_event_id: event.calendar_event_id,
										calendar_id: event.calendar_id,
										task_id: task.id // Keep track of which task this belongs to
									});
								});
							}

							movedTasks.push({
								task_id: task.id,
								task_title: task.title,
								original_start_date: task.start_date
							});
						} catch (error) {
							console.error(`Error moving task ${task.id} to backlog:`, error);
							calendarDeletionErrors.push({
								task_id: task.id,
								task_title: task.title,
								error:
									error instanceof Error ? error.message : 'Failed to move task'
							});
						}
					}

					// Bulk delete all calendar events at once
					if (allEventsToDelete.length > 0) {
						try {
							const calendarService = new CalendarService(supabase);
							const deleteResult = await calendarService.bulkDeleteCalendarEvents(
								user.id,
								allEventsToDelete.map((event) => ({
									id: event.id,
									calendar_event_id: event.calendar_event_id,
									calendar_id: event.calendar_id
								})),
								{
									reason: 'Tasks moved to backlog due to phase date change',
									batchSize: 10 // Process more in parallel since we have multiple tasks
								}
							);

							if (!deleteResult.success) {
								console.error(
									`Failed to delete some calendar events:`,
									deleteResult.errors
								);

								// Map errors back to tasks
								allEventsToDelete.forEach((event) => {
									if (
										deleteResult.warnings.some((w) =>
											w.includes(event.calendar_event_id)
										)
									) {
										calendarDeletionErrors.push({
											task_id: event.task_id,
											task_title: taskIdToTitleMap.get(event.task_id),
											error: 'Failed to delete calendar event'
										});
									}
								});
							}

							console.log(
								`Deleted ${deleteResult.deletedCount} calendar events in bulk operation`
							);
						} catch (calendarError) {
							console.error('Error in bulk calendar deletion:', calendarError);
							// Add error for all affected tasks
							movedTasks.forEach((task) => {
								calendarDeletionErrors.push({
									task_id: task.task_id,
									task_title: task.task_title,
									error: 'Bulk calendar deletion failed'
								});
							});
						}
					}

					// Update phase after handling tasks
					const { data: updatedPhase, error: updateError } = await supabase
						.from('phases')
						.update({
							...updates,
							updated_at: new Date().toISOString()
						})
						.select(
							`
					*,
					phase_tasks (
						task_id,
						suggested_start_date,
						assignment_reason,
						tasks (
							id,
							title,
							description,
							status,
							priority,
							task_type,
							start_date,
							deleted_at,
							created_at,
							updated_at,
							details,
							completed_at,
							task_calendar_events(
								id,
								calendar_event_id,
								calendar_id,
								event_start,
								event_end,
								event_link,
								sync_status
							)
						)
					)
				`
						)
						.eq('id', phaseId)
						.single();

					if (updateError) {
						console.error('Error updating phase:', updateError);
						return ApiResponse.databaseError(updateError);
					}

					// Return results with information about moved tasks
					const response: any = {
						moved_to_backlog: movedTasks
					};

					if (calendarDeletionErrors.length > 0) {
						response.calendar_deletion_errors = calendarDeletionErrors;
						response.warning =
							'Some calendar events could not be deleted. Please check your calendar manually.';
					}

					if (movedTasks.length > 0) {
						const taskTitles = movedTasks.map((t) => t.task_title).join(', ');
						response.message = `${movedTasks.length} task(s) were moved to backlog because their dates were outside the new phase timeframe: ${taskTitles}`;
					}

					return ApiResponse.success({ phase: updatedPhase });
				}
			}
		}

		// Update phase when no tasks need to be moved to backlog
		const { data: updatedPhase, error: updateError } = await supabase
			.from('phases')
			.update({
				...updates,
				updated_at: new Date().toISOString()
			})
			.eq('id', phaseId)
			.select(
				`
					*,
					phase_tasks (
						task_id,
						suggested_start_date,
						assignment_reason,
						tasks (
							id,
							title,
							description,
							status,
							priority,
							task_type,
							start_date,
							deleted_at,
							created_at,
							updated_at,
							details,
							completed_at,
							task_calendar_events(
								id,
								calendar_event_id,
								calendar_id,
								event_start,
								event_end,
								event_link,
								sync_status
							)
						)
					)
				`
			)
			.single();

		if (updateError) {
			console.error('Error updating phase:', updateError);
			return ApiResponse.databaseError(updateError);
		}
		const tasks = updatedPhase.phase_tasks.map((pt) => pt.tasks);

		return ApiResponse.success({ phase: { ...updatedPhase, tasks } });
	} catch (error) {
		console.error('Error in phase update:', error);
		return ApiResponse.internalError(error);
	}
};

// Delete phase
export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId, phaseId } = params;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		// Get the phase to be deleted
		const { data: phaseToDelete, error: phaseError } = await supabase
			.from('phases')
			.select('order')
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.single();

		if (phaseError || !phaseToDelete) {
			return ApiResponse.notFound('Phase not found');
		}

		// Move all tasks in this phase to backlog (delete phase_tasks entries)
		await supabase.from('phase_tasks').delete().eq('phase_id', phaseId);

		// Delete the phase
		const { error: deleteError } = await supabase.from('phases').delete().eq('id', phaseId);

		if (deleteError) {
			console.error('Error deleting phase:', deleteError);
			return ApiResponse.databaseError(deleteError);
		}

		// Update order of remaining phases
		await supabase.rpc('decrement_phase_order', {
			p_project_id: projectId,
			p_order_threshold: phaseToDelete.order
		});

		return ApiResponse.success({});
	} catch (error) {
		console.error('Error in phase delete:', error);
		return ApiResponse.internalError(error);
	}
};
