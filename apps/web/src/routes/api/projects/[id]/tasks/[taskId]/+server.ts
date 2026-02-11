// apps/web/src/routes/api/projects/[id]/tasks/[taskId]/+server.ts
// todo double check that the recurring event tables are properly updated
import type { RequestHandler } from './$types';
import { sanitizeTaskData } from '$lib/utils/sanitize-data';
import { CalendarService } from '$lib/services/calendar-service';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { formatDateForGoogleCalendar, calculateEndTime } from '$lib/utils/date-utils';
import { toastService } from '$lib/stores/toast.store';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId, taskId } = params;
		const updates = await parseRequestBody(request);
		if (!updates) {
			return ApiResponse.badRequest('Invalid request body');
		}
		let newTaskData = sanitizeTaskData(updates);

		// Extract timezone from request or get from user preferences
		const timeZone = updates.timeZone;

		// Get current task data with related records
		const { data: existingTask, error: existingTaskError } = await supabase
			.from('tasks')
			.select(
				`
				*,
				project:projects!inner(id, user_id, name, start_date, end_date),
				phase_tasks(id, phase_id, phases(id, name, start_date, end_date)),
				task_calendar_events(id, calendar_event_id, calendar_id, event_start, event_end, sync_status, is_master_event, recurrence_master_id)
			`
			)
			.eq('id', taskId)
			.eq('project_id', projectId)
			.eq('project.user_id', user.id)
			.single();

		if (existingTaskError || !existingTask) {
			return ApiResponse.notFound('Task not found');
		}

		// Validate start_date against project boundaries
		if (newTaskData.start_date) {
			const validationError = validateTaskDate(newTaskData.start_date, existingTask.project);
			if (validationError) {
				toastService.error(validationError);
				return ApiResponse.badRequest(validationError);
			}
		}

		// Handle task type changes and recurrence data
		if (newTaskData.task_type === 'one_off' && existingTask.task_type === 'recurring') {
			// Clear all recurring-specific data when changing from recurring to one_off
			newTaskData.recurrence_pattern = null;
			newTaskData.recurrence_ends = null;
			newTaskData.recurrence_end_source = null;
		} else if (
			(newTaskData.task_type === 'recurring' || existingTask.task_type === 'recurring') &&
			(newTaskData.recurrence_ends !== undefined || newTaskData.task_type === 'recurring')
		) {
			// Handle recurrence end date logic for recurring tasks
			// Determine the effective recurrence_ends value
			const effectiveRecurrenceEnds =
				newTaskData.recurrence_ends !== undefined
					? newTaskData.recurrence_ends
					: existingTask.recurrence_ends;

			if (effectiveRecurrenceEnds === null || effectiveRecurrenceEnds === '') {
				// User is clearing the end date or task has no end date
				if (existingTask.project.end_date) {
					newTaskData.recurrence_ends = existingTask.project.end_date;
					newTaskData.recurrence_end_source = 'project_inherited';
				} else {
					newTaskData.recurrence_ends = null;
					newTaskData.recurrence_end_source = 'indefinite';
				}
			} else if (effectiveRecurrenceEnds) {
				// User is setting a specific end date
				newTaskData.recurrence_end_source = 'user_specified';
			}
		}

		// Handle completion status change
		if (newTaskData.status === 'done' && existingTask.status !== 'done') {
			newTaskData.completed_at = new Date().toISOString();
		} else if (newTaskData.status !== 'done' && existingTask.status === 'done') {
			newTaskData.completed_at = null;
		}

		// 🚀 PERFORMANCE BOOST: Update task immediately (no calendar blocking)
		const { error: updateError } = await supabase
			.from('tasks')
			.update({
				...newTaskData,
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		if (updateError) {
			throw updateError;
		}

		// Handle phase assignment in parallel (non-blocking)
		const phasePromise = handlePhaseAssignment(
			taskId,
			projectId,
			newTaskData.start_date,
			supabase
		);

		// 🔥 Intelligent calendar operation handling with timezone support
		const calendarOperations = determineCalendarOperations(
			existingTask,
			newTaskData,
			updates,
			timeZone
		);

		// Process calendar operations directly with CalendarService
		const calendarService = new CalendarService(supabase);
		const errorLogger = ErrorLoggerService.getInstance(supabase);
		const calendarPromises = [];

		for (const operation of calendarOperations) {
			calendarPromises.push(
				processCalendarOperationDirectly(
					calendarService,
					errorLogger,
					operation,
					user.id,
					taskId,
					projectId,
					supabase
				)
			);
		}

		// Wait for phase assignment but not calendar operations
		await phasePromise;

		// For individual calendar additions (not bulk), await to ensure complete data
		// This fixes the issue where tasks don't appear in "Scheduled" filter immediately
		const isSingleCalendarAdd = updates.addTaskToCalendar && calendarPromises.length === 1;

		if (calendarPromises.length > 0) {
			if (isSingleCalendarAdd) {
				// Wait for single calendar operations to complete before returning
				// This ensures task_calendar_events are populated in the response
				await Promise.allSettled(calendarPromises);
			} else {
				// For bulk operations, process in background to avoid blocking
				Promise.allSettled(calendarPromises).catch((error) =>
					console.error('Calendar operations failed:', error)
				);
			}
		}

		// Get final task data - will now include calendar events for single operations
		const { data: finalTask } = await supabase
			.from('tasks')
			.select(
				`
				*,
				task_calendar_events(*),
				phase_tasks(id, phase_id, suggested_start_date, phases(id, name, start_date, end_date))
			`
			)
			.eq('id', taskId)
			.single();

		// 🎯 Return immediately with success
		return ApiResponse.success({
			task: finalTask,
			calendarSync:
				calendarOperations.length > 0
					? {
							status: 'processing',
							operations: calendarOperations.map((op) => op.type),
							message: getCalendarSyncMessage(calendarOperations),
							timeZone: timeZone
						}
					: { status: 'none' }
		});
	} catch (error) {
		console.error('Error updating task:', error);
		return ApiResponse.internalError(error);
	}
};

/**
 * Intelligently determine what calendar operations are needed with timezone support
 */
function determineCalendarOperations(
	existingTask: any,
	newTaskData: any,
	updates: any,
	timeZone?: string
): Array<{ type: string; data: any }> {
	const operations = [];
	const hasCalendarEvents = existingTask.task_calendar_events?.length > 0;

	// Edge Case 1: Task marked as done - remove from calendar
	if (newTaskData.status === 'done' && existingTask.status !== 'done' && hasCalendarEvents) {
		operations.push({
			type: 'delete_events',
			data: {
				events: existingTask.task_calendar_events,
				reason: 'task_completed'
			}
		});
		return operations; // No further calendar operations needed
	}

	// Edge Case 2: Task status changed from done to not done
	if (
		existingTask.status === 'done' &&
		newTaskData.status !== 'done' &&
		(newTaskData.start_date || existingTask.start_date)
	) {
		if (updates.addTaskToCalendar) {
			operations.push({
				type: 'schedule_task',
				data: {
					startTime: formatStartTime(newTaskData.start_date || existingTask.start_date),
					duration: newTaskData.duration_minutes || existingTask.duration_minutes || 60,
					title: newTaskData.title || existingTask.title,
					projectName: existingTask.project.name,
					timeZone: timeZone
				}
			});
		}
	}

	// Edge Case 3: Date cleared - remove from calendar
	const isDateCleared =
		(newTaskData.start_date === null ||
			newTaskData.start_date === '' ||
			newTaskData.start_date === undefined) &&
		existingTask.start_date;

	if (isDateCleared && hasCalendarEvents) {
		operations.push({
			type: 'delete_events',
			data: {
				events: existingTask.task_calendar_events,
				reason: 'date_cleared'
			}
		});
		return operations; // No further calendar operations needed
	}

	// Edge Case 4: Explicit calendar scheduling request
	if (updates.addTaskToCalendar && (newTaskData.start_date || existingTask.start_date)) {
		// If task already has calendar events and recurrence changed, handle it
		if (hasCalendarEvents) {
			const wasRecurring = existingTask.task_type === 'recurring';
			const isNowRecurring = newTaskData.task_type === 'recurring';
			const recurrenceChanged =
				wasRecurring !== isNowRecurring ||
				(isNowRecurring &&
					wasRecurring &&
					((newTaskData.recurrence_pattern &&
						newTaskData.recurrence_pattern !== existingTask.recurrence_pattern) ||
						(newTaskData.recurrence_ends !== undefined &&
							newTaskData.recurrence_ends !== existingTask.recurrence_ends)));

			if (recurrenceChanged) {
				// Delete old events first
				operations.push({
					type: 'delete_events',
					data: {
						events: existingTask.task_calendar_events,
						reason: 'recurrence_changed_via_add_to_calendar'
					}
				});
				// Then create new event with new recurrence
				operations.push({
					type: 'schedule_task',
					data: {
						startTime: formatStartTime(
							newTaskData.start_date || existingTask.start_date
						),
						duration:
							newTaskData.duration_minutes || existingTask.duration_minutes || 60,
						title: newTaskData.title || existingTask.title,
						projectName: existingTask.project.name,
						timeZone: timeZone,
						task_type:
							newTaskData.task_type !== undefined
								? newTaskData.task_type
								: existingTask.task_type,
						recurrence_pattern:
							newTaskData.task_type === 'one_off'
								? null
								: newTaskData.recurrence_pattern !== undefined
									? newTaskData.recurrence_pattern
									: existingTask.recurrence_pattern,
						recurrence_ends:
							newTaskData.task_type === 'one_off'
								? null
								: newTaskData.recurrence_ends !== undefined
									? newTaskData.recurrence_ends
									: existingTask.recurrence_ends
					}
				});
			}
		} else {
			// No existing calendar events, just create new one
			operations.push({
				type: 'schedule_task',
				data: {
					startTime: formatStartTime(newTaskData.start_date || existingTask.start_date),
					duration: newTaskData.duration_minutes || existingTask.duration_minutes || 60,
					title: newTaskData.title || existingTask.title,
					projectName: existingTask.project.name,
					timeZone: timeZone,
					// Include recurrence info if task is recurring - use NEW values
					task_type:
						newTaskData.task_type !== undefined
							? newTaskData.task_type
							: existingTask.task_type,
					recurrence_pattern:
						newTaskData.task_type === 'one_off'
							? null
							: newTaskData.recurrence_pattern !== undefined
								? newTaskData.recurrence_pattern
								: existingTask.recurrence_pattern,
					recurrence_ends:
						newTaskData.task_type === 'one_off'
							? null
							: newTaskData.recurrence_ends !== undefined
								? newTaskData.recurrence_ends
								: existingTask.recurrence_ends
				}
			});
		}
	}

	// Edge Case 5: Updates to existing calendar events
	if (
		hasCalendarEvents &&
		!isDateCleared &&
		existingTask.status !== 'done' &&
		newTaskData.status !== 'done'
	) {
		// Check if task is being changed to/from recurring
		const wasRecurring = existingTask.task_type === 'recurring';
		const isNowRecurring = newTaskData.task_type === 'recurring';

		// Check for any recurrence changes
		const recurrenceChanged =
			wasRecurring !== isNowRecurring ||
			(isNowRecurring &&
				wasRecurring &&
				((newTaskData.recurrence_pattern &&
					newTaskData.recurrence_pattern !== existingTask.recurrence_pattern) ||
					(newTaskData.recurrence_ends !== undefined &&
						newTaskData.recurrence_ends !== existingTask.recurrence_ends)));

		// Log recurrence changes for debugging
		if (recurrenceChanged) {
			console.log('Recurrence change detected:', {
				wasRecurring,
				isNowRecurring,
				oldPattern: existingTask.recurrence_pattern,
				newPattern: newTaskData.recurrence_pattern,
				oldEnds: existingTask.recurrence_ends,
				newEnds: newTaskData.recurrence_ends
			});
		}

		const needsUpdate =
			(newTaskData.start_date && newTaskData.start_date !== existingTask.start_date) ||
			(newTaskData.duration_minutes &&
				newTaskData.duration_minutes !== existingTask.duration_minutes) ||
			(newTaskData.title && newTaskData.title !== existingTask.title) ||
			recurrenceChanged;

		if (needsUpdate) {
			// If recurrence pattern changed, we need to recreate the event
			if (recurrenceChanged) {
				// Delete old events first
				operations.push({
					type: 'delete_events',
					data: {
						events: existingTask.task_calendar_events,
						reason: 'recurrence_changed'
					}
				});
				// Then create new event with new recurrence settings
				// IMPORTANT: Use the NEW task type, not the existing one
				if (newTaskData.start_date || existingTask.start_date) {
					operations.push({
						type: 'schedule_task',
						data: {
							startTime: formatStartTime(
								newTaskData.start_date || existingTask.start_date
							),
							duration:
								newTaskData.duration_minutes || existingTask.duration_minutes || 60,
							title: newTaskData.title || existingTask.title,
							projectName: existingTask.project.name,
							timeZone: timeZone,
							// Pass recurrence info - use NEW values for task type
							task_type:
								newTaskData.task_type !== undefined
									? newTaskData.task_type
									: existingTask.task_type,
							recurrence_pattern:
								newTaskData.task_type === 'one_off'
									? null
									: newTaskData.recurrence_pattern !== undefined
										? newTaskData.recurrence_pattern
										: existingTask.recurrence_pattern,
							recurrence_ends:
								newTaskData.task_type === 'one_off'
									? null
									: newTaskData.recurrence_ends !== undefined
										? newTaskData.recurrence_ends
										: existingTask.recurrence_ends
						}
					});
				}
			} else {
				// Check for existing recurring events
				const hasRecurringEvents = existingTask.task_calendar_events.some(
					(e: any) => e.is_master_event || e.recurrence_master_id
				);

				if (hasRecurringEvents) {
					// Edge Case 6: Handle recurring events specially
					operations.push({
						type: 'update_recurring_events',
						data: {
							task: existingTask,
							updates: newTaskData,
							updateAllInstances: updates.updateAllRecurrences || false,
							timeZone: timeZone
						}
					});
				} else {
					operations.push({
						type: 'update_events',
						data: {
							task: existingTask,
							updates: newTaskData,
							timeZone: timeZone
						}
					});
				}
			}
		}
	}

	// Edge Case 7: Task moved to past date - mark calendar events as deleted
	if (newTaskData.start_date && new Date(newTaskData.start_date) < new Date()) {
		operations.push({
			type: 'mark_events_deleted',
			data: {
				events: existingTask.task_calendar_events,
				reason: 'past_date'
			}
		});
	}

	return operations;
}

/**
 * Format start time with intelligent defaults using UTC-preserving function
 */
function formatStartTime(dateString: string): string {
	return formatDateForGoogleCalendar(dateString);
}

/**
 * Generate user-friendly message about calendar sync operations
 */
function getCalendarSyncMessage(operations: Array<{ type: string; data: any }>): string {
	const messages = operations.map((op) => {
		switch (op.type) {
			case 'delete_events':
				return op.data.reason === 'task_completed'
					? 'Removing from calendar (task completed)'
					: 'Removing from calendar (date cleared)';
			case 'schedule_task':
				return 'Adding to calendar';
			case 'update_events':
				return 'Updating calendar event';
			case 'update_recurring_events':
				return 'Updating recurring calendar events';
			case 'mark_events_deleted':
				return 'Marking calendar events as deleted';
			default:
				return 'Processing calendar changes';
		}
	});

	return messages.join(', ');
}

// Process calendar operations directly using CalendarService
async function processCalendarOperationDirectly(
	calendarService: CalendarService,
	errorLogger: ErrorLoggerService,
	operation: { type: string; data: any },
	userId: string,
	taskId: string,
	projectId: string,
	supabase: any
): Promise<void> {
	try {
		const { type, data } = operation;

		switch (type) {
			case 'delete_events':
				await handleDeleteEventsDirectly(
					calendarService,
					errorLogger,
					data.events,
					userId,
					taskId,
					projectId,
					data.reason
				);
				break;

			case 'schedule_task':
				await handleScheduleTaskDirectly(calendarService, errorLogger, {
					...data,
					taskId,
					userId,
					projectId
				});
				break;

			case 'update_events':
			case 'update_recurring_events':
				await handleUpdateEventsDirectly(calendarService, errorLogger, {
					...data,
					userId,
					taskId,
					projectId
				});
				break;

			case 'mark_events_deleted':
				await handleMarkEventsDeletedDirectly(data.events, data.reason, supabase);
				break;

			default:
				console.error(`Unknown calendar operation: ${type}`);
		}
	} catch (error) {
		console.error(`Calendar operation ${operation.type} failed:`, error);
		// Don't throw - this is fire-and-forget
	}
}

// Direct handlers for calendar operations
async function handleDeleteEventsDirectly(
	calendarService: CalendarService,
	errorLogger: ErrorLoggerService,
	events: any[],
	userId: string,
	taskId: string,
	projectId: string,
	reason?: string
): Promise<void> {
	for (const event of events) {
		if (event.sync_status === 'deleted') continue;

		try {
			// CalendarService handles the database updates
			await calendarService.deleteCalendarEvent(userId, {
				event_id: event.calendar_event_id,
				calendar_id: event.calendar_id || 'primary'
			});
		} catch (error: any) {
			console.error('Error deleting calendar event:', error);
			// Log the error to the database
			await errorLogger.logCalendarError(error, 'delete', taskId, userId, {
				calendarEventId: event.calendar_event_id,
				calendarId: event.calendar_id || 'primary',
				projectId,
				reason: reason || 'unknown'
			});
			// CalendarService already handles error states in the database
		}
	}
}

async function handleScheduleTaskDirectly(
	calendarService: CalendarService,
	errorLogger: ErrorLoggerService,
	data: any
): Promise<void> {
	const {
		userId,
		taskId,
		projectId,
		startTime,
		duration,
		title,
		projectName,
		timeZone,
		task_type,
		recurrence_pattern,
		recurrence_ends
	} = data;

	try {
		// Schedule the task with recurrence info if applicable
		// CalendarService handles all database operations including task_calendar_events
		const result = await calendarService.scheduleTask(userId, {
			task_id: taskId,
			start_time: startTime,
			duration_minutes: duration,
			description: `Task: ${title}\nProject: ${projectName}`,
			timeZone,
			// Pass recurrence parameters if task is recurring
			recurrence_pattern: task_type === 'recurring' ? recurrence_pattern : undefined,
			recurrence_ends: task_type === 'recurring' ? recurrence_ends : undefined
		});

		if (!result.success) {
			throw new Error('Failed to schedule task in calendar');
		}
	} catch (error: any) {
		console.error('Schedule task error:', error);
		// Log the error to the database
		await errorLogger.logCalendarError(error, 'create', taskId, userId, {
			projectId,
			taskStartDate: startTime,
			reason: 'Failed to schedule task'
		});
		// CalendarService already handles error logging in the database
	}
}

async function handleUpdateEventsDirectly(
	calendarService: CalendarService,
	errorLogger: ErrorLoggerService,
	data: any
): Promise<void> {
	const { userId, task, updates, timeZone, taskId, projectId } = data;

	if (!task.task_calendar_events?.length) return;

	// Calculate new event times
	const newStartDate = updates.start_date || task.start_date;
	const newDuration = updates.duration_minutes || task.duration_minutes || 60;
	const newTitle = updates.title || task.title;
	const newDescription = updates.description || task.description;

	for (const event of task.task_calendar_events) {
		if (event.sync_status === 'deleted') continue;

		try {
			// CalendarService handles all database updates
			const result = await calendarService.updateCalendarEvent(userId, {
				event_id: event.calendar_event_id,
				calendar_id: event.calendar_id || 'primary',
				start_time: newStartDate,
				end_time: calculateEndTime(newStartDate, newDuration),
				summary: newTitle,
				description: newDescription,
				timeZone
			});

			if (!result.success) {
				console.error('Failed to update calendar event:', event.calendar_event_id);
			}
		} catch (error: any) {
			console.error('Error updating calendar event:', error);
			// Log the error to the database
			await errorLogger.logCalendarError(error, 'update', taskId || task.id, userId, {
				calendarEventId: event.calendar_event_id,
				calendarId: event.calendar_id || 'primary',
				projectId,
				taskStartDate: newStartDate
			});
			// CalendarService already handles error states in the database
		}
	}
}

async function handleMarkEventsDeletedDirectly(
	events: any[],
	reason: string,
	supabase: any
): Promise<void> {
	// This operation only marks events as deleted in our database without touching Google Calendar
	// This is used when tasks are moved to past dates or similar scenarios
	for (const event of events) {
		try {
			await supabase
				.from('task_calendar_events')
				.update({
					sync_status: 'deleted',
					sync_error: reason || 'Task moved to past date',
					last_synced_at: new Date().toISOString()
				})
				.eq('id', event.id);
		} catch (error) {
			console.error('Error marking event as deleted:', error);
		}
	}
}

// Helper functions remain the same
function validateTaskDate(startDate: string, project: any): string | null {
	const taskDate = new Date(startDate);

	if (project.start_date && taskDate < new Date(project.start_date)) {
		return `Task date cannot be before project start date (${new Date(project.start_date).toLocaleDateString()})`;
	}

	if (project.end_date && taskDate > new Date(project.end_date)) {
		return `Task date cannot be after project end date (${new Date(project.end_date).toLocaleDateString()})`;
	}

	return null;
}

async function handlePhaseAssignment(
	taskId: string,
	projectId: string,
	startDate: string | null | undefined,
	supabase: any
) {
	// If no start date, task should not be in any phase (moves to backlog)
	if (!startDate) {
		return;
	}

	const { data: phases } = await supabase
		.from('phases')
		.select('id, name, start_date, end_date, order')
		.eq('project_id', projectId)
		.order('order', { ascending: true });

	const { data: currentPhaseTask, error: currentPhaseTaskError } = await supabase
		.from('phase_tasks')
		.select('*')
		.eq('task_id', taskId)
		.single();

	if (currentPhaseTaskError) {
		console.log(currentPhaseTaskError);
	}

	if (currentPhaseTask) {
		if (phases) {
			const taskDate = new Date(startDate);
			const targetPhase = phases.find((phase: any) => {
				return phase.id === currentPhaseTask.phase_id;
			});

			if (targetPhase) {
				const phaseStart = new Date(targetPhase.start_date);
				const phaseEnd = new Date(targetPhase.end_date);
				phaseEnd.setHours(23, 59, 59, 999);

				if (taskDate >= phaseStart && taskDate <= phaseEnd) {
					await supabase
						.from('phase_tasks')
						.update({
							phase_id: targetPhase.id,
							task_id: taskId,
							suggested_start_date: startDate,
							assignment_reason: 'Automatic assignment based on date'
						})
						.eq('task_id', taskId);
					return;
				}
			}
		}
	}
	// Always remove from current phase first
	await supabase.from('phase_tasks').delete().eq('task_id', taskId);

	if (phases) {
		const taskDate = new Date(startDate);
		const targetPhase = phases.find((phase: any) => {
			const phaseStart = new Date(phase.start_date);
			const phaseEnd = new Date(phase.end_date);
			phaseEnd.setHours(23, 59, 59, 999);
			return taskDate >= phaseStart && taskDate <= phaseEnd;
		});

		if (targetPhase) {
			// Get the maximum order for this phase to append at the end
			const { data: maxOrderTask } = await supabase
				.from('phase_tasks')
				.select('order')
				.eq('phase_id', targetPhase.id)
				.order('order', { ascending: false })
				.limit(1)
				.maybeSingle();

			const newOrder = maxOrderTask ? maxOrderTask.order + 1 : 1;

			await supabase.from('phase_tasks').insert({
				phase_id: targetPhase.id,
				task_id: taskId,
				suggested_start_date: startDate,
				assignment_reason: 'Automatic assignment based on date',
				order: newOrder
			});
		}
	}
}

export const DELETE: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { id: projectId, taskId } = params;

		// Parse deletion scope for recurring tasks
		let deletionScope: 'all' | 'this_only' | 'this_and_future' = 'all';
		let instanceDate: string | null = null;

		// Check if request has a body (for recurring task deletion)
		const contentType = request.headers.get('content-type');
		if (contentType?.includes('application/json')) {
			try {
				const body = await request.json();
				deletionScope = body.deletion_scope || 'all';
				instanceDate = body.instance_date || null;
			} catch {
				// If parsing fails, use defaults
			}
		}

		// Verify user owns the task and get calendar events
		const { data: task, error: taskError } = await supabase
			.from('tasks')
			.select(
				`
				id,
				title,
				status,
				start_date,
				task_type,
				project:projects!inner(
					id,
					user_id,
					name
				),
				task_calendar_events(
					id,
					calendar_event_id,
					calendar_id,
					sync_status,
					is_master_event,
					recurrence_master_id
				),
				phase_tasks(id),
				subtasks:tasks!parent_task_id(id, title, status)
			`
			)
			.eq('id', taskId)
			.eq('project_id', projectId)
			.eq('project.user_id', user.id)
			.single();

		if (taskError || !task) {
			return ApiResponse.notFound('Task not found');
		}

		const warnings: string[] = [];
		const errors: string[] = [];

		// Edge Case: Handle subtasks
		const subtasks = task?.subtasks as any[] | null;
		if (subtasks && subtasks.length > 0) {
			// Option 1: Prevent deletion if has active subtasks
			const activeSubtasks = subtasks.filter((st: any) => st.status !== 'done');
			if (activeSubtasks.length > 0) {
				return ApiResponse.badRequest(
					`Cannot delete task with ${activeSubtasks.length} active subtask(s). Complete or delete subtasks first.`
				);
			}

			// Option 2: Or cascade delete subtasks (uncomment if preferred)
			// await supabase.from('tasks').delete().eq('parent_task_id', taskId);
		}

		// Handle recurring task deletion based on scope
		if (task.task_type === 'recurring' && deletionScope !== 'all') {
			if (deletionScope === 'this_only' && instanceDate) {
				// Delete only this instance
				// Create or update recurring_task_instances to mark this instance as deleted
				await supabase.from('recurring_task_instances').upsert({
					task_id: taskId,
					instance_date: instanceDate,
					status: 'deleted',
					deleted_at: new Date().toISOString(),
					user_id: user.id,
					updated_at: new Date().toISOString()
				});

				// Handle calendar event for this instance
				if (task.task_calendar_events?.length > 0) {
					// Find the specific instance event or create an exception
					const masterEvent = task.task_calendar_events.find(
						(e: any) => e.is_master_event
					);
					if (masterEvent) {
						try {
							// Delete this specific instance from Google Calendar
							await handleRecurringInstanceDeletion(
								masterEvent,
								instanceDate,
								user.id,
								supabase
							);
						} catch (error) {
							warnings.push('Failed to remove this instance from calendar');
						}
					}
				}

				return ApiResponse.success({
					deleted: 'instance',
					message: 'This occurrence has been deleted',
					instanceDate
				});
			} else if (deletionScope === 'this_and_future') {
				// Update recurrence end date to stop before this instance
				const newEndDate = instanceDate
					? new Date(new Date(instanceDate).getTime() - 24 * 60 * 60 * 1000)
							.toISOString()
							.split('T')[0]
					: null;

				if (newEndDate) {
					await supabase
						.from('tasks')
						.update({
							recurrence_ends: newEndDate,
							updated_at: new Date().toISOString()
						})
						.eq('id', taskId);

					// Update calendar event recurrence
					if (task.task_calendar_events?.length > 0) {
						const masterEvent = task.task_calendar_events.find(
							(e: any) => e.is_master_event
						);
						if (masterEvent) {
							try {
								await handleRecurrenceUpdate(
									masterEvent,
									newEndDate,
									user.id,
									supabase
								);
							} catch (error) {
								warnings.push('Failed to update calendar recurrence');
							}
						}
					}

					return ApiResponse.success({
						deleted: 'future',
						message: 'Future occurrences have been deleted',
						newEndDate
					});
				}
			}
			// If scope is 'all', continue with normal deletion below
		}

		// Delete associated calendar events
		if (task.task_calendar_events?.length > 0) {
			// Check for recurring events
			const recurringEvents = task.task_calendar_events.filter(
				(e: any) => e.is_master_event || e.recurrence_master_id
			);

			if (recurringEvents.length > 0) {
				warnings.push('Note: This task had recurring calendar events that were removed');
			}

			const calendarResults = await handleCalendarEventDeletion(
				task.task_calendar_events,
				user.id,
				supabase,
				taskId,
				projectId
			);
			warnings.push(...calendarResults.warnings);
			errors.push(...calendarResults.errors);
		}

		// Clear brain dump links
		const { error: brainDumpLinksError } = await supabase
			.from('brain_dump_links')
			.update({ task_id: null })
			.eq('task_id', taskId);

		if (brainDumpLinksError) {
			console.error('Error removing task from brain_dump_links:', brainDumpLinksError);
			warnings.push('Some brain dump links could not be updated');
		}

		// Clear phase tasks association
		if (task.phase_tasks?.length) {
			const { error: deletePhaseTaskError } = await supabase
				.from('phase_tasks')
				.delete()
				.eq('task_id', taskId);

			if (deletePhaseTaskError) {
				console.error('Error deleting phase tasks:', deletePhaseTaskError);
				warnings.push('Phase assignment could not be cleared');
			}
		}

		// Soft delete the task by setting deleted_at timestamp
		const { error: deleteTaskError } = await supabase
			.from('tasks')
			.update({
				deleted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', taskId);

		if (deleteTaskError) {
			throw deleteTaskError;
		}

		// Log deletion for audit trail (optional)
		await (supabase.from('user_activity_logs') as any)
			.insert({
				user_id: user.id,
				action: 'task_deleted',
				resource_type: 'task',
				resource_id: taskId,
				metadata: {
					task_title: task.title,
					project_id: projectId,
					had_calendar_events: (task.task_calendar_events as any[])?.length > 0,
					was_completed: task.status === 'done'
				}
			})
			.select()
			.single(); // Don't fail if logging fails

		return ApiResponse.success({
			deleted: true,
			message: 'Task deleted successfully'
		});
	} catch (error) {
		console.error('Error deleting task:', error);
		return ApiResponse.internalError(error);
	}
};

/**
 * Enhanced calendar event deletion with better error handling
 */
async function handleCalendarEventDeletion(
	calendarEvents: any[],
	userId: string,
	supabase: any,
	taskId?: string,
	projectId?: string
): Promise<{ warnings: string[]; errors: string[] }> {
	const calendarService = new CalendarService(supabase);
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	const warnings: string[] = [];
	const errors: string[] = [];
	let successCount = 0;
	let failCount = 0;

	// Group events by calendar for batch operations
	const eventsByCalendar = calendarEvents.reduce(
		(acc, event) => {
			const calendarId = event.calendar_id || 'primary';
			if (!acc[calendarId]) acc[calendarId] = [];
			acc[calendarId].push(event);
			return acc;
		},
		{} as Record<string, any[]>
	);

	for (const [calendarId, events] of Object.entries(eventsByCalendar) as [string, any[]][]) {
		for (const event of events) {
			// Skip already deleted events
			if (event.sync_status === 'deleted') {
				continue;
			}

			try {
				await calendarService.deleteCalendarEvent(userId, {
					event_id: event.calendar_event_id,
					calendar_id: calendarId
				});

				successCount++;
			} catch (calendarError: any) {
				console.error('Error deleting calendar event:', calendarError);
				failCount++;

				// Log the error to the database
				await errorLogger.logCalendarError(
					calendarError,
					'delete',
					taskId || event.task_id,
					userId,
					{
						calendarEventId: event.calendar_event_id,
						calendarId: calendarId,
						projectId,
						reason: 'task_deletion'
					}
				);

				// Determine error type
				if (
					calendarError.message?.includes('404') ||
					calendarError.message?.includes('not found')
				) {
					// Event doesn't exist in calendar - mark as deleted anyway
					await supabase
						.from('task_calendar_events')
						.update({
							sync_status: 'deleted',
							sync_error: 'Event not found in calendar',
							last_synced_at: new Date().toISOString()
						})
						.eq('id', event.id);

					warnings.push('Some calendar events were already removed from your calendar');
				} else if (
					calendarError.message?.includes('401') ||
					calendarError.message?.includes('unauthorized')
				) {
					errors.push('Calendar connection expired. Please reconnect your calendar.');
					break; // Stop trying other events
				} else {
					warnings.push(
						`Failed to remove calendar event: ${calendarError.message || 'Unknown error'}`
					);

					// Mark as error in database
					await supabase
						.from('task_calendar_events')
						.update({
							sync_status: 'error',
							sync_error: calendarError.message || 'Unknown error',
							last_synced_at: new Date().toISOString()
						})
						.eq('id', event.id);
				}
			}
		}
	}

	// Add summary messages
	if (successCount > 0 && failCount > 0) {
		warnings.push(
			`${successCount} calendar event(s) removed successfully, ${failCount} failed.`
		);
	} else if (failCount > 0 && successCount === 0) {
		errors.push('Failed to remove any calendar events. Check your calendar connection.');
	}

	return { warnings, errors };
}

/**
 * Handle deletion of a specific recurring instance
 */
async function handleRecurringInstanceDeletion(
	masterEvent: any,
	instanceDate: string,
	userId: string,
	supabase: any
): Promise<void> {
	const calendarService = new CalendarService(supabase);

	try {
		// Create an exception event in Google Calendar for this instance
		// This effectively "deletes" this occurrence from the series
		const instanceId = `${masterEvent.calendar_event_id}_${instanceDate.replace(/-/g, '')}`;

		await calendarService.deleteCalendarEvent(userId, {
			event_id: instanceId,
			calendar_id: masterEvent.calendar_id || 'primary'
		});

		// Mark instance as deleted in our tracking table
		await supabase.from('recurring_task_instances').upsert({
			task_id: masterEvent.task_id,
			instance_date: instanceDate,
			status: 'deleted',
			deleted_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});
	} catch (error) {
		console.error('Failed to delete recurring instance:', error);
		throw error;
	}
}

/**
 * Update recurrence pattern end date
 */
async function handleRecurrenceUpdate(
	masterEvent: any,
	newEndDate: string,
	userId: string,
	supabase: any
): Promise<void> {
	const calendarService = new CalendarService(supabase);

	try {
		// Fetch the current event to get its recurrence rule
		const { data: task } = await supabase
			.from('tasks')
			.select('recurrence_pattern, start_date')
			.eq('id', masterEvent.task_id)
			.single();

		if (!task) {
			throw new Error('Task not found');
		}

		// Update the RRULE with new UNTIL date
		const updatedRRule = `RRULE:FREQ=${mapPatternToFreq(task.recurrence_pattern)};UNTIL=${newEndDate.replace(/-/g, '')}T235959Z`;

		// Update the calendar event
		await calendarService.updateCalendarEvent(userId, {
			event_id: masterEvent.calendar_event_id,
			calendar_id: masterEvent.calendar_id || 'primary',
			recurrence: [updatedRRule]
		});
	} catch (error) {
		console.error('Failed to update recurrence:', error);
		throw error;
	}
}

/**
 * Map recurrence pattern to RRULE frequency
 */
function mapPatternToFreq(pattern: string): string {
	const freqMap: Record<string, string> = {
		daily: 'DAILY',
		weekdays: 'DAILY;BYDAY=MO,TU,WE,TH,FR',
		weekly: 'WEEKLY',
		biweekly: 'WEEKLY;INTERVAL=2',
		monthly: 'MONTHLY',
		quarterly: 'MONTHLY;INTERVAL=3',
		yearly: 'YEARLY'
	};
	return freqMap[pattern] || 'DAILY';
}
