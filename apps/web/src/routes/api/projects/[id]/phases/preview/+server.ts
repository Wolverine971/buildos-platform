// src/routes/api/projects/[id]/phases/preview/+server.ts

import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';

interface TaskPreview {
	id: string;
	title: string | null;
	status: Database['public']['Enums']['task_status'] | null;
	start_date: string | null;
}

interface TaskConflict {
	id: string;
	title: string | null;
	status: Database['public']['Enums']['task_status'] | null;
	start_date: string | null;
	conflict_type: 'past_incomplete' | 'outside_timeline';
}

interface RescheduledTask {
	id: string;
	title: string | null;
	current_date: string | null;
	suggested_date: string | null;
}

interface RecurringTaskInfo {
	id: string;
	title: string | null;
	recurrence_pattern: Database['public']['Enums']['recurrence_pattern'] | null;
	recurrence_ends: string | null;
	recurrence_end_source: Database['public']['Enums']['recurrence_end_reason'] | null;
}

interface PreviewResponse {
	task_counts: {
		total: number;
		by_status: Record<string, number>;
	};
	conflicts: {
		past_incomplete_tasks: TaskConflict[];
		outside_timeline_tasks: TaskConflict[];
	};
	rescheduled_tasks: RescheduledTask[];
	task_breakdown: Record<string, TaskPreview[]>;
	estimated_phases: number;
	project_duration_days: number | null;
	scheduling_method: string;
	recurring_task_info?: {
		count: number;
		tasks: RecurringTaskInfo[];
		included: boolean;
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
			return ApiResponse.unauthorized();
		}

		const { id } = params;
		const body = await parseRequestBody(request);
		if (!body) {
			return ApiResponse.badRequest('Invalid request body');
		}
		const {
			selected_statuses,
			project_start_date,
			project_end_date,
			scheduling_method = 'schedule_in_phases',
			include_recurring_tasks = false,
			allow_recurring_reschedule = false
		} = body;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('*')
			.eq('id', id)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Validate requirements based on scheduling method
		if (!project_start_date) {
			return ApiResponse.badRequest('Project start date is required');
		}

		if (scheduling_method !== 'phases_only' && !project_end_date) {
			return ApiResponse.badRequest('Project end date is required for task scheduling');
		}

		// Build task query based on include_recurring_tasks parameter
		const taskQuery = supabase
			.from('tasks')
			.select(
				'id, title, status, start_date, task_type, deleted_at, priority, recurrence_pattern, recurrence_ends, recurrence_end_source'
			)
			.eq('project_id', id)
			.is('deleted_at', null);

		// Only exclude recurring tasks if not including them
		if (!include_recurring_tasks) {
			taskQuery.neq('task_type', 'recurring');
		}

		// Get recurring tasks separately for counting/info
		const recurringTaskQuery = supabase
			.from('tasks')
			.select(
				'id, title, recurrence_pattern, recurrence_ends, recurrence_end_source, task_type'
			)
			.eq('project_id', id)
			.eq('task_type', 'recurring')
			.is('deleted_at', null);

		// Get all tasks and existing phase assignments
		const [allTasksResult, existingPhasesResult, recurringTasksResult] = await Promise.all([
			taskQuery,

			// Get existing phase assignments to know which tasks are already in phases
			supabase
				.from('phase_tasks')
				.select(
					`
					task_id,
					phase_id,
					phases!inner(
						id,
						project_id
					)
				`
				)
				.eq('phases.project_id', id),

			recurringTaskQuery
		]);

		if (allTasksResult.error) {
			return ApiResponse.databaseError(allTasksResult.error);
		}

		const allTasks = allTasksResult.data || [];
		const existingPhaseAssignments = existingPhasesResult.data || [];

		// Create a set of task IDs that are currently in phases
		const tasksInPhasesSet = new Set(existingPhaseAssignments.map((pa) => pa.task_id));

		// Check if this is a regeneration (phases already exist)
		const isRegeneration = existingPhaseAssignments.length > 0;

		// Filter tasks based on regeneration logic
		let filteredTasks = [];

		if (isRegeneration) {
			// Include ALL tasks currently in phases (regardless of status)
			const tasksInPhases = allTasks.filter((t) => tasksInPhasesSet.has(t.id));

			// Include tasks matching selected statuses that are NOT in phases (backlog)
			const backlogTasksMatchingStatus = allTasks.filter(
				(t) => !tasksInPhasesSet.has(t.id) && selected_statuses.includes(t.status)
			);

			filteredTasks = [...tasksInPhases, ...backlogTasksMatchingStatus];
		} else {
			// First time generation - use selected statuses
			filteredTasks = allTasks.filter((task) => selected_statuses.includes(task.status));
		}

		// Analyze conflicts and scheduling based on method
		const analysis = analyzeTaskScheduling(
			filteredTasks,
			project_start_date,
			project_end_date,
			scheduling_method
		);

		// Calculate task breakdown by status
		const taskBreakdown: Record<string, TaskPreview[]> = {};
		for (const status of selected_statuses) {
			taskBreakdown[status] = filteredTasks.filter((t) => t.status === status);
		}

		// Calculate task counts
		const taskCounts = {
			total: filteredTasks.length,
			by_status: selected_statuses.reduce(
				(acc, status) => {
					acc[status] = filteredTasks.filter((t) => t.status === status).length;
					return acc;
				},
				{} as Record<string, number>
			)
		};

		// Estimate number of phases based on project duration and task count
		const estimatedPhases = estimatePhaseCount(
			project_start_date,
			project_end_date,
			filteredTasks.length,
			scheduling_method
		);

		// Calculate project duration
		const projectDurationDays = calculateProjectDuration(project_start_date, project_end_date);

		// Add recurring task information
		const recurringTasks = recurringTasksResult.data || [];

		const response: PreviewResponse = {
			task_counts: taskCounts,
			conflicts: analysis.conflicts,
			rescheduled_tasks: analysis.rescheduled_tasks,
			task_breakdown: taskBreakdown,
			estimated_phases: estimatedPhases,
			project_duration_days: projectDurationDays,
			scheduling_method,
			recurring_task_info: {
				count: recurringTasks.length,
				tasks: recurringTasks.map((t) => ({
					id: t.id,
					title: t.title,
					recurrence_pattern: t.recurrence_pattern,
					recurrence_ends: t.recurrence_ends,
					recurrence_end_source: t.recurrence_end_source
				})),
				included: include_recurring_tasks
			}
		};

		return ApiResponse.success(response);
	} catch (error) {
		return ApiResponse.internalError(error, 'Error generating preview');
	}
};

/**
 * Analyze task scheduling conflicts and rescheduling needs based on scheduling method
 */
function analyzeTaskScheduling(
	tasks: any[],
	projectStartDate: string | null,
	projectEndDate: string | null,
	schedulingMethod: string
) {
	const now = new Date();
	// Set to start of today to avoid time zone issues
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const projectStart = projectStartDate ? new Date(projectStartDate) : null;
	const projectEnd = projectEndDate ? new Date(projectEndDate) : null;

	const conflicts = {
		past_incomplete_tasks: [] as TaskConflict[],
		outside_timeline_tasks: [] as TaskConflict[]
	};

	const rescheduled_tasks: RescheduledTask[] = [];

	// For phases_only method, we still check conflicts but won't reschedule
	const willReschedule = schedulingMethod !== 'phases_only';

	for (const task of tasks) {
		if (!task.start_date) continue;

		const taskDate = new Date(task.start_date);
		if (isNaN(taskDate.getTime())) continue;

		let hasConflict = false;
		let conflictType: 'past_incomplete' | 'outside_timeline' | null = null;

		// Check if task is in the past (before today)
		if (taskDate < today) {
			conflicts.past_incomplete_tasks.push({
				id: task.id,
				title: task.title,
				status: task.status,
				start_date: task.start_date,
				conflict_type: 'past_incomplete'
			});
			hasConflict = true;
			conflictType = 'past_incomplete';
		}
		// Check if task is outside project timeline (but not in the past, as that's handled above)
		else if (projectStart && taskDate < projectStart) {
			conflicts.outside_timeline_tasks.push({
				id: task.id,
				title: task.title,
				status: task.status,
				start_date: task.start_date,
				conflict_type: 'outside_timeline'
			});
			hasConflict = true;
			conflictType = 'outside_timeline';
		} else if (projectEnd && taskDate > projectEnd) {
			conflicts.outside_timeline_tasks.push({
				id: task.id,
				title: task.title,
				status: task.status,
				start_date: task.start_date,
				conflict_type: 'outside_timeline'
			});
			hasConflict = true;
			conflictType = 'outside_timeline';
		}

		// If task has conflict and we will reschedule, calculate suggested date
		if (hasConflict && willReschedule) {
			const suggestedDate = calculateSuggestedDate(
				task,
				projectStart,
				projectEnd,
				conflictType,
				today,
				schedulingMethod
			);

			if (suggestedDate) {
				rescheduled_tasks.push({
					id: task.id,
					title: task.title,
					current_date: task.start_date,
					suggested_date: suggestedDate
				});
			}
		}
	}

	return {
		conflicts,
		rescheduled_tasks
	};
}

/**
 * Calculate suggested date for rescheduled tasks based on scheduling method
 */
function calculateSuggestedDate(
	task: any,
	projectStart: Date | null,
	projectEnd: Date | null,
	conflictType: 'past_incomplete' | 'outside_timeline' | null,
	today: Date,
	schedulingMethod: string
): string | null {
	// For phases_only, don't suggest dates
	if (schedulingMethod === 'phases_only') {
		return null;
	}

	// Always ensure the suggested date is not before today
	let suggestedDate = new Date(today);

	// For past tasks, suggest starting today or project start, whichever is later
	if (conflictType === 'past_incomplete') {
		if (projectStart && projectStart > today) {
			suggestedDate = projectStart;
		}
		// Otherwise use today (already set above)
	}
	// For outside timeline tasks
	else if (conflictType === 'outside_timeline') {
		if (projectStart) {
			// Use the later of project start or today
			suggestedDate = projectStart > today ? projectStart : today;
		}
		// If no project start, use today (already set above)
	}
	// Default fallback - use today or project start, whichever is later
	else {
		if (projectStart && projectStart > today) {
			suggestedDate = projectStart;
		}
		// Otherwise use today (already set above)
	}

	// Final validation: never suggest a date in the past
	if (suggestedDate < today) {
		suggestedDate = today;
	}

	// Also ensure we don't exceed project end date (if we have one)
	if (projectEnd && suggestedDate > projectEnd) {
		// For calendar_optimized, we might be more flexible with this
		if (schedulingMethod === 'calendar_optimized') {
			// Allow scheduling beyond project end for calendar optimization
			// The calendar process can handle this conflict
		} else {
			// For schedule_in_phases, respect project boundaries
			suggestedDate = projectEnd;
		}
	}

	return suggestedDate.toISOString().split('T')[0];
}

/**
 * Estimate number of phases based on project characteristics and scheduling method
 */
function estimatePhaseCount(
	projectStartDate: string | null,
	projectEndDate: string | null,
	taskCount: number,
	schedulingMethod: string
): number {
	// Base estimation on task count
	let phases = Math.ceil(taskCount / 8); // Roughly 8 tasks per phase

	// Adjust based on scheduling method
	if (schedulingMethod === 'phases_only') {
		// For phases only, we can be more flexible with task distribution
		phases = Math.ceil(taskCount / 10); // Slightly more tasks per phase
	} else if (schedulingMethod === 'calendar_optimized') {
		// For calendar optimization, we might want more phases for better scheduling flexibility
		phases = Math.ceil(taskCount / 6); // Fewer tasks per phase for better calendar fit
	}

	// Adjust based on project duration if we have dates
	if (projectStartDate && projectEndDate) {
		const duration = calculateProjectDuration(projectStartDate, projectEndDate);
		if (duration) {
			// Suggest more phases for longer projects
			if (duration > 90)
				phases = Math.max(phases, 6); // 3+ months
			else if (duration > 60)
				phases = Math.max(phases, 5); // 2+ months
			else if (duration > 30)
				phases = Math.max(phases, 4); // 1+ month
			else if (duration > 14)
				phases = Math.max(phases, 3); // 2+ weeks
			else phases = Math.max(phases, 2); // Minimum 2 phases
		}
	}

	// Constrain to reasonable bounds based on method
	const minPhases = schedulingMethod === 'phases_only' ? 2 : 2;
	const maxPhases = schedulingMethod === 'calendar_optimized' ? 10 : 8;

	return Math.min(Math.max(phases, minPhases), maxPhases);
}

/**
 * Calculate project duration in days
 */
function calculateProjectDuration(startDate: string | null, endDate: string | null): number | null {
	if (!startDate || !endDate) return null;

	const start = new Date(startDate);
	const end = new Date(endDate);

	if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;

	const diffTime = end.getTime() - start.getTime();
	return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
