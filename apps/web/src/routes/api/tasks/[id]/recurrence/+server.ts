// src/routes/api/tasks/[id]/recurrence/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { recurrencePatternBuilder } from '$lib/services/recurrence-pattern.service';
import { CalendarService } from '$lib/services/calendar-service';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: taskId } = params;

		// Get task details
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events (*)
			`
			)
			.eq('id', taskId)
			.eq('user_id', user.id)
			.single();

		if (taskError || !task) {
			return ApiResponse.notFound('Task not found');
		}

		if (task.task_type !== 'recurring') {
			return ApiResponse.badRequest('Task is not recurring');
		}

		// Get existing instances
		const { data: instances, error: instancesError } = await supabase
			.from('recurring_task_instances')
			.select('*')
			.eq('task_id', taskId)
			.order('instance_date', { ascending: true });

		if (instancesError) {
			console.error('Error fetching instances:', instancesError);
			return ApiResponse.internalError('Failed to fetch task instances');
		}

		// Calculate next occurrences
		const config = {
			pattern: { type: task.recurrence_pattern || 'daily' },
			endOption: task.recurrence_ends
				? { type: 'date' as const, value: task.recurrence_ends }
				: { type: 'never' as const },
			startDate: task.start_date || new Date().toISOString()
		};

		const nextOccurrences = task.recurrence_pattern
			? recurrencePatternBuilder.calculateInstances(config, 10)
			: [];

		// Count exceptions
		const exceptionCount =
			task.task_calendar_events?.filter((e: any) => e.is_exception === true).length || 0;

		// Get summary statistics
		const completedCount = instances?.filter((i) => i.status === 'completed').length || 0;
		const skippedCount = instances?.filter((i) => i.status === 'skipped').length || 0;
		const totalInstances = instances?.length || 0;

		// Find next scheduled occurrence
		const now = new Date();
		const nextOccurrence = nextOccurrences.find((date) => date > now);

		return ApiResponse.success({
			task: {
				id: task.id,
				title: task.title,
				recurrence_pattern: task.recurrence_pattern,
				recurrence_ends: task.recurrence_ends,
				start_date: task.start_date
			},
			instances: instances || [],
			next_occurrences: nextOccurrences,
			next_occurrence: nextOccurrence?.toISOString() || null,
			statistics: {
				total_instances: totalInstances,
				completed_instances: completedCount,
				skipped_instances: skippedCount,
				exceptions_count: exceptionCount
			}
		});
	} catch (error) {
		console.error('Error fetching recurring task data:', error);
		return ApiResponse.internalError('Failed to fetch recurring task data');
	}
};

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: taskId } = params;
		const { updates, scope, instance_date } = await request.json();

		if (!updates || !scope) {
			return ApiResponse.badRequest('Updates and scope are required');
		}

		// Get task details
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events (*)
			`
			)
			.eq('id', taskId)
			.eq('user_id', user.id)
			.single();

		if (taskError || !task) {
			return ApiResponse.notFound('Task not found');
		}

		if (task.task_type !== 'recurring') {
			return ApiResponse.badRequest('Task is not recurring');
		}

		let result: any = { success: false };
		const calendarService = new CalendarService(supabase);

		switch (scope) {
			case 'single':
				// Update only this instance
				result = await updateSingleInstance(
					supabase,
					calendarService,
					task,
					updates,
					instance_date,
					user.id
				);
				break;

			case 'future':
				// Update this and future instances
				result = await updateFutureInstances(
					supabase,
					calendarService,
					task,
					updates,
					instance_date,
					user.id
				);
				break;

			case 'all':
				// Update all instances
				result = await updateAllInstances(
					supabase,
					calendarService,
					task,
					updates,
					user.id
				);
				break;

			default:
				return ApiResponse.badRequest('Invalid scope. Must be: single, future, or all');
		}

		return ApiResponse.success(result);
	} catch (error) {
		console.error('Error updating recurring task:', error);
		return ApiResponse.internalError('Failed to update recurring task');
	}
};

export const DELETE: RequestHandler = async ({
	params,
	url,
	locals: { safeGetSession, supabase }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: taskId } = params;
		const scope = url.searchParams.get('scope') || 'single';
		const instanceDate = url.searchParams.get('date');

		// Get task details
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events (*)
			`
			)
			.eq('id', taskId)
			.eq('user_id', user.id)
			.single();

		if (taskError || !task) {
			return ApiResponse.notFound('Task not found');
		}

		if (task.task_type !== 'recurring') {
			return ApiResponse.badRequest('Task is not recurring');
		}

		let result: any = { success: false };
		const calendarService = new CalendarService(supabase);

		switch (scope) {
			case 'single':
				// Delete only this instance
				if (!instanceDate) {
					return ApiResponse.badRequest('Instance date is required for single deletion');
				}
				result = await deleteSingleInstance(
					supabase,
					calendarService,
					task,
					instanceDate,
					user.id
				);
				break;

			case 'future':
				// Delete this and future instances
				if (!instanceDate) {
					return ApiResponse.badRequest('Instance date is required for future deletion');
				}
				result = await deleteFutureInstances(
					supabase,
					calendarService,
					task,
					instanceDate,
					user.id
				);
				break;

			case 'all':
				// Delete entire series
				result = await deleteAllInstances(supabase, calendarService, task, user.id);
				break;

			default:
				return ApiResponse.badRequest('Invalid scope. Must be: single, future, or all');
		}

		return ApiResponse.success(result);
	} catch (error) {
		console.error('Error deleting recurring task:', error);
		return ApiResponse.internalError('Failed to delete recurring task');
	}
};

// Helper functions for updating instances

async function updateSingleInstance(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	updates: any,
	instanceDate: string,
	userId: string
) {
	// Create or update the instance record
	const { error: instanceError } = await supabase.from('recurring_task_instances').upsert({
		task_id: task.id,
		instance_date: instanceDate,
		user_id: userId,
		notes: JSON.stringify({ exception: true, updates }),
		updated_at: new Date().toISOString()
	});

	if (instanceError) {
		throw instanceError;
	}

	// Update calendar event if exists
	const calendarEvent = task.task_calendar_events?.find(
		(e: any) => e.recurrence_instance_date === instanceDate
	);

	if (calendarEvent) {
		// Mark as exception
		await supabase
			.from('task_calendar_events')
			.update({
				is_exception: true,
				exception_type: 'modified',
				series_update_scope: 'single'
			})
			.eq('id', calendarEvent.id);

		// Update in Google Calendar
		if (updates.title || updates.start_date || updates.duration_minutes) {
			// Get the master event ID for single instance updates
			const masterEventId =
				calendarEvent.recurrence_master_id ||
				task.task_calendar_events?.find((e: any) => e.is_master_event)?.calendar_event_id ||
				calendarEvent.calendar_event_id;

			await calendarService.updateCalendarEvent(userId, {
				event_id: masterEventId,
				calendar_id: calendarEvent.calendar_id || 'primary',
				summary: updates.title,
				start_time: updates.start_date,
				// Calculate end time if duration changed
				end_time: updates.duration_minutes
					? new Date(
							new Date(updates.start_date || calendarEvent.event_start).getTime() +
								updates.duration_minutes * 60000
						).toISOString()
					: undefined,
				// Specify this is a single instance update
				update_scope: 'single',
				instance_date: instanceDate
			});
		}
	}

	return {
		success: true,
		affected_instances: 1,
		scope: 'single',
		instance_date: instanceDate
	};
}

async function updateFutureInstances(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	updates: any,
	instanceDate: string,
	userId: string
) {
	// End the current series at the instance date
	const newEndDate = new Date(instanceDate);
	newEndDate.setDate(newEndDate.getDate() - 1);

	// Update the original task to end before this date
	await supabase
		.from('tasks')
		.update({
			recurrence_ends: newEndDate.toISOString()
		})
		.eq('id', task.id);

	// Create a new task for future instances
	const newTask = {
		...task,
		...updates,
		id: undefined, // Let database generate new ID
		start_date: instanceDate,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};

	const { data: createdTask, error: createError } = await supabase
		.from('tasks')
		.insert(newTask)
		.select()
		.single();

	if (createError) {
		throw createError;
	}

	// Update calendar events
	const masterEvent = task.task_calendar_events?.find((e: any) => e.is_master_event);
	if (masterEvent) {
		// Update RRULE to end at instance date
		const config = {
			pattern: { type: task.recurrence_pattern },
			endOption: { type: 'date' as const, value: newEndDate.toISOString() },
			startDate: task.start_date
		};
		const newRRule = recurrencePatternBuilder.buildRRule(config);

		await calendarService.updateCalendarEvent(userId, {
			event_id: masterEvent.calendar_event_id,
			calendar_id: masterEvent.calendar_id || 'primary',
			recurrence: [newRRule]
		});

		// Create new series for future
		await calendarService.scheduleTask(userId, {
			task_id: createdTask.id,
			start_time: instanceDate,
			duration_minutes: updates.duration_minutes || task.duration_minutes
		});
	}

	return {
		success: true,
		affected_instances: 'future',
		new_task_id: createdTask.id,
		scope: 'future',
		split_date: instanceDate
	};
}

async function updateAllInstances(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	updates: any,
	userId: string
) {
	// Update the task itself
	const { error: updateError } = await supabase
		.from('tasks')
		.update({
			...updates,
			updated_at: new Date().toISOString()
		})
		.eq('id', task.id);

	if (updateError) {
		throw updateError;
	}

	// Update all calendar events
	const masterEvent = task.task_calendar_events?.find((e: any) => e.is_master_event);
	if (masterEvent) {
		await calendarService.updateCalendarEvent(userId, {
			event_id: masterEvent.calendar_event_id,
			calendar_id: masterEvent.calendar_id || 'primary',
			summary: updates.title,
			start_time: updates.start_date,
			end_time: updates.duration_minutes
				? new Date(
						new Date(updates.start_date || task.start_date).getTime() +
							updates.duration_minutes * 60000
					).toISOString()
				: undefined,
			// Specify this updates all instances
			update_scope: 'all'
		});

		// Mark update scope
		await supabase
			.from('task_calendar_events')
			.update({
				series_update_scope: 'all',
				updated_at: new Date().toISOString()
			})
			.eq('task_id', task.id);
	}

	// Clear any exceptions if requested
	if (updates.reset_exceptions) {
		await supabase
			.from('task_calendar_events')
			.update({
				is_exception: false,
				exception_type: null
			})
			.eq('task_id', task.id)
			.eq('is_exception', true);
	}

	return {
		success: true,
		affected_instances: 'all',
		scope: 'all',
		task_id: task.id
	};
}

// Helper functions for deleting instances

async function deleteSingleInstance(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	instanceDate: string,
	userId: string
) {
	// Mark instance as cancelled
	await supabase.from('recurring_task_instances').upsert({
		task_id: task.id,
		instance_date: instanceDate,
		user_id: userId,
		status: 'cancelled',
		updated_at: new Date().toISOString()
	});

	// Delete calendar event if exists
	const calendarEvent = task.task_calendar_events?.find(
		(e: any) => e.recurrence_instance_date === instanceDate
	);

	if (calendarEvent) {
		await calendarService.deleteCalendarEvent(userId, {
			event_id: calendarEvent.calendar_event_id,
			calendar_id: calendarEvent.calendar_id || 'primary'
		});

		// Mark as deleted exception
		await supabase
			.from('task_calendar_events')
			.update({
				is_exception: true,
				exception_type: 'cancelled',
				sync_status: 'deleted'
			})
			.eq('id', calendarEvent.id);
	}

	return {
		success: true,
		deleted_instances: 1,
		scope: 'single',
		instance_date: instanceDate
	};
}

async function deleteFutureInstances(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	instanceDate: string,
	userId: string
) {
	// Update task to end before this date
	const endDate = new Date(instanceDate);
	endDate.setDate(endDate.getDate() - 1);

	await supabase
		.from('tasks')
		.update({
			recurrence_ends: endDate.toISOString()
		})
		.eq('id', task.id);

	// Update calendar series
	const masterEvent = task.task_calendar_events?.find((e: any) => e.is_master_event);
	if (masterEvent) {
		const config = {
			pattern: { type: task.recurrence_pattern },
			endOption: { type: 'date' as const, value: endDate.toISOString() },
			startDate: task.start_date
		};
		const newRRule = recurrencePatternBuilder.buildRRule(config);

		await calendarService.updateCalendarEvent(userId, {
			event_id: masterEvent.calendar_event_id,
			calendar_id: masterEvent.calendar_id || 'primary',
			recurrence: [newRRule]
		});
	}

	// Mark future instances as cancelled
	await supabase
		.from('recurring_task_instances')
		.update({
			status: 'cancelled'
		})
		.eq('task_id', task.id)
		.gte('instance_date', instanceDate);

	return {
		success: true,
		deleted_instances: 'future',
		scope: 'future',
		end_date: endDate.toISOString()
	};
}

async function deleteAllInstances(
	supabase: any,
	calendarService: CalendarService,
	task: any,
	userId: string
) {
	// Delete all calendar events
	for (const event of task.task_calendar_events || []) {
		try {
			await calendarService.deleteCalendarEvent(userId, {
				event_id: event.calendar_event_id,
				calendar_id: event.calendar_id || 'primary'
			});
		} catch (error) {
			console.error('Error deleting calendar event:', error);
		}
	}

	// Delete all instances
	await supabase.from('recurring_task_instances').delete().eq('task_id', task.id);

	// Delete all calendar event records
	await supabase.from('task_calendar_events').delete().eq('task_id', task.id);

	// Delete the task itself
	await supabase.from('tasks').delete().eq('id', task.id);

	return {
		success: true,
		deleted_instances: 'all',
		scope: 'all',
		task_deleted: true
	};
}
