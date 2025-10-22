// apps/web/src/routes/api/projects/[id]/tasks/reschedule-overdue/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';
import { TaskTimeSlotFinder } from '$lib/services/task-time-slot-finder';
import { SmartLLMService } from '$lib/services/smart-llm-service';
// ============================================================================
// Type Definitions
// ============================================================================

interface RescheduleResult {
	rescheduled_tasks: Array<{
		task_id: string;
		new_start_date: string;
		reasoning: string;
		days_shifted: number;
	}>;
	shifted_tasks?: Array<{
		task_id: string;
		new_start_date: string;
		reasoning: string;
	}>;
	overall_strategy: string;
	conflicts_resolved: string[];
	warnings?: string[];
}

interface TaskUpdate {
	id: string;
	start_date: string;
	updated_at: string;
}

interface PhaseAssignment {
	task_id: string;
	phase_ids: string[];
	assignment_reason: string;
}

interface CalendarOperation {
	type: 'update' | 'create';
	task: any;
	newDate: string;
}

// ============================================================================
// Helper Functions - Project & Task Fetching
// ============================================================================

async function verifyProjectOwnership(supabase: any, projectId: string, userId: string) {
	const { data: project, error } = await supabase
		.from('projects')
		.select('*')
		.eq('id', projectId)
		.eq('user_id', userId)
		.single();

	if (error || !project) {
		throw new Error('Project not found');
	}

	return project;
}

async function fetchProjectPhases(supabase: any, projectId: string) {
	const { data: phases } = await supabase
		.from('phases')
		.select('id, name, start_date, end_date, order')
		.eq('project_id', projectId)
		.order('order');

	return phases || [];
}

async function fetchAllProjectTasks(supabase: any, projectId: string) {
	const { data: tasks, error } = await supabase
		.from('tasks')
		.select(
			`
			*,
			task_calendar_events (*),
			phase_tasks (phase_id)
		`
		)
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('start_date', { ascending: true });

	if (error) {
		console.error('Failed to fetch tasks:', error);
		throw new Error('Failed to fetch tasks');
	}

	return tasks || [];
}

// ============================================================================
// Helper Functions - Phase Assignment
// ============================================================================

/**
 * Find all phases that a task falls within (handles overlapping phases)
 * @param taskDateTime - Task's datetime string
 * @param phases - Array of project phases
 * @returns Array of phase IDs that the task falls within
 */
function findPhasesForDate(taskDateTime: string, phases: any[]): string[] {
	if (phases.length === 0 || !taskDateTime) return [];

	// Extract date part from task's datetime
	const dateParts = taskDateTime.split('T');
	if (!dateParts[0]) return [];
	const taskDate = dateParts[0];

	const matchingPhases: string[] = [];

	for (const phase of phases) {
		if (!phase.start_date || !phase.end_date) continue;

		// Direct date string comparison since both are YYYY-MM-DD format
		if (taskDate >= phase.start_date && taskDate <= phase.end_date) {
			matchingPhases.push(phase.id);
		}
	}

	return matchingPhases;
}

/**
 * Process phase assignments for all task updates
 * @returns Array of phase assignments with task_id and phase_ids
 */
function processPhaseAssignments(
	taskUpdates: Array<{ id: string; start_date: string; current_phase_ids?: string[] }>,
	phases: any[]
): PhaseAssignment[] {
	const assignments: PhaseAssignment[] = [];

	for (const update of taskUpdates) {
		const newPhaseIds = findPhasesForDate(update.start_date, phases);
		const currentPhaseIds = update.current_phase_ids || [];

		// Only create assignment if phases have changed
		const hasChanged =
			newPhaseIds.length !== currentPhaseIds.length ||
			!newPhaseIds.every((id) => currentPhaseIds.includes(id));

		if (hasChanged) {
			assignments.push({
				task_id: update.id,
				phase_ids: newPhaseIds,
				assignment_reason: 'Automatically assigned based on rescheduled date'
			});
		}
	}

	return assignments;
}

// ============================================================================
// Helper Functions - Database Operations
// ============================================================================

async function batchUpdateTaskDates(supabase: any, taskUpdates: TaskUpdate[]): Promise<any[]> {
	// Update tasks in parallel
	const updatePromises = taskUpdates.map((update) =>
		supabase
			.from('tasks')
			.update({
				start_date: update.start_date,
				updated_at: update.updated_at
			})
			.eq('id', update.id)
			.select(
				`
				*,
				task_calendar_events(*),
				phase_tasks(
					phase_id,
					phases(id, name)
				)
			`
			)
			.single()
	);

	const results = await Promise.all(updatePromises);

	const updatedTasks: any[] = [];
	for (const result of results) {
		if (!result.error && result.data) {
			updatedTasks.push(result.data);
		} else if (result.error) {
			console.error('Failed to update task:', result.error);
		}
	}

	return updatedTasks;
}

async function updatePhaseAssignments(supabase: any, assignments: PhaseAssignment[]) {
	if (assignments.length === 0) return;

	// Step 1: Remove all existing phase_tasks for these tasks
	const taskIds = assignments.map((a) => a.task_id);

	const { error: deleteError } = await supabase
		.from('phase_tasks')
		.delete()
		.in('task_id', taskIds);

	if (deleteError) {
		console.error('Failed to delete existing phase assignments:', deleteError);
	}

	// Step 2: Create new phase_tasks entries for tasks with phases
	const newEntries: any[] = [];

	for (const assignment of assignments) {
		for (const phaseId of assignment.phase_ids) {
			newEntries.push({
				task_id: assignment.task_id,
				phase_id: phaseId,
				assignment_reason: assignment.assignment_reason,
				order: 1 // Will be updated below with correct ordering
			});
		}
	}

	// Update orders for all new entries
	if (newEntries.length > 0) {
		// Get max orders for all affected phases
		const uniquePhaseIds = [...new Set(newEntries.map((e) => e.phase_id))];
		const { data: maxOrders } = await supabase
			.from('phase_tasks')
			.select('phase_id, order')
			.in('phase_id', uniquePhaseIds)
			.order('order', { ascending: false });

		// Create a map of phase_id -> max order
		const phaseMaxOrders = new Map<string, number>();
		if (maxOrders) {
			for (const row of maxOrders) {
				if (!phaseMaxOrders.has(row.phase_id)) {
					phaseMaxOrders.set(row.phase_id, row.order);
				}
			}
		}

		// Assign correct orders
		for (const entry of newEntries) {
			const currentMax = phaseMaxOrders.get(entry.phase_id) || 0;
			entry.order = currentMax + 1;
			phaseMaxOrders.set(entry.phase_id, entry.order);
		}

		const { error: insertError } = await supabase.from('phase_tasks').insert(newEntries);

		if (insertError) {
			console.error('Failed to insert new phase assignments:', insertError);
		}
	}
}

// ============================================================================
// Helper Functions - TaskTimeSlotFinder Integration
// ============================================================================

async function findOptimalTimeSlots(
	supabase: any,
	tasksToReschedule: any[],
	userId: string,
	targetStartDate: string
): Promise<Map<string, Date>> {
	const scheduler = new TaskTimeSlotFinder(supabase);

	// Prepare tasks with proper start dates for scheduling
	const tasksForScheduling = tasksToReschedule.map((task) => ({
		...task,
		// Use target start date as baseline for overdue tasks
		start_date: targetStartDate || new Date().toISOString()
	}));

	// Get scheduled tasks with time slots
	const scheduledTasks = await scheduler.scheduleTasks(tasksForScheduling, userId);

	// Create map of task ID to new start date
	const timeSlotMap = new Map<string, Date>();

	for (const task of scheduledTasks) {
		if (task.start_date) {
			timeSlotMap.set(task.id, new Date(task.start_date));
		}
	}

	return timeSlotMap;
}

// ============================================================================
// Helper Functions - LLM Prompts
// ============================================================================

function buildRescheduleSystemPrompt(shiftExisting: boolean, hasPhases: boolean): string {
	const today = new Date().toISOString().split('T')[0];

	return `You are an expert project scheduler specializing in resolving scheduling conflicts and managing overdue tasks.
Your job is to intelligently reschedule overdue tasks to future dates while maintaining project flow and dependencies.

CRITICAL RULES:
1. All overdue tasks MUST be rescheduled to future dates (${today} or later)
2. NEVER schedule tasks with start dates before ${today} (today's date)
3. Respect task dependencies - dependent tasks must come after their prerequisites
4. Avoid scheduling on weekends unless explicitly needed
5. Consider task priority and urgency when determining new dates
6. Maintain reasonable daily workload (avoid scheduling too many tasks on same day)
7. Focus on finding the optimal dates for each task
8. Return valid JSON only

${
	shiftExisting
		? `
SHIFT MODE: Shift Existing Tasks
- You MAY shift existing scheduled tasks to make room for overdue tasks
- Prioritize overdue tasks that are blocking other work
- Shift lower priority existing tasks when needed
- Maintain logical task sequencing
- Explain which tasks were shifted and why`
		: `
SHIFT MODE: Fit Around Existing
- Do NOT move existing scheduled tasks
- Find available slots between existing tasks
- May need to schedule overdue tasks further in the future
- Look for gaps in the current schedule
- If no gaps exist, schedule after all existing tasks`
}

${
	hasPhases
		? `
PHASE AWARENESS:
- The project has phases with specific date ranges
- Try to schedule tasks within appropriate phase periods when possible
- Consider phase timelines as soft boundaries for better organization`
		: ''
}

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
	"rescheduled_tasks": [
		{
			"task_id": "task-uuid",
			"new_start_date": "YYYY-MM-DD",
			"reasoning": "Why this date was chosen",
			"days_shifted": 5
		}
	],
	"shifted_tasks": [
		{
			"task_id": "existing-task-uuid",
			"new_start_date": "YYYY-MM-DD",
			"reasoning": "Why this task was shifted"
		}
	],
	"overall_strategy": "Brief explanation of the rescheduling approach",
	"conflicts_resolved": ["List of conflicts that were resolved"],
	"warnings": ["Any concerns about the new schedule"]
}

IMPORTANT: Return ONLY dates in YYYY-MM-DD format. The system will automatically assign appropriate working hours based on user preferences.`;
}

function buildRescheduleDataPrompt(
	overdueTasks: any[],
	existingTasks: any[],
	project: any,
	targetStartDate: string,
	phases: any[]
): string {
	const today = new Date().toISOString().split('T')[0];

	// Format overdue tasks with urgency info
	const overdueInfo = overdueTasks.map((task) => {
		const daysOverdue = task.start_date
			? Math.ceil(
					(new Date().getTime() - new Date(task.start_date).getTime()) /
						(1000 * 60 * 60 * 24)
				)
			: 0;

		const phaseIds = task.phase_tasks?.map((pt: any) => pt.phase_id) || [];

		return {
			id: task.id,
			title: task.title,
			description: task.description,
			priority: task.priority,
			original_date: task.start_date,
			days_overdue: daysOverdue,
			phase_ids: phaseIds,
			dependencies: task.dependencies,
			duration_minutes: task.duration_minutes
		};
	});

	// Format existing scheduled tasks
	const scheduledInfo = existingTasks
		.filter((t) => t.start_date && new Date(t.start_date) >= new Date(targetStartDate))
		.map((task) => {
			const phaseIds = task.phase_tasks?.map((pt: any) => pt.phase_id) || [];

			return {
				id: task.id,
				title: task.title,
				scheduled_date: task.start_date,
				priority: task.priority,
				phase_ids: phaseIds,
				can_be_shifted: task.priority !== 'high'
			};
		});

	// Format phases
	const phaseInfo = phases.map((phase) => ({
		id: phase.id,
		name: phase.name,
		start_date: phase.start_date,
		end_date: phase.end_date,
		order: phase.order,
		is_active: phase.end_date ? new Date(phase.end_date) >= new Date() : true
	}));

	return `CURRENT DATE: ${today}
TARGET START DATE: ${targetStartDate}

IMPORTANT: Today is ${today}. ALL tasks must be scheduled for ${targetStartDate} or later. 
Never schedule any task before ${targetStartDate}.

PROJECT INFORMATION:
Name: ${project.name}
Description: ${project.description || 'No description'}
Start Date: ${project.start_date || 'Not set'}
End Date: ${project.end_date || 'Not set'}

${
	phases.length > 0
		? `PROJECT PHASES (${phases.length}):
${JSON.stringify(phaseInfo, null, 2)}`
		: 'PROJECT PHASES: None defined'
}

OVERDUE TASKS TO RESCHEDULE (${overdueTasks.length}):
${JSON.stringify(overdueInfo, null, 2)}

EXISTING SCHEDULED TASKS (${scheduledInfo.length}):
${JSON.stringify(scheduledInfo, null, 2)}

Please analyze the overdue tasks and create a new schedule starting from ${targetStartDate}.
REMINDER: Do not schedule any task before ${targetStartDate}. All new_start_date values must be >= ${targetStartDate}.
Prioritize tasks that are most overdue and those blocking other work.
Ensure all tasks are scheduled to reasonable future dates with proper spacing.
Focus on finding optimal dates - do NOT worry about phase assignments.`;
}

// ============================================================================
// Helper Functions - Calendar Sync
// ============================================================================

async function syncTasksToCalendar(
	supabase: any,
	calendarOperations: CalendarOperation[],
	userId: string,
	updatedTasks: any[]
) {
	if (calendarOperations.length === 0) return;

	const calendarService = new CalendarService(supabase);
	const hasValidConnection = await calendarService.hasValidConnection(userId);

	if (!hasValidConnection) {
		console.log('No valid calendar connection, skipping sync');
		return;
	}

	// Process calendar operations in batches
	const BATCH_SIZE = 5;

	for (let i = 0; i < calendarOperations.length; i += BATCH_SIZE) {
		const batch = calendarOperations.slice(i, i + BATCH_SIZE);

		await Promise.all(
			batch.map(async (op) => {
				try {
					if (op.type === 'update' && op.task.task_calendar_events?.[0]) {
						const result = await calendarService.updateCalendarEvent(userId, {
							event_id: op.task.task_calendar_events[0].calendar_event_id,
							calendar_id: op.task.task_calendar_events[0].calendar_id || 'primary',
							start_time: op.newDate,
							end_time: op.newDate, // Same as start for all-day tasks
							summary: op.task.title,
							description: op.task.description || '',
							timeZone: 'America/New_York'
						});

						if (result.success) {
							// Update sync status
							await supabase
								.from('task_calendar_events')
								.update({
									event_start: op.newDate,
									event_end: op.newDate,
									last_synced_at: new Date().toISOString(),
									sync_status: 'synced',
									sync_error: null
								})
								.eq('id', op.task.task_calendar_events[0].id);
						}
					} else if (op.type === 'create') {
						// Find the updated task data
						const updatedTask = updatedTasks.find((t) => t.id === op.task.id);
						if (!updatedTask) return;

						await calendarService.scheduleTask(userId, {
							task_id: updatedTask.id,
							start_time: op.newDate,
							duration_minutes: updatedTask.duration_minutes || 60,
							description: `Task: ${updatedTask.title}\n${updatedTask.description || ''}`,
							timeZone: 'America/New_York'
						});
					}
				} catch (calendarError) {
					console.error('Calendar sync error:', calendarError);
					// Continue with other operations even if one fails
				}
			})
		);
	}
}

// ============================================================================
// Main Request Handler
// ============================================================================

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
		const {
			taskIds,
			shiftExisting = true,
			targetStartDate,
			useCalendar = false,
			useTimeSlotFinder = true // New option to use TaskTimeSlotFinder
		} = body;

		if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
			return ApiResponse.error('No tasks provided', 400);
		}

		// Fetch project data - verify ownership first, then fetch phases and tasks in parallel
		const project = await verifyProjectOwnership(supabase, projectId, user.id);

		const [phases, allTasks] = await Promise.all([
			fetchProjectPhases(supabase, projectId),
			fetchAllProjectTasks(supabase, projectId)
		]);

		// Separate overdue and existing scheduled tasks
		const now = new Date();
		const startDate = targetStartDate ? new Date(targetStartDate) : new Date();

		// Ensure start date is not in the past
		if (startDate < now) {
			startDate.setTime(now.getTime());
		}

		const overdueTasks = allTasks.filter((t: any) => taskIds.includes(t.id));
		const existingScheduledTasks = allTasks.filter(
			(t: any) => !taskIds.includes(t.id) && t.start_date && t.status !== 'done'
		);

		// Step 1: Use TaskTimeSlotFinder to find optimal time slots
		let timeSlotMap: Map<string, Date> = new Map();

		if (useTimeSlotFinder) {
			timeSlotMap = await findOptimalTimeSlots(
				supabase,
				overdueTasks,
				user.id,
				startDate.toISOString()
			);
		}

		// Step 2: Use LLM for intelligent rescheduling with time slot suggestions
		const systemPrompt = buildRescheduleSystemPrompt(shiftExisting, phases.length > 0);
		const dataPrompt = buildRescheduleDataPrompt(
			overdueTasks,
			existingScheduledTasks,
			project,
			targetStartDate || startDate.toISOString().split('T')[0],
			phases
		);

		const llmService = new SmartLLMService({
			httpReferer: 'https://buildos.dev',
			appName: 'BuildOS',
			supabase
		});

		const rescheduleResult = await llmService.getJSONResponse({
			systemPrompt,
			userPrompt:
				dataPrompt +
				(useTimeSlotFinder && timeSlotMap.size > 0
					? `\n\nOPTIMAL TIME SLOTS (based on calendar availability and work hours):\n${Array.from(
							timeSlotMap.entries()
						)
							.map(([taskId, date]) => {
								const task = overdueTasks.find((t: any) => t.id === taskId);
								return `Task "${task?.title}" (${taskId}): ${date.toISOString().split('T')[0]} at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
							})
							.join(
								'\n'
							)}\n\nSTRONGLY PREFER these dates as they account for calendar availability and working hours. Only deviate if there are dependency conflicts.`
					: ''),
			userId: user.id,
			profile: 'balanced'
		});

		if (!rescheduleResult) {
			throw new Error('Failed to get rescheduling plan from LLM');
		}

		// Step 3: Prepare task updates with phase assignments
		const taskUpdates: TaskUpdate[] = [];
		const calendarOperations: CalendarOperation[] = [];

		// Process rescheduled overdue tasks
		for (const reschedule of rescheduleResult.rescheduled_tasks) {
			const task = overdueTasks.find((t: any) => t.id === reschedule.task_id);
			if (!task) continue;

			// Get current phase IDs
			const currentPhaseIds = task.phase_tasks?.map((pt: any) => pt.phase_id) || [];

			// Use TaskTimeSlotFinder's suggested time if available, otherwise use LLM's date with proper working hours
			let newStartDateTime: string;

			if (useTimeSlotFinder && timeSlotMap.has(task.id)) {
				// Use the time slot from TaskTimeSlotFinder (already has proper time)
				newStartDateTime = timeSlotMap.get(task.id)!.toISOString();
			} else {
				// Convert LLM's date to a proper working hour (default to 9am local time if no preferences)
				const dateOnly = reschedule.new_start_date;
				// Create date at 9am in user's timezone (or system default)
				const newDate = new Date(dateOnly + 'T09:00:00');
				newStartDateTime = newDate.toISOString();
			}

			taskUpdates.push({
				id: task.id,
				start_date: newStartDateTime,
				updated_at: new Date().toISOString(),
				current_phase_ids: currentPhaseIds
			} as any);

			if (useCalendar) {
				calendarOperations.push({
					type: task.task_calendar_events?.[0] ? 'update' : 'create',
					task,
					newDate: newStartDateTime
				});
			}
		}

		// Process shifted existing tasks if any
		if (shiftExisting && rescheduleResult.shifted_tasks) {
			for (const shift of rescheduleResult.shifted_tasks) {
				const task = existingScheduledTasks.find((t: any) => t.id === shift.task_id);
				if (!task) continue;

				const currentPhaseIds = task.phase_tasks?.map((pt: any) => pt.phase_id) || [];

				// For shifted tasks, preserve their original time if they had one
				let newStartDateTime: string;
				if (task.start_date) {
					// Extract the time from the original task
					const originalDate = new Date(task.start_date);
					const originalTimeParts = originalDate.toISOString().split('T');
					if (originalTimeParts[1]) {
						// Apply original time to new date
						const timeWithoutMs = originalTimeParts[1].split('.')[0];
						newStartDateTime = new Date(
							shift.new_start_date + 'T' + timeWithoutMs
						).toISOString();
					} else {
						// Fallback to 9am if time extraction fails
						newStartDateTime = new Date(
							shift.new_start_date + 'T09:00:00'
						).toISOString();
					}
				} else {
					// Default to 9am if no original time
					newStartDateTime = new Date(shift.new_start_date + 'T09:00:00').toISOString();
				}

				taskUpdates.push({
					id: task.id,
					start_date: newStartDateTime,
					updated_at: new Date().toISOString(),
					current_phase_ids: currentPhaseIds
				} as any);

				if (useCalendar && task.task_calendar_events?.[0]) {
					calendarOperations.push({
						type: 'update',
						task,
						newDate: newStartDateTime
					});
				}
			}
		}

		// Step 4: Calculate phase assignments (handles overlaps)
		const phaseAssignments = processPhaseAssignments(taskUpdates as any, phases);

		// Step 5: Execute batch database operations
		const [updatedTasks] = await Promise.all([
			batchUpdateTaskDates(supabase, taskUpdates),
			updatePhaseAssignments(supabase, phaseAssignments)
		]);

		// Step 6: Sync to calendar if enabled
		if (useCalendar) {
			await syncTasksToCalendar(supabase, calendarOperations, user.id, updatedTasks);
		}

		// Step 7: Build response
		const rescheduledTasks = updatedTasks.filter((t: any) =>
			rescheduleResult.rescheduled_tasks.some((r) => r.task_id === t.id)
		);

		const shiftedTasks = updatedTasks.filter((t: any) =>
			rescheduleResult.shifted_tasks?.some((s) => s.task_id === t.id)
		);

		const response_data: any = {
			rescheduledTasks,
			shiftedTasks,
			totalRescheduled: rescheduledTasks.length,
			totalShifted: shiftedTasks.length,
			strategy: rescheduleResult.overall_strategy,
			conflictsResolved: rescheduleResult.conflicts_resolved,
			warnings: rescheduleResult.warnings
		};

		// Include phase information if phases exist
		if (phases.length > 0) {
			response_data.phaseChanges = phaseAssignments.length;
			response_data.phaseUpdates = phaseAssignments.map((a) => ({
				task_id: a.task_id,
				assigned_to_phases: a.phase_ids,
				reason: a.assignment_reason
			}));
		}

		return ApiResponse.success(response_data);
	} catch (error) {
		console.error('Error rescheduling overdue tasks:', error);
		return ApiResponse.error(
			error instanceof Error ? error.message : 'Failed to reschedule tasks',
			500
		);
	}
};
