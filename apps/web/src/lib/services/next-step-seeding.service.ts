// apps/web/src/lib/services/next-step-seeding.service.ts
/**
 * NextStepSeedingService - Generates and seeds initial next steps for new projects
 *
 * This service is called when:
 * - A project is created via brain dump processing
 * - A project is created via the ontology system
 *
 * It uses goal-first heuristics to generate contextually appropriate next steps based on:
 * - Project name and description
 * - Project template type
 * - Initial tasks created
 * - Brain dump content (if available)
 *
 * @see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createEntityReference } from '$lib/utils/entity-reference-parser';

// =============================================================================
// Types
// =============================================================================

interface ProjectContext {
	id: string;
	name: string;
	description?: string | null;
	context?: string | null;
	templateType?: string | null;
}

interface TaskContext {
	id: string;
	title: string;
	priority?: number | string | null;
	status?: string | null;
	completedAt?: string | null;
	updatedAt?: string | null;
}

interface GoalContext {
	id: string;
	name: string;
	typeKey?: string | null;
	props?: Record<string, unknown> | null;
}

interface EdgeSummary {
	src_id: string;
	src_kind: string;
	dst_id: string;
	dst_kind: string;
	rel: string;
}

interface TaskGoalLink {
	taskId: string;
	goalId: string;
	rel: string;
}

interface SeedNextStepParams {
	projectId: string;
	userId: string;
	projectData?: Partial<ProjectContext>;
	tasks?: TaskContext[];
	brainDumpContent?: string;
	isOntoProject?: boolean; // Whether this is an onto_projects or legacy projects
}

interface GeneratedNextStep {
	short: string;
	long: string;
}

// =============================================================================
// Service Class
// =============================================================================

export class NextStepSeedingService {
	constructor(private supabase: SupabaseClient<Database>) {}

	/**
	 * Seed initial next steps for a newly created project
	 *
	 * This method:
	 * 1. Gathers context about the project
	 * 2. Generates appropriate next steps using goal-first heuristics
	 * 3. Updates the project with the next steps
	 *
	 * @param params - Seeding parameters
	 */
	async seedNextSteps(params: SeedNextStepParams): Promise<void> {
		const {
			projectId,
			userId,
			projectData,
			tasks,
			brainDumpContent,
			isOntoProject = true
		} = params;

		console.log(`🌱 Seeding next steps for project ${projectId}`);

		try {
			// 1. Get or build project context
			let project: ProjectContext;
			if (projectData?.name) {
				project = {
					id: projectId,
					name: projectData.name,
					description: projectData.description,
					context: projectData.context,
					templateType: projectData.templateType
				};
			} else {
				// Fetch project from database
				const fetchedProject = await this.fetchProjectContext(projectId, isOntoProject);
				if (!fetchedProject) {
					console.warn(`⚠️ Project ${projectId} not found, skipping next step seeding`);
					return;
				}
				project = fetchedProject;
			}

			// 2. Get tasks if not provided
			let projectTasks = tasks ?? [];
			if (!projectTasks || projectTasks.length === 0) {
				projectTasks = await this.fetchProjectTasks(projectId, userId, isOntoProject);
			}

			// 3. Get goals and task-goal links (onto projects only)
			const projectGoals = await this.fetchProjectGoals(projectId, isOntoProject);
			const taskGoalLinks = await this.fetchTaskGoalLinks(
				projectId,
				projectTasks,
				isOntoProject
			);

			// 4. Generate next steps
			const nextStep = await this.generateInitialNextStep(
				project,
				projectTasks,
				projectGoals,
				taskGoalLinks,
				brainDumpContent
			);

			// 5. Update project with next steps
			await this.updateProjectNextStep(projectId, nextStep, isOntoProject);

			console.log(`✅ Seeded next steps for project ${projectId}`);
		} catch (error) {
			console.error(`❌ Failed to seed next steps for project ${projectId}:`, error);
			// Don't throw - next step seeding is non-critical
		}
	}

	/**
	 * Fetch project context from database
	 */
	private async fetchProjectContext(
		projectId: string,
		isOntoProject: boolean
	): Promise<ProjectContext | null> {
		if (isOntoProject) {
			const { data, error } = await this.supabase
				.from('onto_projects')
				.select('id, name, description, type_key')
				.eq('id', projectId)
				.single();

			if (error || !data) return null;

			return {
				id: data.id,
				name: data.name,
				description: data.description,
				templateType: data.type_key
			};
		} else {
			// Legacy projects table
			const { data, error } = await this.supabase
				.from('projects')
				.select('id, name, description, context')
				.eq('id', projectId)
				.single();

			if (error || !data) return null;

			return {
				id: data.id,
				name: data.name,
				description: data.description,
				context: data.context
			};
		}
	}

	/**
	 * Fetch tasks associated with the project
	 */
	private async fetchProjectTasks(
		projectId: string,
		userId: string,
		isOntoProject: boolean
	): Promise<TaskContext[]> {
		if (isOntoProject) {
			const { data } = await this.supabase
				.from('onto_tasks')
				.select('id, title, priority, state_key, completed_at, updated_at')
				.eq('project_id', projectId)
				.order('priority', { ascending: false, nullsFirst: false })
				.order('updated_at', { ascending: false })
				.limit(10);

			return (data ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				status: t.state_key,
				completedAt: t.completed_at,
				updatedAt: t.updated_at
			}));
		} else {
			// Legacy tasks table
			const { data } = await this.supabase
				.from('tasks')
				.select('id, title, priority, status, completed_at, updated_at')
				.eq('project_id', projectId)
				.eq('user_id', userId)
				.order('priority', { ascending: false, nullsFirst: false })
				.order('updated_at', { ascending: false })
				.limit(10);

			return (data ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				priority: t.priority,
				status: t.status,
				completedAt: t.completed_at,
				updatedAt: t.updated_at
			}));
		}
	}

	/**
	 * Fetch goals associated with the project (onto projects only)
	 */
	private async fetchProjectGoals(
		projectId: string,
		isOntoProject: boolean
	): Promise<GoalContext[]> {
		if (!isOntoProject) return [];

		const { data } = await this.supabase
			.from('onto_goals')
			.select('id, name, type_key, props')
			.eq('project_id', projectId)
			.limit(10);

		return (data ?? []).map((goal) => ({
			id: goal.id,
			name: goal.name,
			typeKey: goal.type_key,
			props: (goal.props ?? null) as Record<string, unknown> | null
		}));
	}

	/**
	 * Fetch task-goal links for a project's tasks (onto projects only)
	 */
	private async fetchTaskGoalLinks(
		projectId: string,
		tasks: TaskContext[],
		isOntoProject: boolean
	): Promise<TaskGoalLink[]> {
		if (!isOntoProject || tasks.length === 0) return [];

		const taskIds = tasks.map((task) => task.id);
		const rels = ['supports_goal', 'has_task', 'achieved_by'];

		const [srcResult, dstResult] = await Promise.all([
			this.supabase
				.from('onto_edges')
				.select('src_id, src_kind, dst_id, dst_kind, rel')
				.eq('project_id', projectId)
				.in('rel', rels)
				.in('src_id', taskIds),
			this.supabase
				.from('onto_edges')
				.select('src_id, src_kind, dst_id, dst_kind, rel')
				.eq('project_id', projectId)
				.in('rel', rels)
				.in('dst_id', taskIds)
		]);

		if (srcResult.error) {
			console.error('Error fetching task-goal links (src):', srcResult.error);
		}
		if (dstResult.error) {
			console.error('Error fetching task-goal links (dst):', dstResult.error);
		}

		const edges = [
			...((srcResult.data ?? []) as EdgeSummary[]),
			...((dstResult.data ?? []) as EdgeSummary[])
		];

		return this.buildTaskGoalLinks(edges);
	}

	/**
	 * Generate initial next step based on project context
	 */
	private async generateInitialNextStep(
		project: ProjectContext,
		tasks: TaskContext[],
		goals: GoalContext[],
		taskGoalLinks: TaskGoalLink[],
		brainDumpContent?: string
	): Promise<GeneratedNextStep> {
		const tasksById = new Map(tasks.map((task) => [task.id, task]));
		const { taskToGoalIds, goalToTaskIds } = this.buildTaskGoalMaps(taskGoalLinks);
		const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
		const activeGoals = goals.filter((goal) => !this.isCompletedGoal(goal));
		const completedTasks = tasks.filter((task) => this.isCompletedTask(task));
		const pendingTasks = tasks.filter((task) => !this.isCompletedTask(task));
		const recentCompletedTasks = this.sortTasksByRecentCompletion(completedTasks);

		// Generate intelligent next step based on available context
		let shortStep: string;
		let longStep: string;

		const focusGoal =
			this.pickGoalFromRecentTasks(
				recentCompletedTasks,
				taskToGoalIds,
				goalsById,
				activeGoals
			) ??
			this.pickGoalByLinkedTasks(activeGoals, goalToTaskIds, tasksById) ??
			activeGoals[0] ??
			goals[0] ??
			null;

		const goalTasks = focusGoal
			? this.getPendingGoalTasks(focusGoal.id, goalToTaskIds, tasksById)
			: [];

		const nextGoalTask = goalTasks[0] ?? null;
		const nextTask = nextGoalTask ?? this.pickNextTask([], pendingTasks);
		const recentTask = recentCompletedTasks[0];

		if (nextGoalTask && focusGoal) {
			const nextTaskRef = createEntityReference('task', nextGoalTask.id, nextGoalTask.title);
			const goalRef = createEntityReference('goal', focusGoal.id, focusGoal.name);
			const introParts: string[] = [];

			if (recentTask) {
				const recentRef = createEntityReference('task', recentTask.id, recentTask.title);
				introParts.push(`You recently completed ${recentRef}.`);
			}

			introParts.push(`Focus next on ${nextTaskRef} to advance ${goalRef}.`);

			shortStep = `Next, work on "${this.truncate(nextGoalTask.title, 60)}" to advance "${this.truncate(focusGoal.name, 50)}".`;
			longStep = this.buildLongStepWithTasks(
				introParts.join(' '),
				goalTasks.slice(0, 3),
				project
			);
		} else if (focusGoal) {
			const goalRef = createEntityReference('goal', focusGoal.id, focusGoal.name);
			const introParts: string[] = [];

			if (recentTask) {
				const recentRef = createEntityReference('task', recentTask.id, recentTask.title);
				introParts.push(`You recently completed ${recentRef}.`);
			}

			introParts.push(`Review ${goalRef} and define the next task that moves it forward.`);
			introParts.push('Outline 2-3 small tasks that directly support this goal.');

			if (nextTask) {
				const nextTaskRef = createEntityReference('task', nextTask.id, nextTask.title);
				introParts.push(`If you want to start immediately, begin with ${nextTaskRef}.`);
			}

			shortStep = `Define the next task for "${this.truncate(focusGoal.name, 50)}".`;
			longStep = introParts.join(' ');
		} else if (nextTask) {
			const nextTaskRef = createEntityReference('task', nextTask.id, nextTask.title);
			const introParts: string[] = [];

			if (recentTask) {
				const recentRef = createEntityReference('task', recentTask.id, recentTask.title);
				introParts.push(`You recently completed ${recentRef}.`);
			}

			introParts.push(`Focus next on ${nextTaskRef}.`);

			shortStep = `Begin with "${this.truncate(nextTask.title, 60)}" to build momentum.`;
			longStep = this.buildLongStepWithTasks(
				introParts.join(' '),
				this.sortTasksByPriority(pendingTasks).slice(0, 3),
				project
			);
		} else if (project.description || project.context || brainDumpContent) {
			// No tasks yet, focus on planning
			shortStep = `Review the project scope and create your first tasks.`;
			const detailSource = brainDumpContent ? ' and your brain dump notes' : '';
			longStep = `This project is ready to be planned out. Review the description${detailSource}, then break it down into actionable tasks. Consider what the first deliverable should be and work backwards from there.`;
		} else {
			// Minimal context
			shortStep = `Define the first milestone for "${this.truncate(project.name, 50)}".`;
			longStep = `Start by clarifying what success looks like for this project. Define the first milestone or deliverable, then break it down into tasks you can complete this week.`;
		}

		// Ensure within limits
		return {
			short: this.truncate(shortStep, 100),
			long: this.truncate(longStep, 650)
		};
	}

	/**
	 * Build the long next step with task references
	 */
	private buildLongStepWithTasks(
		intro: string,
		tasks: TaskContext[],
		project: ProjectContext
	): string {
		const parts: string[] = [intro];

		if (tasks.length > 0) {
			parts.push('Focus on these tasks:');
			tasks.forEach((task) => {
				const taskRef = createEntityReference('task', task.id, task.title);
				parts.push(`• ${taskRef}`);
			});
		}

		if (project.templateType) {
			parts.push(
				`This ${project.templateType.replace(/_/g, ' ')} project will benefit from a structured approach.`
			);
		}

		return parts.join(' ');
	}

	private buildTaskGoalLinks(edges: EdgeSummary[]): TaskGoalLink[] {
		const links: TaskGoalLink[] = [];
		const seen = new Set<string>();

		for (const edge of edges) {
			const mapping = this.extractTaskGoalLink(edge);
			if (!mapping) continue;
			const key = `${mapping.taskId}:${mapping.goalId}`;
			if (seen.has(key)) continue;
			seen.add(key);
			links.push({ taskId: mapping.taskId, goalId: mapping.goalId, rel: edge.rel });
		}

		return links;
	}

	private extractTaskGoalLink(edge: EdgeSummary): { taskId: string; goalId: string } | null {
		if (edge.rel === 'supports_goal') {
			if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
				return { taskId: edge.src_id, goalId: edge.dst_id };
			}
			if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
				return { taskId: edge.dst_id, goalId: edge.src_id };
			}
		}

		if (edge.rel === 'has_task') {
			if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
				return { taskId: edge.dst_id, goalId: edge.src_id };
			}
			if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
				return { taskId: edge.src_id, goalId: edge.dst_id };
			}
		}

		if (edge.rel === 'achieved_by') {
			if (edge.src_kind === 'goal' && edge.dst_kind === 'task') {
				return { taskId: edge.dst_id, goalId: edge.src_id };
			}
			if (edge.src_kind === 'task' && edge.dst_kind === 'goal') {
				return { taskId: edge.src_id, goalId: edge.dst_id };
			}
		}

		return null;
	}

	private buildTaskGoalMaps(taskGoalLinks: TaskGoalLink[]): {
		taskToGoalIds: Map<string, string[]>;
		goalToTaskIds: Map<string, string[]>;
	} {
		const taskToGoalIds = new Map<string, string[]>();
		const goalToTaskIds = new Map<string, string[]>();

		for (const link of taskGoalLinks) {
			this.appendToMap(taskToGoalIds, link.taskId, link.goalId);
			this.appendToMap(goalToTaskIds, link.goalId, link.taskId);
		}

		return { taskToGoalIds, goalToTaskIds };
	}

	private appendToMap(map: Map<string, string[]>, key: string, value: string): void {
		const existing = map.get(key);
		if (!existing) {
			map.set(key, [value]);
			return;
		}
		if (!existing.includes(value)) {
			existing.push(value);
		}
	}

	private isCompletedTask(task: TaskContext): boolean {
		if (task.completedAt) return true;
		return this.isCompletedStatus(task.status);
	}

	private isCompletedGoal(goal: GoalContext): boolean {
		const state = this.getGoalStateValue(goal);
		return this.isCompletedStatus(state);
	}

	private getGoalStateValue(goal: GoalContext): string | null {
		if (!goal.props) return null;
		const state = (goal.props.state as string) || (goal.props.status as string);
		return typeof state === 'string' && state.trim() ? state : null;
	}

	private isCompletedStatus(status?: string | null): boolean {
		if (!status) return false;
		const normalized = status.toLowerCase();
		const completedStates = new Set([
			'done',
			'completed',
			'complete',
			'shipped',
			'published',
			'approved',
			'closed',
			'archived'
		]);
		return completedStates.has(normalized);
	}

	private getPriorityRank(priority?: number | string | null): number {
		if (priority === null || priority === undefined) return 0;
		if (typeof priority === 'number') return priority;
		const normalized = priority.toLowerCase();
		const priorityMap: Record<string, number> = {
			urgent: 5,
			critical: 5,
			p0: 5,
			high: 4,
			p1: 4,
			medium: 3,
			p2: 3,
			low: 2,
			p3: 2,
			p4: 1
		};
		return priorityMap[normalized] ?? 0;
	}

	private sortTasksByPriority(tasks: TaskContext[]): TaskContext[] {
		return [...tasks].sort(
			(a, b) => this.getPriorityRank(b.priority) - this.getPriorityRank(a.priority)
		);
	}

	private sortTasksByRecentCompletion(tasks: TaskContext[]): TaskContext[] {
		return [...tasks].sort((a, b) => this.getTaskTimestamp(b) - this.getTaskTimestamp(a));
	}

	private getTaskTimestamp(task: TaskContext): number {
		const value = task.completedAt ?? task.updatedAt;
		if (!value) return 0;
		const time = new Date(value).getTime();
		return Number.isNaN(time) ? 0 : time;
	}

	private pickGoalFromRecentTasks(
		recentTasks: TaskContext[],
		taskToGoalIds: Map<string, string[]>,
		goalsById: Map<string, GoalContext>,
		activeGoals: GoalContext[]
	): GoalContext | null {
		const activeGoalIds = new Set(activeGoals.map((goal) => goal.id));

		for (const task of recentTasks) {
			const goalIds = taskToGoalIds.get(task.id) ?? [];
			for (const goalId of goalIds) {
				const goal = goalsById.get(goalId);
				if (goal && activeGoalIds.has(goal.id)) {
					return goal;
				}
			}
		}

		return null;
	}

	private pickGoalByLinkedTasks(
		goals: GoalContext[],
		goalToTaskIds: Map<string, string[]>,
		tasksById: Map<string, TaskContext>
	): GoalContext | null {
		if (goals.length === 0) return null;

		let bestGoal: GoalContext | null = null;
		let bestCount = -1;

		for (const goal of goals) {
			const taskIds = goalToTaskIds.get(goal.id) ?? [];
			const pendingCount = taskIds
				.map((taskId) => tasksById.get(taskId))
				.filter((task): task is TaskContext => Boolean(task))
				.filter((task) => !this.isCompletedTask(task)).length;

			if (pendingCount > bestCount) {
				bestGoal = goal;
				bestCount = pendingCount;
			}
		}

		return bestGoal ?? goals[0] ?? null;
	}

	private getPendingGoalTasks(
		goalId: string,
		goalToTaskIds: Map<string, string[]>,
		tasksById: Map<string, TaskContext>
	): TaskContext[] {
		const taskIds = goalToTaskIds.get(goalId) ?? [];
		const tasks = taskIds
			.map((taskId) => tasksById.get(taskId))
			.filter((task): task is TaskContext => Boolean(task))
			.filter((task) => !this.isCompletedTask(task));

		return this.sortTasksByPriority(tasks);
	}

	private pickNextTask(
		goalTasks: TaskContext[],
		pendingTasks: TaskContext[]
	): TaskContext | null {
		if (goalTasks.length > 0) {
			return this.sortTasksByPriority(goalTasks)[0] ?? null;
		}

		const sortedPending = this.sortTasksByPriority(pendingTasks);
		return sortedPending[0] ?? null;
	}

	/**
	 * Update project with generated next steps
	 */
	private async updateProjectNextStep(
		projectId: string,
		nextStep: GeneratedNextStep,
		isOntoProject: boolean
	): Promise<void> {
		if (isOntoProject) {
			const { error } = await this.supabase
				.from('onto_projects')
				.update({
					next_step_short: nextStep.short,
					next_step_long: nextStep.long,
					next_step_updated_at: new Date().toISOString(),
					next_step_source: 'ai',
					updated_at: new Date().toISOString()
				})
				.eq('id', projectId);

			if (error) {
				throw new Error(`Failed to update onto_projects: ${error.message}`);
			}
		} else {
			// For legacy projects, we can't update since the columns don't exist
			// Instead, we could create an onto_project record or log this
			console.log(
				`⚠️ Legacy project ${projectId} - next steps not persisted (columns not available)`
			);

			// Optionally: Check if there's a corresponding onto_project and update that
			const { data: ontoProject } = await this.supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.single();

			if (ontoProject) {
				await this.updateProjectNextStep(projectId, nextStep, true);
			}
		}
	}

	/**
	 * Truncate string to max length
	 */
	private truncate(str: string, maxLength: number): string {
		if (!str) return '';
		if (str.length <= maxLength) return str;
		return str.slice(0, maxLength - 3) + '...';
	}
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new NextStepSeedingService instance
 */
export function createNextStepSeedingService(
	supabase: SupabaseClient<Database>
): NextStepSeedingService {
	return new NextStepSeedingService(supabase);
}

// =============================================================================
// Standalone Function for Easy Integration
// =============================================================================

/**
 * Seed next steps for a project (standalone function for easy integration)
 *
 * @example
 * // In operations-executor.ts after project creation:
 * await seedProjectNextSteps(supabase, {
 *   projectId: result.id,
 *   userId,
 *   projectData: { name: data.name, description: data.description },
 *   isOntoProject: false
 * });
 */
export async function seedProjectNextSteps(
	supabase: SupabaseClient<Database>,
	params: SeedNextStepParams
): Promise<void> {
	const service = new NextStepSeedingService(supabase);
	await service.seedNextSteps(params);
}
