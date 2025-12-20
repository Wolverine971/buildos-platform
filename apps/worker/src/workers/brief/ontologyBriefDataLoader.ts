// apps/worker/src/workers/brief/ontologyBriefDataLoader.ts
/**
 * Ontology Brief Data Loader
 * Fetches data from ontology tables using graph loader pattern for daily brief generation.
 *
 * Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { formatInTimeZone, zonedTimeToUtc } from 'date-fns-tz';
import { addDays, subHours, parseISO, differenceInDays } from 'date-fns';
import type {
	OntoProject,
	OntoTask,
	OntoGoal,
	OntoPlan,
	OntoMilestone,
	OntoRisk,
	OntoDocument,
	OntoOutput,
	OntoRequirement,
	OntoDecision,
	OntoEdge,
	OntoActor,
	OntoProjectWithRelations,
	CategorizedTasks,
	GoalProgress,
	OutputStatus,
	MilestoneStatus,
	UnblockingTask,
	RecentUpdates,
	PlanProgress,
	OntologyBriefData,
	ProjectBriefData,
	OntologyBriefMetadata
} from './ontologyBriefTypes.js';

// ============================================================================
// TIMEZONE UTILITIES
// ============================================================================

/**
 * Calculate a date string N days from a given date, respecting the user's timezone.
 * Uses noon to avoid DST edge cases where midnight might not exist or be ambiguous.
 *
 * @param dateStr - The starting date as yyyy-MM-dd in user's local timezone
 * @param days - Number of days to add (can be negative)
 * @param timezone - The user's timezone (e.g., 'America/Los_Angeles')
 * @returns The resulting date as yyyy-MM-dd in user's local timezone
 */
function addDaysToLocalDate(dateStr: string, days: number, timezone: string): string {
	// Convert the user's local date at noon to a UTC Date object
	// Using noon avoids DST edge cases where midnight might not exist
	const localDateAtNoon = zonedTimeToUtc(`${dateStr} 12:00:00`, timezone);
	// Add the specified number of days
	const resultDate = addDays(localDateAtNoon, days);
	// Format back to yyyy-MM-dd in user's timezone
	return formatInTimeZone(resultDate, timezone, 'yyyy-MM-dd');
}

/**
 * Get "now" as a yyyy-MM-dd string in the user's timezone.
 *
 * @param timezone - The user's timezone
 * @returns Today's date as yyyy-MM-dd in user's timezone
 */
function getTodayInTimezone(timezone: string): string {
	return formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
}

// ============================================================================
// TASK CATEGORIZATION UTILITIES
// ============================================================================

/**
 * Categorize tasks by time, status, and work mode
 */
export function categorizeTasks(
	tasks: OntoTask[],
	briefDate: string,
	timezone: string
): CategorizedTasks {
	const now = new Date();
	const cutoff = subHours(now, 24);
	const todayStr = briefDate; // yyyy-MM-dd (user-local date)
	// Calculate week end date (7 days from today) in user's timezone
	const weekEndStr = addDaysToLocalDate(todayStr, 7, timezone);

	// Time-based categorization
	const todaysTasks: OntoTask[] = [];
	const overdueTasks: OntoTask[] = [];
	const upcomingTasks: OntoTask[] = [];
	const recentlyCompleted: OntoTask[] = [];

	// Status-based
	const blockedTasks: OntoTask[] = [];
	const inProgressTasks: OntoTask[] = [];

	// Work mode categories
	const executeTasks: OntoTask[] = [];
	const createTasks: OntoTask[] = [];
	const refineTasks: OntoTask[] = [];
	const researchTasks: OntoTask[] = [];
	const reviewTasks: OntoTask[] = [];
	const coordinateTasks: OntoTask[] = [];
	const adminTasks: OntoTask[] = [];
	const planTasks: OntoTask[] = [];

	// Relationship-based (populated later via edges)
	const unblockingTasks: OntoTask[] = [];
	const goalAlignedTasks: OntoTask[] = [];
	const recentlyUpdated: OntoTask[] = [];

	const taskSort = (a: OntoTask, b: OntoTask): number => {
		const priorityA = a.priority ?? Number.POSITIVE_INFINITY;
		const priorityB = b.priority ?? Number.POSITIVE_INFINITY;
		if (priorityA !== priorityB) return priorityA - priorityB;

		const dueA = a.due_at ? parseISO(a.due_at).getTime() : Number.POSITIVE_INFINITY;
		const dueB = b.due_at ? parseISO(b.due_at).getTime() : Number.POSITIVE_INFINITY;
		if (dueA !== dueB) return dueA - dueB;

		return a.title.localeCompare(b.title);
	};

	for (const task of tasks) {
		const dueAt = task.due_at ? parseISO(task.due_at) : null;
		const dueDateStr = dueAt ? formatInTimeZone(dueAt, timezone, 'yyyy-MM-dd') : null;
		const updatedAt = parseISO(task.updated_at);
		const state = task.state_key;

		// Recently updated (last 24 hours, absolute time)
		if (updatedAt >= cutoff) {
			recentlyUpdated.push(task);
		}

		// Time-based
		if (state === 'done') {
			if (updatedAt >= cutoff) {
				recentlyCompleted.push(task);
			}
		} else if (dueDateStr) {
			if (dueDateStr < todayStr) {
				overdueTasks.push(task);
			} else if (dueDateStr === todayStr) {
				todaysTasks.push(task);
			} else if (dueDateStr > todayStr && dueDateStr <= weekEndStr) {
				upcomingTasks.push(task);
			}
		}

		// Status-based
		if (state === 'blocked') {
			blockedTasks.push(task);
		} else if (state === 'in_progress') {
			inProgressTasks.push(task);
		}

		if (state === 'done') {
			continue;
		}

		// Work mode categorization (based on type_key)
		const typeKey = task.type_key || '';
		if (typeKey.startsWith('task.execute') || typeKey.includes('action')) {
			executeTasks.push(task);
		} else if (typeKey.startsWith('task.create') || typeKey.includes('produce')) {
			createTasks.push(task);
		} else if (
			typeKey.startsWith('task.refine') ||
			typeKey.includes('edit') ||
			typeKey.includes('improve')
		) {
			refineTasks.push(task);
		} else if (
			typeKey.startsWith('task.research') ||
			typeKey.includes('learn') ||
			typeKey.includes('discover')
		) {
			researchTasks.push(task);
		} else if (
			typeKey.startsWith('task.review') ||
			typeKey.includes('feedback') ||
			typeKey.includes('assess')
		) {
			reviewTasks.push(task);
		} else if (
			typeKey.startsWith('task.coordinate') ||
			typeKey.includes('discuss') ||
			typeKey.includes('meeting')
		) {
			coordinateTasks.push(task);
		} else if (
			typeKey.startsWith('task.admin') ||
			typeKey.includes('setup') ||
			typeKey.includes('config')
		) {
			adminTasks.push(task);
		} else if (
			typeKey.startsWith('task.plan') ||
			typeKey.includes('strategy') ||
			typeKey.includes('define')
		) {
			planTasks.push(task);
		}
	}

	return {
		todaysTasks: todaysTasks.sort(taskSort),
		overdueTasks: overdueTasks.sort(taskSort),
		upcomingTasks: upcomingTasks.sort(taskSort),
		recentlyCompleted: recentlyCompleted.sort(taskSort),
		blockedTasks: blockedTasks.sort(taskSort),
		inProgressTasks: inProgressTasks.sort(taskSort),
		executeTasks: executeTasks.sort(taskSort),
		createTasks: createTasks.sort(taskSort),
		refineTasks: refineTasks.sort(taskSort),
		researchTasks: researchTasks.sort(taskSort),
		reviewTasks: reviewTasks.sort(taskSort),
		coordinateTasks: coordinateTasks.sort(taskSort),
		adminTasks: adminTasks.sort(taskSort),
		planTasks: planTasks.sort(taskSort),
		unblockingTasks, // Will be populated later
		goalAlignedTasks, // Will be populated later
		recentlyUpdated: recentlyUpdated.sort(taskSort)
	};
}

/**
 * Get work mode from task type_key
 */
export function getWorkMode(typeKey: string | null): string | null {
	if (!typeKey) return null;
	const key = typeKey.toLowerCase();
	if (key.startsWith('task.execute') || key.includes('action')) return 'execute';
	if (key.startsWith('task.create') || key.includes('produce')) return 'create';
	if (key.startsWith('task.refine') || key.includes('edit') || key.includes('improve'))
		return 'refine';
	if (key.startsWith('task.research') || key.includes('learn') || key.includes('discover'))
		return 'research';
	if (key.startsWith('task.review') || key.includes('feedback') || key.includes('assess'))
		return 'review';
	if (key.startsWith('task.coordinate') || key.includes('discuss') || key.includes('meeting'))
		return 'coordinate';
	if (key.startsWith('task.admin') || key.includes('setup') || key.includes('config'))
		return 'admin';
	if (key.startsWith('task.plan') || key.includes('strategy') || key.includes('define'))
		return 'plan';
	return null;
}

// ============================================================================
// GOAL PROGRESS UTILITIES
// ============================================================================

/**
 * Calculate goal progress from supporting tasks via edges
 */
export function calculateGoalProgress(
	goal: OntoGoal,
	edges: OntoEdge[],
	allTasks: OntoTask[]
): GoalProgress {
	// Find tasks that support this goal (task -[supports_goal]-> goal)
	const supportingEdges = edges.filter(
		(e) => e.dst_id === goal.id && e.rel === 'supports_goal' && e.src_kind === 'task'
	);

	const contributingTaskIds = new Set(supportingEdges.map((e) => e.src_id));
	const contributingTasks = allTasks.filter((t) => contributingTaskIds.has(t.id));

	const totalTasks = contributingTasks.length;
	const completedTasks = contributingTasks.filter((t) => t.state_key === 'done').length;
	const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	// Determine status based on progress
	let status: 'on_track' | 'at_risk' | 'behind';
	if (progressPercent >= 70) {
		status = 'on_track';
	} else if (progressPercent >= 40) {
		status = 'at_risk';
	} else {
		status = 'behind';
	}

	return {
		goal,
		totalTasks,
		completedTasks,
		progressPercent,
		status,
		contributingTasks
	};
}

/**
 * Calculate output status from relationships
 */
export function getOutputStatus(output: OntoOutput, edges: OntoEdge[]): OutputStatus {
	// Find linked goals
	const linkedGoalEdges = edges.filter(
		(e) =>
			(e.src_id === output.id || e.dst_id === output.id) &&
			(e.src_kind === 'goal' || e.dst_kind === 'goal')
	);
	const linkedGoals = linkedGoalEdges.map((e) => (e.src_kind === 'goal' ? e.src_id : e.dst_id));

	// Find linked tasks
	const linkedTaskEdges = edges.filter(
		(e) =>
			(e.src_id === output.id || e.dst_id === output.id) &&
			(e.src_kind === 'task' || e.dst_kind === 'task')
	);
	const linkedTasks = linkedTaskEdges.map((e) => (e.src_kind === 'task' ? e.src_id : e.dst_id));

	return {
		output,
		state: output.state_key,
		linkedGoals,
		linkedTasks,
		updated_at: output.updated_at
	};
}

/**
 * Get milestone status with risk assessment.
 *
 * Note: This function calculates days away using calendar dates in the user's timezone,
 * not absolute time differences. A milestone due "tomorrow" in the user's timezone
 * will show as 1 day away regardless of the exact hour.
 *
 * @param milestone - The milestone to check
 * @param project - The parent project
 * @param todayStr - Today's date as yyyy-MM-dd in user's timezone
 * @param timezone - The user's timezone
 */
export function getMilestoneStatus(
	milestone: OntoMilestone,
	project: OntoProject,
	todayStr: string,
	timezone: string
): MilestoneStatus {
	// Format the milestone due date in user's timezone
	const dueDateStr = formatInTimeZone(parseISO(milestone.due_at), timezone, 'yyyy-MM-dd');

	// Calculate days away using date strings to avoid timezone confusion
	// This gives calendar day difference, not 24-hour periods
	const today = parseISO(`${todayStr}T12:00:00`);
	const dueDay = parseISO(`${dueDateStr}T12:00:00`);
	const daysAway = differenceInDays(dueDay, today);

	const isAtRisk = daysAway <= 7 && milestone.state_key !== 'completed';

	return {
		milestone,
		daysAway,
		isAtRisk,
		projectName: project.name
	};
}

/**
 * Calculate plan progress from tasks
 */
export function calculatePlanProgress(
	plan: OntoPlan,
	edges: OntoEdge[],
	allTasks: OntoTask[]
): PlanProgress {
	// Find tasks belonging to this plan (plan -[has_task]-> task)
	const planTaskEdges = edges.filter(
		(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
	);

	const planTaskIds = new Set(planTaskEdges.map((e) => e.dst_id));
	const planTasks = allTasks.filter((t) => planTaskIds.has(t.id));

	const totalTasks = planTasks.length;
	const completedTasks = planTasks.filter((t) => t.state_key === 'done').length;
	const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

	return {
		plan,
		totalTasks,
		completedTasks,
		progressPercent
	};
}

/**
 * Find unblocking tasks (tasks that, when completed, unblock others)
 */
export function findUnblockingTasks(tasks: OntoTask[], edges: OntoEdge[]): UnblockingTask[] {
	const unblockingTasks: UnblockingTask[] = [];
	const taskMap = new Map(tasks.map((t) => [t.id, t]));

	// Find all dependency edges (task -[depends_on]-> task)
	const dependencyEdges = edges.filter(
		(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
	);

	// Group by target (the task being depended on)
	const blockedByMap = new Map<string, string[]>();
	for (const edge of dependencyEdges) {
		const blockerTaskId = edge.dst_id;
		const blockedTaskId = edge.src_id;
		if (!blockedByMap.has(blockerTaskId)) {
			blockedByMap.set(blockerTaskId, []);
		}
		blockedByMap.get(blockerTaskId)!.push(blockedTaskId);
	}

	// Find incomplete tasks that block other tasks
	for (const [blockerTaskId, blockedTaskIds] of blockedByMap.entries()) {
		const blockerTask = taskMap.get(blockerTaskId);
		if (blockerTask && blockerTask.state_key !== 'done') {
			const blockedTasks = blockedTaskIds
				.map((id) => taskMap.get(id))
				.filter((t): t is OntoTask => t !== undefined);

			if (blockedTasks.length > 0) {
				unblockingTasks.push({
					task: blockerTask,
					blockedTasks
				});
			}
		}
	}

	// Sort by number of blocked tasks (most impact first)
	return unblockingTasks.sort((a, b) => b.blockedTasks.length - a.blockedTasks.length);
}

// ============================================================================
// RECENT UPDATES
// ============================================================================

/**
 * Get recent updates across all entity types
 */
export function getRecentUpdates(
	data: OntoProjectWithRelations,
	hoursAgo: number = 24
): RecentUpdates {
	const cutoff = subHours(new Date(), hoursAgo);
	const recentTasks = data.tasks.filter((t) => parseISO(t.updated_at) >= cutoff);
	const recentTaskIds = new Set(recentTasks.map((t) => t.id));

	return {
		tasks: recentTasks,
		// Goals do not have updated_at; treat as "recent activity" if created recently OR any supporting task was updated recently.
		goals: data.goals.filter((g) => {
			if (parseISO(g.created_at) >= cutoff) return true;
			return data.edges.some(
				(e) =>
					e.rel === 'supports_goal' &&
					e.src_kind === 'task' &&
					e.dst_kind === 'goal' &&
					e.dst_id === g.id &&
					recentTaskIds.has(e.src_id)
			);
		}),
		outputs: data.outputs.filter((o) => parseISO(o.updated_at) >= cutoff),
		documents: data.documents.filter((d) => parseISO(d.updated_at) >= cutoff)
	};
}

// ============================================================================
// MAIN DATA LOADER CLASS
// ============================================================================

export class OntologyBriefDataLoader {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Load all ontology data for a user for brief generation
	 */
	async loadUserOntologyData(
		userId: string,
		actorId: string,
		briefDate: Date,
		timezone: string
	): Promise<OntoProjectWithRelations[]> {
		console.log('[OntologyBriefDataLoader] Loading data for user:', userId, 'actor:', actorId);

		// Fetch all active projects for the actor
		const { data: projects, error: projectsError } = await this.supabase
			.from('onto_projects')
			.select('*')
			.eq('created_by', actorId)
			.in('state_key', ['planning', 'active'])
			.order('updated_at', { ascending: false });

		if (projectsError) {
			console.error('[OntologyBriefDataLoader] Error loading projects:', projectsError);
			throw new Error(`Failed to load projects: ${projectsError.message}`);
		}

		if (!projects || projects.length === 0) {
			console.log('[OntologyBriefDataLoader] No active projects found');
			return [];
		}

		const projectIds = projects.map((p) => p.id);

		// Load all entities in parallel with timing
		const queryStartTime = Date.now();
		const [
			tasksResult,
			goalsResult,
			plansResult,
			milestonesResult,
			risksResult,
			documentsResult,
			outputsResult,
			requirementsResult,
			decisionsResult,
			edgesResult
		] = await Promise.all([
			this.supabase
				.from('onto_tasks')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_goals')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_plans')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_milestones')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_risks')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_documents')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_outputs')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_requirements')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase
				.from('onto_decisions')
				.select('*')
				.in('project_id', projectIds)
				.is('deleted_at', null),
			this.supabase.from('onto_edges').select('*').in('project_id', projectIds)
		]);
		const queryDuration = Date.now() - queryStartTime;
		console.log(
			`[OntologyBriefDataLoader] Loaded ontology data in ${queryDuration}ms for ${projectIds.length} projects`
		);

		// Check for errors
		const errors = [
			{ name: 'tasks', error: tasksResult.error },
			{ name: 'goals', error: goalsResult.error },
			{ name: 'plans', error: plansResult.error },
			{ name: 'milestones', error: milestonesResult.error },
			{ name: 'risks', error: risksResult.error },
			{ name: 'documents', error: documentsResult.error },
			{ name: 'outputs', error: outputsResult.error },
			{ name: 'requirements', error: requirementsResult.error },
			{ name: 'decisions', error: decisionsResult.error },
			{ name: 'edges', error: edgesResult.error }
		].filter((e) => e.error);

		if (errors.length > 0) {
			console.error('[OntologyBriefDataLoader] Errors loading entities:', errors);
		}

		const tasks = tasksResult.data || [];
		const goals = goalsResult.data || [];
		const plans = plansResult.data || [];
		const milestones = milestonesResult.data || [];
		const risks = risksResult.data || [];
		const documents = documentsResult.data || [];
		const outputs = outputsResult.data || [];
		const requirements = requirementsResult.data || [];
		const decisions = decisionsResult.data || [];
		const edges = edgesResult.data || [];

		console.log('[OntologyBriefDataLoader] Loaded entities:', {
			projects: projects.length,
			tasks: tasks.length,
			goals: goals.length,
			plans: plans.length,
			milestones: milestones.length,
			risks: risks.length,
			documents: documents.length,
			outputs: outputs.length,
			requirements: requirements.length,
			decisions: decisions.length,
			edges: edges.length
		});

		// Build project-specific data structures
		return projects.map((project) => {
			const projectTasks = tasks.filter((t) => t.project_id === project.id);
			const projectGoals = goals.filter((g) => g.project_id === project.id);
			const projectPlans = plans.filter((p) => p.project_id === project.id);
			const projectMilestones = milestones.filter((m) => m.project_id === project.id);
			const projectRisks = risks.filter((r) => r.project_id === project.id);
			const projectDocuments = documents.filter((d) => d.project_id === project.id);
			const projectOutputs = outputs.filter((o) => o.project_id === project.id);
			const projectRequirements = requirements.filter((r) => r.project_id === project.id);
			const projectDecisions = decisions.filter((d) => d.project_id === project.id);
			const projectEdges = edges.filter((e) => e.project_id === project.id);

			// Build computed relationships
			const tasksByPlan = this.buildTasksByPlan(projectPlans, projectEdges, projectTasks);
			const taskDependencies = this.buildTaskDependencies(projectEdges);
			const goalProgress = this.buildGoalProgressMap(
				projectGoals,
				projectEdges,
				projectTasks
			);
			const recentUpdates = getRecentUpdates({
				project,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				outputs: projectOutputs,
				requirements: projectRequirements,
				decisions: projectDecisions,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates: { tasks: [], goals: [], outputs: [], documents: [] }
			});

			return {
				project,
				tasks: projectTasks,
				goals: projectGoals,
				plans: projectPlans,
				milestones: projectMilestones,
				risks: projectRisks,
				documents: projectDocuments,
				outputs: projectOutputs,
				requirements: projectRequirements,
				decisions: projectDecisions,
				edges: projectEdges,
				tasksByPlan,
				taskDependencies,
				goalProgress,
				recentUpdates
			};
		});
	}

	/**
	 * Get actor ID for a user
	 */
	async getActorIdForUser(userId: string): Promise<string | null> {
		const { data: actor, error } = await this.supabase
			.from('onto_actors')
			.select('id')
			.eq('user_id', userId)
			.eq('kind', 'human')
			.single();

		if (error || !actor) {
			console.warn('[OntologyBriefDataLoader] No actor found for user:', userId);
			return null;
		}

		return actor.id;
	}

	/**
	 * Build tasks by plan map
	 */
	private buildTasksByPlan(
		plans: OntoPlan[],
		edges: OntoEdge[],
		tasks: OntoTask[]
	): Map<string, OntoTask[]> {
		const taskMap = new Map(tasks.map((t) => [t.id, t]));
		const tasksByPlan = new Map<string, OntoTask[]>();

		for (const plan of plans) {
			const planTaskEdges = edges.filter(
				(e) => e.src_id === plan.id && e.rel === 'has_task' && e.dst_kind === 'task'
			);
			const planTasks = planTaskEdges
				.map((e) => taskMap.get(e.dst_id))
				.filter((t): t is OntoTask => t !== undefined);
			tasksByPlan.set(plan.id, planTasks);
		}

		return tasksByPlan;
	}

	/**
	 * Build task dependencies map
	 */
	private buildTaskDependencies(edges: OntoEdge[]): Map<string, string[]> {
		const dependencies = new Map<string, string[]>();

		const dependencyEdges = edges.filter(
			(e) => e.rel === 'depends_on' && e.src_kind === 'task' && e.dst_kind === 'task'
		);

		for (const edge of dependencyEdges) {
			if (!dependencies.has(edge.src_id)) {
				dependencies.set(edge.src_id, []);
			}
			dependencies.get(edge.src_id)!.push(edge.dst_id);
		}

		return dependencies;
	}

	/**
	 * Build goal progress map
	 */
	private buildGoalProgressMap(
		goals: OntoGoal[],
		edges: OntoEdge[],
		tasks: OntoTask[]
	): Map<string, GoalProgress> {
		const progressMap = new Map<string, GoalProgress>();

		for (const goal of goals) {
			progressMap.set(goal.id, calculateGoalProgress(goal, edges, tasks));
		}

		return progressMap;
	}

	/**
	 * Prepare brief data for LLM analysis
	 */
	prepareBriefData(
		projectsData: OntoProjectWithRelations[],
		briefDate: string,
		timezone: string
	): OntologyBriefData {
		// Aggregate data across all projects
		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allGoals = projectsData.flatMap((p) => p.goals);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allRequirements = projectsData.flatMap((p) => p.requirements);
		const allDecisions = projectsData.flatMap((p) => p.decisions);
		const allEdges = projectsData.flatMap((p) => p.edges);

		// Categorize all tasks
		const categorizedTasks = categorizeTasks(allTasks, briefDate, timezone);

		// Calculate goal progress
		const goals = allGoals.map((goal) => calculateGoalProgress(goal, allEdges, allTasks));

		// Get output statuses
		const allOutputs = projectsData.flatMap((p) => p.outputs);
		const outputs = allOutputs.map((output) => getOutputStatus(output, allEdges));

		// Get active risks (not mitigated or closed)
		const activeRisks = allRisks.filter(
			(r) => r.state_key !== 'mitigated' && r.state_key !== 'closed'
		);

		// Count high priority tasks (P1/P2) that are due today or overdue
		const highPriorityCount = [
			...categorizedTasks.overdueTasks,
			...categorizedTasks.todaysTasks
		].filter((t) => t.priority !== null && t.priority <= 2 && t.state_key !== 'done').length;

		// Aggregate recent updates
		const allRecentUpdates: RecentUpdates = {
			tasks: projectsData.flatMap((p) => p.recentUpdates.tasks),
			goals: projectsData.flatMap((p) => p.recentUpdates.goals),
			outputs: projectsData.flatMap((p) => p.recentUpdates.outputs),
			documents: projectsData.flatMap((p) => p.recentUpdates.documents)
		};

		// Tasks by work mode
		const tasksByWorkMode: Record<string, OntoTask[]> = {
			execute: categorizedTasks.executeTasks,
			create: categorizedTasks.createTasks,
			refine: categorizedTasks.refineTasks,
			research: categorizedTasks.researchTasks,
			review: categorizedTasks.reviewTasks,
			coordinate: categorizedTasks.coordinateTasks,
			admin: categorizedTasks.adminTasks,
			plan: categorizedTasks.planTasks
		};

		// Build project brief data
		const projects: ProjectBriefData[] = projectsData.map((data) => {
			const projectCategorized = categorizeTasks(data.tasks, briefDate, timezone);
			const projectGoals = data.goals.map((g) =>
				calculateGoalProgress(g, data.edges, data.tasks)
			);
			const projectOutputs = data.outputs.map((o) => getOutputStatus(o, data.edges));
			const unblockingTasks = findUnblockingTasks(data.tasks, data.edges);

			// Get active plan
			const activePlan = data.plans.find((p) => p.state_key === 'active') || null;

			// Get next steps from project
			const nextSteps: string[] = [];
			if (data.project.next_step_short) {
				nextSteps.push(data.project.next_step_short);
			}
			if (data.project.next_step_long) {
				nextSteps.push(data.project.next_step_long);
			}

			// Get next milestone
			const nextMilestone = data.milestones
				.filter((m) => m.state_key !== 'completed' && m.state_key !== 'missed')
				.sort((a, b) => parseISO(a.due_at).getTime() - parseISO(b.due_at).getTime())[0];

			return {
				project: data.project,
				goals: projectGoals,
				outputs: projectOutputs,
				requirements: data.requirements,
				decisions: data.decisions,
				nextSteps,
				nextMilestone: nextMilestone?.title || null,
				activePlan,
				todaysTasks: projectCategorized.todaysTasks,
				thisWeekTasks: [
					...projectCategorized.todaysTasks,
					...projectCategorized.upcomingTasks
				],
				blockedTasks: projectCategorized.blockedTasks,
				unblockingTasks: unblockingTasks.map((u) => u.task)
			};
		});

		return {
			briefDate,
			timezone,
			goals,
			outputs,
			risks: activeRisks,
			requirements: allRequirements,
			decisions: allDecisions,
			todaysTasks: categorizedTasks.todaysTasks,
			blockedTasks: categorizedTasks.blockedTasks,
			overdueTasks: categorizedTasks.overdueTasks,
			highPriorityCount,
			recentUpdates: allRecentUpdates,
			tasksByWorkMode,
			projects
		};
	}

	/**
	 * Calculate brief metadata
	 */
	calculateMetadata(
		projectsData: OntoProjectWithRelations[],
		briefData: OntologyBriefData,
		briefDate: string,
		timezone: string
	): OntologyBriefMetadata {
		// Calculate week end date (7 days from today) in user's timezone
		const weekEndStr = addDaysToLocalDate(briefDate, 7, timezone);

		const allTasks = projectsData.flatMap((p) => p.tasks);
		const allGoals = projectsData.flatMap((p) => p.goals);
		const allMilestones = projectsData.flatMap((p) => p.milestones);
		const allRisks = projectsData.flatMap((p) => p.risks);
		const allOutputs = projectsData.flatMap((p) => p.outputs);
		const allEdges = projectsData.flatMap((p) => p.edges);

		// Count milestones this week
		const milestonesThisWeek = allMilestones.filter((m) => {
			if (m.state_key === 'completed' || m.state_key === 'missed') return false;
			const dueDateStr = formatInTimeZone(parseISO(m.due_at), timezone, 'yyyy-MM-dd');
			return dueDateStr >= briefDate && dueDateStr <= weekEndStr;
		}).length;

		// Count outputs in review
		const outputsInReview = allOutputs.filter((o) => o.state_key === 'review').length;

		// Count goals at risk
		const goalsAtRisk = briefData.goals.filter(
			(g) => g.status === 'at_risk' || g.status === 'behind'
		).length;

		// Count dependency chains (simplified)
		const dependencyChains = projectsData.reduce(
			(count, p) => count + p.taskDependencies.size,
			0
		);

		// Count recent updates
		const recentUpdatesCount =
			briefData.recentUpdates.tasks.length +
			briefData.recentUpdates.goals.length +
			briefData.recentUpdates.outputs.length +
			briefData.recentUpdates.documents.length;

		return {
			totalProjects: projectsData.length,
			totalTasks: allTasks.length,
			totalGoals: allGoals.length,
			totalMilestones: allMilestones.length,
			activeRisksCount: briefData.risks.length,
			totalOutputs: allOutputs.length,
			recentUpdatesCount,
			blockedCount: briefData.blockedTasks.length,
			overdueCount: briefData.overdueTasks.length,
			goalsAtRisk,
			milestonesThisWeek,
			outputsInReview,
			totalEdges: allEdges.length,
			dependencyChains,
			generatedVia: 'ontology_v1',
			timezone
		};
	}
}
