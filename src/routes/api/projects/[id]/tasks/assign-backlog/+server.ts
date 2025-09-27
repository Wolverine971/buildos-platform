// src/routes/api/projects/[id]/tasks/assign-backlog/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarService } from '$lib/services/calendar-service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { TaskTimeSlotFinder } from '$lib/services/task-time-slot-finder';

// ============================================================================
// Types
// ============================================================================

interface BacklogAssignmentResult {
	phase_assignments: Array<{
		task_id: string;
		phase_id: string;
		reasoning: string;
		suggested_date?: string;
		priority_order?: number;
	}>;
	overall_strategy: string;
	warnings?: string[];
}

interface PhaseInfo {
	id: string;
	name: string;
	description?: string;
	start_date?: string;
	end_date?: string;
	valid_date_range: {
		earliest_task_date: string;
		latest_task_date: string | null;
		description: string;
	};
	current_task_count: number;
	order: number;
	is_valid_for_assignment: boolean;
	status: 'active/future' | 'past';
}

interface TaskInfo {
	id: string;
	title: string;
	description?: string;
	dependencies?: any;
	duration_minutes?: number;
}

type AssignmentMethod = 'phases_only' | 'with_dates' | 'with_calendar';

// ============================================================================
// Helper Functions - Prompt Building
// ============================================================================

function getMethodSpecificInstructions(method: AssignmentMethod): string {
	const instructions = {
		phases_only: `
ASSIGNMENT METHOD: Phases Only
- Assign tasks to phases based on logical grouping and dependencies
- Do NOT suggest specific dates (leave suggested_date field empty)
- Focus on conceptual organization and workflow`,

		with_dates: `
ASSIGNMENT METHOD: With Dates
- Assign tasks to phases AND suggest specific dates
- CRITICAL: suggested_date MUST be >= phase.start_date AND <= phase.end_date
- If phase.start_date is null or in the past, use today's date as the minimum
- If phase.end_date is null, you can suggest any future date
- Distribute tasks evenly across the phase timeline
- Consider task dependencies when suggesting dates
- Format dates as ISO strings (YYYY-MM-DD)
- NEVER suggest a date outside the phase's date range`,

		with_calendar: `
ASSIGNMENT METHOD: With Calendar Integration
- Assign tasks to phases AND suggest specific dates for calendar sync
- CRITICAL: suggested_date MUST be >= phase.start_date AND <= phase.end_date
- If phase.start_date is null or in the past, use today's date as the minimum
- If phase.end_date is null, you can suggest any future date
- Leave buffer time between tasks for calendar scheduling
- Consider typical working hours (9am-5pm)
- Avoid scheduling on weekends
- Format dates as ISO strings (YYYY-MM-DD)
- NEVER suggest a date outside the phase's date range`
	};

	return instructions[method] || instructions.phases_only;
}

function buildBacklogAssignmentSystemPrompt(assignmentMethod: AssignmentMethod): string {
	const basePrompt = `You are an expert project manager specializing in task organization and phase assignment.
Your job is to intelligently assign backlog tasks to appropriate project phases based on:
- Task dependencies and relationships
- Phase objectives and timelines
- Task complexity and priority
- Logical workflow and progression
- Resource distribution across phases

CRITICAL RULES:
1. Every task MUST be assigned to exactly one phase
2. Do not schedule tasks for to have a start date in the past. 
3. Consider task dependencies when assigning to phases
4. Balance workload across phases that are still active or future
5. Group related tasks together when logical
6. Earlier phases should have foundational/prerequisite tasks
7. Later phases should have tasks that depend on earlier work
8. If a phase has ended (end_date < today), skip it and use only valid phases
9. Return valid JSON only`;

	const methodSpecific = getMethodSpecificInstructions(assignmentMethod);

	return `${basePrompt}\n${methodSpecific}

OUTPUT FORMAT:
Return a JSON object with this exact structure:
{
	"phase_assignments": [
		{
			"task_id": "task-uuid",
			"phase_id": "phase-uuid",
			"reasoning": "Brief explanation of why this task belongs in this phase",
			"suggested_date": "YYYY-MM-DD or null",
			"priority_order": 1
		}
	],
	"overall_strategy": "Brief explanation of the overall assignment strategy",
	"warnings": ["Any issues or concerns about the assignments"]
}`;
}

function buildBacklogAssignmentDataPrompt(
	tasks: TaskInfo[],
	phases: PhaseInfo[],
	project: any,
	assignmentMethod: AssignmentMethod,
	today: string
): string {
	const needsDates = assignmentMethod === 'with_dates' || assignmentMethod === 'with_calendar';

	return `CURRENT DATE: ${today}

PROJECT INFORMATION:
Name: ${project.name}
Description: ${project.description || 'No description'}
Start Date: ${project.start_date || 'Not set'}
End Date: ${project.end_date || 'Not set'}

AVAILABLE PHASES (${phases.length}):
${JSON.stringify(phases, null, 2)}

BACKLOG TASKS TO ASSIGN (${tasks.length}):
${JSON.stringify(tasks, null, 2)}

ASSIGNMENT METHOD: ${assignmentMethod}

CRITICAL DATE CONSTRAINTS:
${
	needsDates
		? `When suggesting dates for tasks:
1. ALWAYS use the phase's valid_date_range field to determine allowed dates
2. suggested_date MUST be >= valid_date_range.earliest_task_date
3. suggested_date MUST be <= valid_date_range.latest_task_date (if not null)
4. NEVER suggest a date before ${today}
5. NEVER suggest a date outside the phase's valid_date_range

Example: If a phase has:
- valid_date_range.earliest_task_date: "${today}"
- valid_date_range.latest_task_date: "2025-02-15"
Then ALL tasks assigned to this phase MUST have suggested_date between ${today} and 2025-02-15 inclusive.`
		: 'No date suggestions needed for this assignment method.'
}

IMPORTANT RULES:
1. Only assign tasks to phases where is_valid_for_assignment = true
2. DO NOT assign any tasks to phases marked as 'past' or where is_valid_for_assignment = false
3. ${
		needsDates
			? "Each suggested_date MUST fall within the assigned phase's valid_date_range"
			: 'Focus on logical grouping without specific date assignments'
	}

Please analyze these backlog tasks and assign each one to the most appropriate VALID phase.
Consider task complexity, dependencies, and logical workflow progression.`;
}

// ============================================================================
// Helper Functions - Data Processing
// ============================================================================

function formatPhasesForPrompt(phases: any[], today: string): PhaseInfo[] {
	const now = new Date();

	return phases.map((phase) => {
		const phaseStartDate = phase.start_date ? new Date(phase.start_date) : null;
		const phaseEndDate = phase.end_date ? new Date(phase.end_date) : null;
		const isValid = !phaseEndDate || phaseEndDate >= now;

		// Calculate valid date range for task scheduling
		let validStartDate = today;
		let validEndDate = phase.end_date || null;

		// If phase starts in the future, use phase start date
		if (phaseStartDate && phaseStartDate > now) {
			validStartDate = phase.start_date;
		}

		return {
			id: phase.id,
			name: phase.name,
			description: phase.description,
			start_date: phase.start_date,
			end_date: phase.end_date,
			valid_date_range: {
				earliest_task_date: validStartDate,
				latest_task_date: validEndDate,
				description: validEndDate
					? `Tasks must be scheduled between ${validStartDate} and ${validEndDate}`
					: `Tasks must be scheduled on or after ${validStartDate}`
			},
			current_task_count: phase.current_task_count || 0,
			order: phase.order,
			is_valid_for_assignment: isValid,
			status: isValid ? 'active/future' : 'past'
		};
	});
}

function formatTasksForPrompt(tasks: any[]): TaskInfo[] {
	return tasks.map((task) => ({
		id: task.id,
		title: task.title,
		description: task.description,
		dependencies: task.dependencies,
		duration_minutes: task.duration_minutes
	}));
}

// ============================================================================
// Helper Functions - Date Validation
// ============================================================================

function validateAndCorrectTaskDate(
	suggestedDate: string | undefined,
	phase: any,
	priorityOrder: number | undefined,
	totalTasksInPhase: number
): string {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Determine the valid date range for this phase
	let minDate = today;
	let maxDate: Date | null = null;

	if (phase.start_date) {
		const phaseStart = new Date(phase.start_date);
		phaseStart.setHours(0, 0, 0, 0);
		// Use the later of today or phase start
		minDate = phaseStart > today ? phaseStart : today;
	}

	if (phase.end_date) {
		maxDate = new Date(phase.end_date);
		maxDate.setHours(23, 59, 59, 999);
	}

	let finalDate: Date;

	if (suggestedDate) {
		finalDate = new Date(suggestedDate);

		// Validate the suggested date
		if (finalDate < minDate) {
			console.warn(
				`Date ${suggestedDate} is before phase start/today, using ${minDate.toISOString()}`
			);
			finalDate = new Date(minDate);
		} else if (maxDate && finalDate > maxDate) {
			console.warn(
				`Date ${suggestedDate} is after phase end, using ${maxDate.toISOString()}`
			);
			finalDate = new Date(maxDate);
		}
	} else {
		// No date suggested, calculate one
		if (maxDate) {
			// Distribute within phase timeline
			const phaseDuration = maxDate.getTime() - minDate.getTime();
			const offset = priorityOrder || 0;
			const dayOffset = Math.floor(
				(phaseDuration / (1000 * 60 * 60 * 24)) * (offset / totalTasksInPhase)
			);

			finalDate = new Date(minDate);
			finalDate.setDate(finalDate.getDate() + dayOffset);
		} else {
			// No phase end, use min date
			finalDate = new Date(minDate);
		}
	}

	return finalDate.toISOString();
}

// ============================================================================
// Helper Functions - Database Operations
// ============================================================================

async function getValidPhasesWithTaskCounts(
	supabase: any,
	projectId: string
): Promise<{ phases: any[]; taskCountsByPhase: Record<string, number> }> {
	// Get all phases for the project
	const { data: phases, error: phasesError } = await supabase
		.from('phases')
		.select('id, name, description, start_date, end_date, order')
		.eq('project_id', projectId)
		.order('order');

	if (phasesError || !phases || phases.length === 0) {
		throw new Error('No phases found for this project');
	}

	// Filter out phases with end dates in the past
	const now = new Date();
	const validPhases = phases.filter((phase) => {
		if (!phase.end_date) return true;
		const phaseEndDate = new Date(phase.end_date);
		return phaseEndDate >= now;
	});

	if (validPhases.length === 0) {
		throw new Error('No active or future phases found for this project');
	}

	// Get task counts for each valid phase
	const { data: phaseTasks } = await supabase
		.from('phase_tasks')
		.select('phase_id')
		.in(
			'phase_id',
			validPhases.map((p) => p.id)
		);

	// Count tasks per phase
	const taskCountsByPhase: Record<string, number> = {};
	if (phaseTasks) {
		phaseTasks.forEach((pt) => {
			taskCountsByPhase[pt.phase_id] = (taskCountsByPhase[pt.phase_id] || 0) + 1;
		});
	}

	return { phases: validPhases, taskCountsByPhase };
}

async function getBacklogTasks(supabase: any, projectId: string): Promise<any[]> {
	// Get all tasks for the project
	const { data: allProjectTasks, error: allTasksError } = await supabase
		.from('tasks')
		.select('id, phase_tasks(phase_id)')
		.eq('project_id', projectId)
		.is('deleted_at', null);

	if (allTasksError) {
		throw new Error('Failed to fetch project tasks');
	}

	// Find tasks that are NOT in phase_tasks (backlogged tasks)
	const tasksWithPhases = new Set(
		allProjectTasks
			?.filter((t) => t.phase_tasks && t.phase_tasks.length > 0)
			.map((t) => t.id) || []
	);

	const backloggedTaskIds =
		allProjectTasks?.filter((t) => !tasksWithPhases.has(t.id)).map((t) => t.id) || [];

	if (backloggedTaskIds.length === 0) {
		return [];
	}

	// Get the full details of backlogged tasks
	const { data: tasks, error: tasksError } = await supabase
		.from('tasks')
		.select('*')
		.eq('project_id', projectId)
		.in('id', backloggedTaskIds)
		.is('deleted_at', null);

	if (tasksError) {
		throw new Error('Failed to fetch backlog tasks');
	}

	return tasks || [];
}

async function batchUpdateTasksAndCreatePhaseAssignments(
	supabase: any,
	tasksToUpdate: any[],
	phaseAssignmentsToCreate: any[]
): Promise<any[]> {
	const now = new Date().toISOString();
	const assignedTasks: any[] = [];

	// Prepare batch updates
	const taskUpdatePromises = tasksToUpdate.map(async (task) => {
		const update: any = {
			updated_at: now
		};

		if (task.start_date) {
			update.start_date = task.start_date;
		}

		return {
			id: task.id,
			update,
			phase_id: task.phase_id
		};
	});

	const taskUpdates = await Promise.all(taskUpdatePromises);

	// Perform batch update using Promise.all for parallel execution
	const updateResults = await Promise.all(
		taskUpdates.map(({ id, update }) =>
			supabase
				.from('tasks')
				.update(update)
				.eq('id', id)
				.select('*, task_calendar_events(*)')
				.single()
		)
	);

	// Process update results
	updateResults.forEach((result, index) => {
		if (result.error) {
			console.error('Failed to update task:', taskUpdates[index].id, result.error);
			return;
		}

		// Add the phase_tasks relationship to the task for proper store updates
		const taskWithPhase = {
			...result.data,
			phase_tasks: [
				{
					phase_id: taskUpdates[index].phase_id,
					task_id: result.data.id
				}
			]
		};

		assignedTasks.push(taskWithPhase);
	});

	// Batch create phase assignments
	if (phaseAssignmentsToCreate.length > 0) {
		// First, delete any existing phase assignments for these tasks
		const taskIdsToAssign = phaseAssignmentsToCreate.map((a) => a.task_id);
		await supabase.from('phase_tasks').delete().in('task_id', taskIdsToAssign);

		// Now insert the new phase assignments
		const { error: phaseTaskError } = await supabase
			.from('phase_tasks')
			.insert(phaseAssignmentsToCreate);

		if (phaseTaskError) {
			console.error('Failed to create phase_task relationships:', phaseTaskError);
		}
	}

	return assignedTasks;
}

// ============================================================================
// Helper Functions - Calendar Sync
// ============================================================================

async function syncTasksToCalendar(supabase: any, userId: string, tasks: any[]): Promise<void> {
	try {
		const calendarService = new CalendarService(supabase);
		const hasValidConnection = await calendarService.hasValidConnection(userId);

		if (!hasValidConnection) {
			console.log('No valid calendar connection, skipping sync');
			return;
		}

		// Schedule tasks with dates to calendar
		const tasksWithDates = tasks.filter((t) => t.start_date);

		// Batch process calendar operations
		const BATCH_SIZE = 5;
		for (let i = 0; i < tasksWithDates.length; i += BATCH_SIZE) {
			const batch = tasksWithDates.slice(i, i + BATCH_SIZE);

			await Promise.all(
				batch.map(async (task) => {
					try {
						await calendarService.scheduleTask(userId, {
							task_id: task.id,
							start_time: new Date(task.start_date).toISOString(),
							duration_minutes: task.duration_minutes || 60,
							description: `Task: ${task.title}\n${task.description || ''}`,
							timeZone: 'America/New_York'
						});
					} catch (calendarError) {
						console.error(
							'Failed to create calendar event for task:',
							task.id,
							calendarError
						);
					}
				})
			);
		}
	} catch (calendarError) {
		console.error('Calendar sync failed:', calendarError);
	}
}

// ============================================================================
// Main Handler
// ============================================================================

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { id: projectId } = params;

	try {
		// Authentication
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		// Validate request body
		const body = await request.json();
		const { assignmentMethod, autoAssign = true, phaseAssignments } = body;

		if (
			!assignmentMethod ||
			!['phases_only', 'with_dates', 'with_calendar'].includes(assignmentMethod)
		) {
			return ApiResponse.error('Invalid assignment method', 400);
		}

		// Verify project ownership
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('*')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.error('Project not found', 404);
		}

		// Get valid phases and their task counts
		const { phases: validPhases, taskCountsByPhase } = await getValidPhasesWithTaskCounts(
			supabase,
			projectId
		);

		// Add task counts to phases
		const phasesWithCounts = validPhases.map((phase) => ({
			...phase,
			current_task_count: taskCountsByPhase[phase.id] || 0
		}));

		// Get backlog tasks
		const tasks = await getBacklogTasks(supabase, projectId);

		if (tasks.length === 0) {
			return ApiResponse.success({
				assignedTasks: [],
				totalAssigned: 0,
				method: assignmentMethod,
				strategy: 'No backlogged tasks found',
				warnings: ['No tasks in backlog to assign']
			});
		}

		// Process assignments
		let assignedTasks: any[] = [];
		let strategy: string = '';
		let warnings: string[] = [];

		if (autoAssign) {
			// Use LLM for intelligent auto-assignment
			const today = new Date().toISOString().split('T')[0];
			const phasesInfo = formatPhasesForPrompt(phasesWithCounts, today);
			const tasksInfo = formatTasksForPrompt(tasks);

			// Get LLM assignments
			const systemPrompt = buildBacklogAssignmentSystemPrompt(
				assignmentMethod as AssignmentMethod
			);
			const dataPrompt = buildBacklogAssignmentDataPrompt(
				tasksInfo,
				phasesInfo,
				project,
				assignmentMethod as AssignmentMethod,
				today
			);

			const llmService = new SmartLLMService({
				httpReferer: 'https://buildos.dev',
				appName: 'BuildOS',
				supabase
			});

			const llmAssignments = await llmService.getJSONResponse({
				systemPrompt,
				userPrompt: dataPrompt,
				userId: user.id,
				profile: 'balanced'
			});

			if (!llmAssignments) {
				throw new Error('Failed to get task assignments from LLM');
			}

			// Process assignments
			const now = new Date();
			const tasksToUpdate: any[] = [];
			const phaseAssignmentsToCreate: any[] = [];
			const needsDates =
				assignmentMethod === 'with_dates' || assignmentMethod === 'with_calendar';

			// Map LLM assignments to tasks
			for (const assignment of llmAssignments.phase_assignments) {
				const task = tasks.find((t) => t.id === assignment.task_id);
				if (!task) continue;

				const phase = phasesWithCounts.find((p) => p.id === assignment.phase_id);
				if (!phase) continue;

				// Prepare task with date if needed
				let taskWithDate = { ...task };

				if (needsDates) {
					const totalTasksInPhase = llmAssignments.phase_assignments.filter(
						(a) => a.phase_id === assignment.phase_id
					).length;

					taskWithDate.start_date = validateAndCorrectTaskDate(
						assignment.suggested_date,
						phase,
						assignment.priority_order,
						totalTasksInPhase
					);
				}

				// Add to update list
				tasksToUpdate.push({
					...taskWithDate,
					phase_id: assignment.phase_id,
					user_id: user.id
				});

				// Prepare phase assignment
				phaseAssignmentsToCreate.push({
					phase_id: assignment.phase_id,
					task_id: task.id,
					created_at: now.toISOString()
				});
			}

			// Optimize task scheduling if dates are needed
			let finalTasksToUpdate = tasksToUpdate;
			if (needsDates) {
				const taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
				try {
					finalTasksToUpdate = await taskTimeSlotFinder.scheduleTasks(
						tasksToUpdate,
						user.id
					);
				} catch (error) {
					console.error('Error optimizing task schedule:', error);
					// Fall back to original dates if optimization fails
				}
			}

			// Perform batch database updates
			assignedTasks = await batchUpdateTasksAndCreatePhaseAssignments(
				supabase,
				finalTasksToUpdate,
				phaseAssignmentsToCreate
			);

			// Sync to calendar if requested
			if (assignmentMethod === 'with_calendar' && assignedTasks.length > 0) {
				await syncTasksToCalendar(supabase, user.id, assignedTasks);
			}

			strategy = llmAssignments.overall_strategy;
			warnings = llmAssignments.warnings || [];
		} else {
			// Use manual phase assignments from the frontend
			if (!phaseAssignments || Object.keys(phaseAssignments).length === 0) {
				return ApiResponse.error(
					'Manual assignments are required when auto-assign is disabled',
					400
				);
			}

			// Validate that all tasks have been assigned
			const unassignedTasks = tasks.filter((t) => !phaseAssignments[t.id]);
			if (unassignedTasks.length > 0) {
				return ApiResponse.error(
					`All tasks must be assigned to a phase. Missing assignments for ${unassignedTasks.length} task(s)`,
					400
				);
			}

			// Process manual assignments
			const now = new Date();
			const tasksToUpdate: any[] = [];
			const phaseAssignmentsToCreate: any[] = [];
			const needsDates =
				assignmentMethod === 'with_dates' || assignmentMethod === 'with_calendar';

			// Group tasks by phase for better date distribution
			const tasksByPhase: Record<string, any[]> = {};
			for (const task of tasks) {
				const phaseId = phaseAssignments[task.id];
				if (!phaseId) continue;

				const phase = phasesWithCounts.find((p) => p.id === phaseId);
				if (!phase) {
					return ApiResponse.error(`Invalid phase ID: ${phaseId}`, 400);
				}

				// Check if phase is valid (not in the past)
				if (phase.end_date && new Date(phase.end_date) < now) {
					return ApiResponse.error(
						`Cannot assign tasks to phase "${phase.name}" as it has already ended`,
						400
					);
				}

				if (!tasksByPhase[phaseId]) {
					tasksByPhase[phaseId] = [];
				}
				tasksByPhase[phaseId].push(task);
			}

			// Process each phase's tasks
			for (const [phaseId, phaseTasks] of Object.entries(tasksByPhase)) {
				const phase = phasesWithCounts.find((p) => p.id === phaseId)!;
				const totalTasksInPhase = phaseTasks.length;

				phaseTasks.forEach((task, index) => {
					let taskWithDate = { ...task };

					if (needsDates) {
						// Distribute tasks evenly across the phase timeline
						taskWithDate.start_date = validateAndCorrectTaskDate(
							undefined, // No suggested date for manual assignments
							phase,
							index, // Use index as priority order
							totalTasksInPhase
						);
					}

					// Add to update list
					tasksToUpdate.push({
						...taskWithDate,
						phase_id: phaseId,
						user_id: user.id
					});

					// Prepare phase assignment
					phaseAssignmentsToCreate.push({
						phase_id: phaseId,
						task_id: task.id,
						created_at: now.toISOString()
					});
				});
			}

			// Optimize task scheduling if dates are needed
			let finalTasksToUpdate = tasksToUpdate;
			if (needsDates) {
				const taskTimeSlotFinder = new TaskTimeSlotFinder(supabase);
				try {
					finalTasksToUpdate = await taskTimeSlotFinder.scheduleTasks(
						tasksToUpdate,
						user.id
					);
				} catch (error) {
					console.error('Error optimizing task schedule:', error);
					// Fall back to original dates if optimization fails
				}
			}

			// Perform batch database updates
			assignedTasks = await batchUpdateTasksAndCreatePhaseAssignments(
				supabase,
				finalTasksToUpdate,
				phaseAssignmentsToCreate
			);

			// Sync to calendar if requested
			if (assignmentMethod === 'with_calendar' && assignedTasks.length > 0) {
				await syncTasksToCalendar(supabase, user.id, assignedTasks);
			}

			strategy = 'Manual task assignment to phases';
			warnings = [];
		}

		return ApiResponse.success({
			assignedTasks,
			totalAssigned: assignedTasks.length,
			method: assignmentMethod,
			strategy: strategy,
			warnings: warnings,
			autoAssign: autoAssign
		});
	} catch (error) {
		console.error('Error assigning backlog tasks:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to assign tasks';
		return ApiResponse.error(errorMessage, 500);
	}
};
