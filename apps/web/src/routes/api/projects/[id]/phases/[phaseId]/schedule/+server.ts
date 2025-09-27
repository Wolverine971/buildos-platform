// src/routes/api/projects/[id]/phases/[phaseId]/schedule/+server.ts
/**
 * Phase Task Scheduling Endpoint
 *
 * Intelligent task scheduling using LLM analysis:
 * 1. LLM analyzes task relationships, dependencies, and optimal ordering
 * 2. Considers existing schedule to avoid conflicts
 * 3. TaskTimeSlotFinder verifies and optimizes suggested time slots
 * 4. Provides reasoning for scheduling decisions
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TaskTimeSlotFinder } from '$lib/services/task-time-slot-finder';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { addMinutes, setHours, setMinutes, format } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

interface SchedulingResult {
	scheduled_tasks: Array<{
		task_id: string;
		suggested_date: string;
		priority_order: number;
		reasoning: string;
		dependencies_considered?: string[];
	}>;
	scheduling_strategy: string;
	warnings?: string[];
}

interface ExistingScheduleItem {
	start_time: string;
	end_time: string;
	task_title: string;
	task_id?: string;
}

interface TaskToSchedule {
	id: string;
	title: string;
	description?: string;
	duration_minutes: number;
	priority?: string;
	dependencies?: any;
	suggested_start_date?: string;
	status?: string;
}

// ============================================================================
// LLM Prompt Builders
// ============================================================================

function buildSchedulingSystemPrompt(): string {
	return `You are an expert project manager specializing in intelligent task scheduling.
Your job is to schedule tasks within a phase considering:
- Task dependencies and logical workflow progression
- Existing scheduled tasks (avoid conflicts)
- Task complexity, priority, and duration
- Optimal task ordering for productivity
- Working hours and calendar preferences
- Phase timeline boundaries

SCHEDULING PRINCIPLES:
1. Schedule foundational/prerequisite tasks first
2. Group related tasks together when logical
3. Respect dependencies - dependent tasks must come after their dependencies
4. Distribute workload evenly across the phase timeline
5. Avoid scheduling conflicts with existing tasks
6. Consider task duration when finding time slots
7. Prioritize high-priority tasks for earlier slots
8. Leave buffer time between complex tasks

OUTPUT RULES:
1. Every task MUST be assigned a specific date and time
2. suggested_date must be in ISO format (YYYY-MM-DDTHH:MM:SS)
3. Times should align with working hours (avoid early morning/late evening)
4. Never schedule tasks outside phase boundaries
5. Never schedule tasks in the past
6. Avoid weekends unless specifically allowed
7. Return valid JSON only`;
}

function buildSchedulingDataPrompt(
	phase: any,
	tasksToSchedule: TaskToSchedule[],
	existingSchedule: ExistingScheduleItem[],
	userPreferences: any,
	currentDateTime: string
): string {
	const phaseStart = new Date(phase.start_date);
	const phaseEnd = new Date(phase.end_date);

	return `CURRENT DATE/TIME: ${currentDateTime}

PHASE INFORMATION:
Name: ${phase.name}
Description: ${phase.description || 'No description'}
Start: ${phase.start_date} (${format(phaseStart, 'EEEE, MMMM d, yyyy')})
End: ${phase.end_date} (${format(phaseEnd, 'EEEE, MMMM d, yyyy')})
Duration: ${Math.ceil((phaseEnd.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24))} days

USER CALENDAR PREFERENCES:
Working Hours: ${userPreferences.work_start_time} - ${userPreferences.work_end_time}
Working Days: ${userPreferences.working_days.map((d: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}
Default Task Duration: ${userPreferences.default_task_duration_minutes} minutes
Time Zone: ${userPreferences.timeZone}

EXISTING SCHEDULED TASKS (${existingSchedule.length}):
These time slots are already occupied and should be avoided:
${existingSchedule.length > 0 ? JSON.stringify(existingSchedule, null, 2) : 'No existing scheduled tasks'}

TASKS TO SCHEDULE (${tasksToSchedule.length}):
${JSON.stringify(tasksToSchedule, null, 2)}

SCHEDULING REQUIREMENTS:
1. Schedule all tasks within the phase timeline (${phase.start_date} to ${phase.end_date})
2. Respect working hours (${userPreferences.work_start_time} - ${userPreferences.work_end_time})
3. Avoid conflicts with existing scheduled tasks
4. Consider task dependencies when ordering
5. Suggest specific dates AND times for each task
6. Ensure no task is scheduled before ${currentDateTime}

Please analyze these tasks and create an optimal schedule that maximizes productivity and logical workflow progression.

OUTPUT FORMAT:
{
	"scheduled_tasks": [
		{
			"task_id": "task-uuid",
			"suggested_date": "YYYY-MM-DDTHH:MM:SS",
			"priority_order": 1,
			"reasoning": "Brief explanation of scheduling decision",
			"dependencies_considered": ["task-id-1", "task-id-2"]
		}
	],
	"scheduling_strategy": "Overall strategy explanation",
	"warnings": ["Any scheduling concerns or conflicts"]
}`;
}

// ============================================================================
// Helper Functions
// ============================================================================

async function fetchExistingSchedule(
	supabase: any,
	userId: string,
	phaseStart: Date,
	phaseEnd: Date,
	currentPhaseId: string
): Promise<ExistingScheduleItem[]> {
	// Get all tasks scheduled within the phase timeline
	const { data: scheduledTasks, error } = await supabase
		.from('tasks')
		.select(
			`
			id,
			title,
			start_date,
			duration_minutes,
			phase_tasks!inner(phase_id)
		`
		)
		.eq('user_id', userId)
		.not('start_date', 'is', null)
		.gte('start_date', phaseStart.toISOString())
		.lte('start_date', phaseEnd.toISOString())
		.is('deleted_at', null);

	if (error) {
		console.error('Error fetching existing schedule:', error);
		return [];
	}

	const schedule: ExistingScheduleItem[] = [];

	if (scheduledTasks) {
		for (const task of scheduledTasks) {
			// Skip tasks from the current phase (we're rescheduling them)
			if (task.phase_tasks?.some((pt: any) => pt.phase_id === currentPhaseId)) {
				continue;
			}

			const startTime = new Date(task.start_date);
			const endTime = addMinutes(startTime, task.duration_minutes || 60);

			schedule.push({
				start_time: startTime.toISOString(),
				end_time: endTime.toISOString(),
				task_title: task.title,
				task_id: task.id
			});
		}
	}

	// Also get calendar events if user has calendar connected
	try {
		const calendarService = new CalendarService(supabase);
		const hasConnection = await calendarService.hasValidConnection(userId);

		if (hasConnection) {
			// Get calendar events for the phase timeline
			const { data: calendarPrefs } = await supabase
				.from('user_calendar_preferences')
				.select('calendar_id')
				.eq('user_id', userId)
				.single();

			if (calendarPrefs?.calendar_id) {
				// Note: We would need to implement getEventsInRange in CalendarService
				// For now, we'll just use the task schedule
				console.log('Calendar events fetching would go here');
			}
		}
	} catch (error) {
		console.warn('Could not fetch calendar events:', error);
	}

	// Sort by start time
	schedule.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

	return schedule;
}

function validateLLMSchedule(
	llmResult: SchedulingResult,
	tasks: TaskToSchedule[],
	phaseStart: Date,
	phaseEnd: Date,
	currentDateTime: Date
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	// Check all tasks are scheduled
	const scheduledTaskIds = new Set(llmResult.scheduled_tasks.map((st) => st.task_id));
	const missingTasks = tasks.filter((t) => !scheduledTaskIds.has(t.id));

	if (missingTasks.length > 0) {
		errors.push(`Missing schedules for ${missingTasks.length} task(s)`);
	}

	// Validate each scheduled task
	for (const scheduledTask of llmResult.scheduled_tasks) {
		const task = tasks.find((t) => t.id === scheduledTask.task_id);
		if (!task) {
			errors.push(`Unknown task ID: ${scheduledTask.task_id}`);
			continue;
		}

		// Validate date format
		const suggestedDate = new Date(scheduledTask.suggested_date);
		if (isNaN(suggestedDate.getTime())) {
			errors.push(`Invalid date for task ${task.title}: ${scheduledTask.suggested_date}`);
			continue;
		}

		// Check phase boundaries
		if (suggestedDate < phaseStart || suggestedDate > phaseEnd) {
			errors.push(`Task ${task.title} scheduled outside phase boundaries`);
		}

		// Check not in the past
		if (suggestedDate < currentDateTime) {
			errors.push(`Task ${task.title} scheduled in the past`);
		}
	}

	return {
		valid: errors.length === 0,
		errors
	};
}

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id: projectId, phaseId } = params;
		const {
			preview = true,
			schedule: manualSchedule,
			timeZone,
			currentDateTime
		} = await request.json();

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, name')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		// Get phase with tasks
		const { data: phase, error: phaseError } = await supabase
			.from('phases')
			.select(
				`
				*,
				phase_tasks (
					task_id,
					suggested_start_date,
					tasks(
						id,
						title,
						description,
						duration_minutes,
						start_date,
						task_type,
						recurrence_pattern,
						priority,
						dependencies,
						status
					)
				)
			`
			)
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.single();

		if (phaseError || !phase) {
			return json({ error: 'Phase not found' }, { status: 404 });
		}

		// Get user calendar preferences
		const { data: preferences } = await supabase
			.from('user_calendar_preferences')
			.select('*')
			.eq('user_id', user.id)
			.single();

		const userPreferences = preferences || {
			work_start_time: '09:00:00',
			work_end_time: '17:00:00',
			working_days: [1, 2, 3, 4, 5], // Monday = 1, Sunday = 0
			default_task_duration_minutes: 60,
			exclude_holidays: true,
			timeZone: timeZone || 'America/New_York'
		};

		// Extract tasks from phase_tasks
		const tasks = phase.phase_tasks
			.map((pt: any) => ({
				...pt.tasks,
				suggested_start_date: pt.suggested_start_date
			}))
			.filter((task: any) => task.status !== 'done');

		if (tasks.length === 0) {
			return json({
				schedule: [],
				warnings: ['No tasks to schedule in this phase']
			});
		}

		// Initialize calendar service
		const calendarService = new CalendarService(supabase);
		const warnings: string[] = [];

		if (preview) {
			// Generate proposed schedule
			const proposedSchedule = await generateProposedSchedule(
				phase,
				tasks,
				userPreferences,
				supabase,
				user.id,
				warnings,
				timeZone,
				currentDateTime
			);

			return json({
				schedule: proposedSchedule,
				warnings
			});
		} else {
			// Save schedule and create/update calendar events
			if (!manualSchedule || !Array.isArray(manualSchedule)) {
				return json({ error: 'Schedule data required' }, { status: 400 });
			}

			const results = [];
			const errors = [];
			const taskUpdateResults = [];

			for (const item of manualSchedule) {
				try {
					// Validate the input data
					if (!item.taskId || !item.start_date) {
						throw new Error('Missing required fields: taskId or start_date');
					}

					// Parse the scheduled start time (it's already in UTC from client)
					const scheduledStart = new Date(item.start_date);
					if (isNaN(scheduledStart.getTime())) {
						throw new Error('Invalid start_date format');
					}

					const duration = item.duration_minutes || 60;
					if (duration <= 0) {
						throw new Error('Duration must be positive');
					}

					// Calculate end time
					const scheduledEnd = addMinutes(scheduledStart, duration);

					// Update task in database - store as UTC
					const { data: updatedTask, error: taskUpdateError } = await supabase
						.from('tasks')
						.update({
							start_date: scheduledStart.toISOString(),
							duration_minutes: duration,
							updated_at: new Date().toISOString()
						})
						.eq('id', item.taskId)
						.eq('user_id', user.id)
						.select('id, title, start_date, duration_minutes')
						.single();

					if (taskUpdateError) {
						throw new Error(`Failed to update task: ${taskUpdateError.message}`);
					}

					if (!updatedTask) {
						throw new Error('Task not found or not accessible');
					}

					taskUpdateResults.push({
						taskId: item.taskId,
						success: true,
						updatedData: updatedTask
					});

					// Check if task already has calendar events
					const { data: existingEvents } = await supabase
						.from('task_calendar_events')
						.select('*')
						.eq('task_id', item.taskId)
						.eq('user_id', user.id);

					const task = tasks.find((t: any) => t.id === item.taskId);
					if (task) {
						if (existingEvents && existingEvents.length > 0) {
							// Update existing calendar event
							for (const existingEvent of existingEvents) {
								try {
									const updateResult = await calendarService.updateCalendarEvent(
										user.id,
										{
											event_id: existingEvent.calendar_event_id,
											calendar_id: existingEvent.calendar_id || 'primary',
											start_time: scheduledStart.toISOString(),
											end_time: scheduledEnd.toISOString(),
											summary: task.title,
											description: `Phase: ${phase.name}\nProject: ${project.name}\n${task.description || ''}`,
											timeZone
										}
									);

									results.push({
										taskId: item.taskId,
										success: true,
										action: 'updated',
										event: updateResult
									});
								} catch (calendarError) {
									console.warn(
										`Calendar update failed for task ${item.taskId}:`,
										calendarError
									);
									results.push({
										taskId: item.taskId,
										success: false,
										action: 'calendar_update_failed',
										error:
											calendarError instanceof Error
												? calendarError.message
												: 'Calendar update failed'
									});
								}
							}
						} else {
							// Create new calendar event
							try {
								// Check if task is recurring and pass recurrence params
								const eventResult = await calendarService.scheduleTask(user.id, {
									task_id: item.taskId,
									start_time: scheduledStart.toISOString(),
									duration_minutes: duration,
									description: `Phase: ${phase.name}\nProject: ${project.name}`,
									timeZone,
									// Pass recurrence parameters if task is recurring
									recurrence_pattern:
										task.task_type === 'recurring' && task.recurrence_pattern
											? task.recurrence_pattern
											: undefined,
									recurrence_ends:
										task.task_type === 'recurring' && task.recurrence_ends
											? task.recurrence_ends
											: undefined
								});

								results.push({
									taskId: item.taskId,
									success: true,
									action: 'created',
									event: eventResult
								});
							} catch (calendarError) {
								console.warn(
									`Calendar creation failed for task ${item.taskId}:`,
									calendarError
								);
								results.push({
									taskId: item.taskId,
									success: false,
									action: 'calendar_creation_failed',
									error:
										calendarError instanceof Error
											? calendarError.message
											: 'Calendar creation failed'
								});
							}
						}
					}
				} catch (error) {
					console.error(`Error scheduling task ${item.taskId}:`, error);
					errors.push({
						taskId: item.taskId,
						error: error instanceof Error ? error.message : 'Unknown error'
					});

					taskUpdateResults.push({
						taskId: item.taskId,
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error'
					});
				}
			}

			// Prepare response with detailed results
			const successfulTaskUpdates = taskUpdateResults.filter((r) => r.success);
			const failedTaskUpdates = taskUpdateResults.filter((r) => !r.success);
			const responseWarnings = [];

			if (failedTaskUpdates.length > 0) {
				responseWarnings.push(`Failed to update ${failedTaskUpdates.length} task(s)`);
			}

			if (errors.length > 0) {
				responseWarnings.push(`${errors.length} calendar operation(s) failed`);
			}

			return json({
				success: true,
				results,
				errors,
				task_updates: {
					successful: successfulTaskUpdates,
					failed: failedTaskUpdates,
					total: manualSchedule.length
				},
				warnings: responseWarnings,
				message: `Successfully scheduled ${successfulTaskUpdates.length} of ${manualSchedule.length} tasks`
			});
		}
	} catch (error) {
		console.error('Error in phase scheduling:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};

export const DELETE: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { id: projectId, phaseId } = params;
		const { timeZone } = await request.json().catch(() => ({}));

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, name')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return json({ error: 'Project not found' }, { status: 404 });
		}

		// Get phase with tasks
		const { data: phase, error: phaseError } = await supabase
			.from('phases')
			.select(
				`
				*,
				phase_tasks (
					task_id,
					tasks(
						id,
						title,
						start_date,
						duration_minutes
					)
				)
			`
			)
			.eq('id', phaseId)
			.eq('project_id', projectId)
			.single();

		if (phaseError || !phase) {
			return json({ error: 'Phase not found' }, { status: 404 });
		}

		// Extract tasks from phase_tasks that have schedules
		const scheduledTasks = phase.phase_tasks
			.map((pt: any) => pt.tasks)
			.filter((task: any) => task.start_date);

		if (scheduledTasks.length === 0) {
			return json({
				success: true,
				message: 'No scheduled tasks found in this phase',
				unscheduled_tasks: [],
				warnings: ['No tasks were scheduled in this phase']
			});
		}

		const calendarService = new CalendarService(supabase);
		const results = [];
		const errors = [];
		const warnings = [];

		// Process each scheduled task
		for (const task of scheduledTasks) {
			try {
				// Get existing calendar events for this task
				const { data: existingEvents } = await supabase
					.from('task_calendar_events')
					.select('*')
					.eq('task_id', task.id)
					.eq('user_id', user.id);

				// Delete calendar events
				if (existingEvents && existingEvents.length > 0) {
					for (const event of existingEvents) {
						try {
							await calendarService.deleteCalendarEvent(user.id, {
								event_id: event.calendar_event_id,
								calendar_id: event.calendar_id || 'primary',
								send_notifications: false
							});
						} catch (calendarError) {
							console.warn(
								`Failed to delete calendar event for task ${task.id}:`,
								calendarError
							);
							warnings.push(`Calendar event deletion failed for task: ${task.title}`);
						}
					}
				}

				// Clear task scheduling data
				const { data: updatedTask, error: taskUpdateError } = await supabase
					.from('tasks')
					.update({
						start_date: null,
						updated_at: new Date().toISOString()
					})
					.eq('id', task.id)
					.eq('user_id', user.id)
					.select('id, title')
					.single();

				if (taskUpdateError) {
					throw new Error(`Failed to unschedule task: ${taskUpdateError.message}`);
				}

				results.push({
					taskId: task.id,
					title: task.title,
					success: true,
					action: 'unscheduled'
				});
			} catch (error) {
				console.error(`Error unscheduling task ${task.id}:`, error);
				errors.push({
					taskId: task.id,
					title: task.title,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		const successCount = results.length;
		const errorCount = errors.length;

		return json({
			success: true,
			unscheduled_tasks: results,
			errors,
			warnings,
			summary: {
				total_tasks: scheduledTasks.length,
				successful: successCount,
				failed: errorCount
			},
			message: `Successfully unscheduled ${successCount} of ${scheduledTasks.length} tasks`
		});
	} catch (error) {
		console.error('Error in phase unscheduling:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};

// Generate proposed schedule using intelligent LLM analysis + TaskTimeSlotFinder
async function generateProposedSchedule(
	phase: any,
	tasks: any[],
	preferences: any,
	supabaseClient: any,
	userId: string,
	warnings: string[],
	timeZone: string,
	currentDateTime?: string
): Promise<any[]> {
	// Parse phase dates - these come as ISO strings from DB
	const phaseStart = new Date(phase.start_date);
	const phaseEnd = new Date(phase.end_date);

	// Use provided currentDateTime or fall back to system time
	// Add 1-hour buffer to ensure no immediate scheduling
	const now = currentDateTime ? new Date(currentDateTime) : new Date();
	const currentDateWithBuffer = addMinutes(now, 60); // Add 1-hour buffer

	// The effective start date should be the later of: phase start or current time + buffer
	const effectiveStartDate =
		currentDateWithBuffer > phaseStart ? currentDateWithBuffer : phaseStart;

	// Check if phase has already ended
	if (currentDateWithBuffer > phaseEnd) {
		warnings.push('Phase has already ended. Cannot schedule tasks in the past.');
		return [];
	}

	// Prepare tasks for scheduling
	const tasksToSchedule: TaskToSchedule[] = tasks.map((task) => ({
		id: task.id,
		title: task.title,
		description: task.description,
		duration_minutes: task.duration_minutes || preferences.default_task_duration_minutes || 60,
		priority: task.priority,
		dependencies: task.dependencies,
		suggested_start_date: task.suggested_start_date,
		status: task.status
	}));

	try {
		// Step 1: Fetch existing schedule to avoid conflicts
		const existingSchedule = await fetchExistingSchedule(
			supabaseClient,
			userId,
			effectiveStartDate,
			phaseEnd,
			phase.id
		);

		// Step 2: Use LLM to intelligently schedule tasks
		const llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS',
			supabase: supabaseClient
		});

		const systemPrompt = buildSchedulingSystemPrompt();
		const dataPrompt = buildSchedulingDataPrompt(
			{
				...phase,
				start_date: effectiveStartDate.toISOString(), // Use effective start date
				end_date: phaseEnd.toISOString()
			},
			tasksToSchedule,
			existingSchedule,
			preferences,
			currentDateWithBuffer.toISOString()
		);

		const llmSchedule = await llmService.getJSONResponse({
			systemPrompt,
			userPrompt: dataPrompt,
			userId,
			profile: 'balanced'
		});

		if (!llmSchedule) {
			throw new Error('Failed to get scheduling from LLM');
		}

		// Step 3: Validate LLM output
		const validation = validateLLMSchedule(
			llmSchedule,
			tasksToSchedule,
			effectiveStartDate,
			phaseEnd,
			currentDateWithBuffer
		);

		if (!validation.valid) {
			warnings.push(...validation.errors);
			throw new Error('Invalid LLM schedule');
		}

		// Step 4: Prepare tasks with LLM-suggested dates
		// We need to map back to original task objects, not simplified ones
		const tasksWithLLMDates = tasks.map((originalTask) => {
			const llmSuggestion = llmSchedule.scheduled_tasks.find(
				(st) => st.task_id === originalTask.id
			);

			if (llmSuggestion) {
				return {
					...originalTask,
					start_date: llmSuggestion.suggested_date,
					scheduling_reasoning: llmSuggestion.reasoning
				};
			}

			// Fallback if LLM didn't schedule this task
			const workStartHour = parseInt(preferences.work_start_time.split(':')[0]);
			const workStartMin = parseInt(preferences.work_start_time.split(':')[1] || '0');
			const dateWithTime = setMinutes(
				setHours(effectiveStartDate, workStartHour),
				workStartMin
			);

			return {
				...originalTask,
				start_date: dateWithTime.toISOString()
			};
		});

		// Step 5: Use TaskTimeSlotFinder to verify and optimize time slots
		const scheduler = new TaskTimeSlotFinder(supabaseClient);
		const finalScheduledTasks = await scheduler.scheduleTasks(tasksWithLLMDates, userId);

		// Step 6: Convert to response format with reasoning
		const schedule = finalScheduledTasks.map((task) => {
			const duration =
				task.duration_minutes || preferences.default_task_duration_minutes || 60;
			const startDate = task.start_date ? new Date(task.start_date) : new Date();
			const endDate = addMinutes(startDate, duration);

			// Check if the task fits within phase boundaries
			const hasConflict = startDate > phaseEnd || endDate > phaseEnd;

			// Find the reasoning from LLM
			const llmTask = llmSchedule.scheduled_tasks.find((st) => st.task_id === task.id);

			return {
				taskId: task.id,
				proposedStart: task.start_date || startDate.toISOString(),
				proposedEnd: endDate.toISOString(),
				reasoning: llmTask?.reasoning || 'Scheduled based on availability',
				hasConflict,
				conflictReason: hasConflict ? 'Task extends beyond phase end date' : undefined,
				timeZone: timeZone
			};
		});

		// Add LLM strategy to warnings (as info)
		if (llmSchedule.scheduling_strategy) {
			warnings.push(`Strategy: ${llmSchedule.scheduling_strategy}`);
		}

		// Add any LLM warnings
		if (llmSchedule.warnings && llmSchedule.warnings.length > 0) {
			warnings.push(...llmSchedule.warnings);
		}

		// Add warnings for tasks that couldn't be scheduled within the phase
		const conflictedTasks = schedule.filter((s) => s.hasConflict);
		if (conflictedTasks.length > 0) {
			warnings.push(
				`${conflictedTasks.length} task(s) could not be scheduled within phase boundaries`
			);
		}

		return schedule;
	} catch (error) {
		console.error('Error in intelligent scheduling:', error);
		warnings.push('Using simplified scheduling due to error');

		// Fallback to TaskTimeSlotFinder without LLM
		try {
			const scheduler = new TaskTimeSlotFinder(supabaseClient);

			// Prepare tasks with basic start dates
			const basicTasks = tasks.map((task) => {
				if (task.start_date) {
					const taskDate = new Date(task.start_date);
					if (taskDate < effectiveStartDate) {
						const originalHours = taskDate.getHours();
						const originalMinutes = taskDate.getMinutes();
						const adjustedDate = setMinutes(
							setHours(effectiveStartDate, originalHours),
							originalMinutes
						);
						return { ...task, start_date: adjustedDate.toISOString() };
					}
					return task;
				}

				const workStartHour = parseInt(preferences.work_start_time.split(':')[0]);
				const workStartMin = parseInt(preferences.work_start_time.split(':')[1] || '0');
				const dateWithTime = setMinutes(
					setHours(effectiveStartDate, workStartHour),
					workStartMin
				);

				return { ...task, start_date: dateWithTime.toISOString() };
			});

			const scheduledTasks = await scheduler.scheduleTasks(basicTasks, userId);

			return scheduledTasks.map((task) => {
				const duration =
					task.duration_minutes || preferences.default_task_duration_minutes || 60;
				const startDate = task.start_date ? new Date(task.start_date) : new Date();
				const endDate = addMinutes(startDate, duration);
				const hasConflict = startDate > phaseEnd || endDate > phaseEnd;

				return {
					taskId: task.id,
					proposedStart: task.start_date || startDate.toISOString(),
					proposedEnd: endDate.toISOString(),
					hasConflict,
					conflictReason: hasConflict ? 'Task extends beyond phase end date' : undefined,
					timeZone: timeZone
				};
			});
		} catch (fallbackError) {
			console.error('Fallback scheduling also failed:', fallbackError);
			warnings.push('Unable to generate optimized schedule');

			// Last resort: simple date assignment
			return tasks.map((task) => {
				const duration =
					task.duration_minutes || preferences.default_task_duration_minutes || 60;
				const startDate = task.start_date ? new Date(task.start_date) : effectiveStartDate;
				const endDate = addMinutes(startDate, duration);

				return {
					taskId: task.id,
					proposedStart: startDate.toISOString(),
					proposedEnd: endDate.toISOString(),
					hasConflict: false,
					timeZone: timeZone
				};
			});
		}
	}
}
