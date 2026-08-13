// apps/web/src/lib/server/project-goal-connection-summary.ts
import type { Database } from '@buildos/shared-types';
import type {
	GoalConnectionSummary,
	GoalConnectedMilestoneSummary,
	GoalConnectedPlanSummary,
	GoalConnectedTaskSummary,
	GoalMilestoneConnectionCounts,
	GoalPlanConnectionCounts,
	GoalTaskConnectionCounts,
	ProjectGoalConnectionOverview
} from '$lib/types/goal-connection-summary';

export type GoalConnectionGoalRow = Pick<
	Database['public']['Tables']['onto_goals']['Row'],
	'id' | 'created_at' | 'updated_at'
>;
export type GoalConnectionTaskRow = Pick<
	Database['public']['Tables']['onto_tasks']['Row'],
	'id' | 'title' | 'state_key' | 'due_at' | 'props' | 'created_at' | 'updated_at'
>;
export type GoalConnectionPlanRow = Pick<
	Database['public']['Tables']['onto_plans']['Row'],
	'id' | 'name' | 'state_key' | 'props' | 'created_at' | 'updated_at'
>;
export type GoalConnectionMilestoneRow = Pick<
	Database['public']['Tables']['onto_milestones']['Row'],
	'id' | 'title' | 'state_key' | 'due_at' | 'props' | 'created_at' | 'updated_at'
>;
export type GoalConnectionEdgeRow = Pick<
	Database['public']['Tables']['onto_edges']['Row'],
	'src_kind' | 'src_id' | 'rel' | 'dst_kind' | 'dst_id' | 'created_at'
>;

type ConnectedKind = 'task' | 'plan' | 'milestone';
type TimestampedEntity = { id: string; created_at: string; updated_at: string | null };

const RELATIONSHIPS: Record<ConnectedKind, ReadonlySet<string>> = {
	task: new Set(['has_task', 'supports_goal', 'achieved_by']),
	plan: new Set(['supports_goal', 'supports', 'has_plan', 'achieved_by']),
	milestone: new Set(['has_milestone', 'has'])
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function explicitGoalId(props: unknown): string | null {
	if (!isRecord(props)) return null;
	return typeof props.goal_id === 'string' && props.goal_id.length > 0 ? props.goal_id : null;
}

function latestTimestamp(...timestamps: Array<string | null | undefined>): string {
	let latest: string | null = null;
	let latestMs = Number.NEGATIVE_INFINITY;
	for (const timestamp of timestamps) {
		if (!timestamp) continue;
		const timestampMs = Date.parse(timestamp);
		if (!Number.isNaN(timestampMs) && timestampMs > latestMs) {
			latest = timestamp;
			latestMs = timestampMs;
		}
	}
	return latest ?? timestamps.find((timestamp): timestamp is string => Boolean(timestamp)) ?? '';
}

function emptyTaskCounts(): GoalTaskConnectionCounts & { items: GoalConnectedTaskSummary[] } {
	return { total: 0, todo: 0, in_progress: 0, blocked: 0, done: 0, items: [] };
}

function emptyPlanCounts(): GoalPlanConnectionCounts & { items: GoalConnectedPlanSummary[] } {
	return { total: 0, draft: 0, active: 0, completed: 0, items: [] };
}

function emptyMilestoneCounts(): GoalMilestoneConnectionCounts & {
	items: GoalConnectedMilestoneSummary[];
} {
	return {
		total: 0,
		pending: 0,
		in_progress: 0,
		completed: 0,
		missed: 0,
		overdue: 0,
		next_due_at: null,
		items: []
	};
}

const TASK_STATE_ORDER: Record<GoalConnectedTaskSummary['state_key'], number> = {
	blocked: 0,
	in_progress: 1,
	todo: 2,
	done: 3
};

const PLAN_STATE_ORDER: Record<GoalConnectedPlanSummary['state_key'], number> = {
	active: 0,
	draft: 1,
	completed: 2
};

const MILESTONE_STATE_ORDER: Record<GoalConnectedMilestoneSummary['state_key'], number> = {
	in_progress: 0,
	pending: 1,
	missed: 2,
	completed: 3
};

function compareOptionalDates(a: string | null, b: string | null): number {
	if (a && b) return Date.parse(a) - Date.parse(b);
	if (a) return -1;
	if (b) return 1;
	return 0;
}

function addExplicitPropertyConnections<T extends { id: string; props: unknown }>(
	entities: T[],
	goalIds: ReadonlySet<string>,
	connections: Map<string, Set<string>>
): void {
	for (const entity of entities) {
		const goalId = explicitGoalId(entity.props);
		if (!goalId || !goalIds.has(goalId)) continue;
		connections.get(goalId)?.add(entity.id);
	}
}

function addEdgeConnections(options: {
	edges: GoalConnectionEdgeRow[];
	goalIds: ReadonlySet<string>;
	entityIds: ReadonlySet<string>;
	entityKind: ConnectedKind;
	connections: Map<string, Set<string>>;
	edgeActivityByGoal: Map<string, string[]>;
}): void {
	const { edges, goalIds, entityIds, entityKind, connections, edgeActivityByGoal } = options;
	const allowedRelationships = RELATIONSHIPS[entityKind];

	for (const edge of edges) {
		if (!allowedRelationships.has(edge.rel)) continue;

		let goalId: string | null = null;
		let entityId: string | null = null;
		if (edge.src_kind === 'goal' && edge.dst_kind === entityKind) {
			goalId = edge.src_id;
			entityId = edge.dst_id;
		} else if (edge.dst_kind === 'goal' && edge.src_kind === entityKind) {
			goalId = edge.dst_id;
			entityId = edge.src_id;
		}

		if (!goalId || !entityId || !goalIds.has(goalId) || !entityIds.has(entityId)) continue;
		connections.get(goalId)?.add(entityId);
		edgeActivityByGoal.get(goalId)?.push(edge.created_at);
	}
}

function latestEntityActivity(entity: TimestampedEntity): string {
	return latestTimestamp(entity.updated_at, entity.created_at);
}

export function buildProjectGoalConnectionOverview(options: {
	projectId: string;
	goals: GoalConnectionGoalRow[];
	tasks: GoalConnectionTaskRow[];
	plans: GoalConnectionPlanRow[];
	milestones: GoalConnectionMilestoneRow[];
	edges: GoalConnectionEdgeRow[];
	now?: Date;
}): ProjectGoalConnectionOverview {
	const { projectId, goals, tasks, plans, milestones, edges, now = new Date() } = options;
	const goalIds = new Set(goals.map((goal) => goal.id));
	const taskById = new Map(tasks.map((task) => [task.id, task]));
	const planById = new Map(plans.map((plan) => [plan.id, plan]));
	const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
	const taskConnections = new Map(goals.map((goal) => [goal.id, new Set<string>()]));
	const planConnections = new Map(goals.map((goal) => [goal.id, new Set<string>()]));
	const milestoneConnections = new Map(goals.map((goal) => [goal.id, new Set<string>()]));
	const edgeActivityByGoal = new Map(goals.map((goal) => [goal.id, [] as string[]]));

	addExplicitPropertyConnections(tasks, goalIds, taskConnections);
	addExplicitPropertyConnections(plans, goalIds, planConnections);
	addExplicitPropertyConnections(milestones, goalIds, milestoneConnections);

	addEdgeConnections({
		edges,
		goalIds,
		entityIds: new Set(taskById.keys()),
		entityKind: 'task',
		connections: taskConnections,
		edgeActivityByGoal
	});
	addEdgeConnections({
		edges,
		goalIds,
		entityIds: new Set(planById.keys()),
		entityKind: 'plan',
		connections: planConnections,
		edgeActivityByGoal
	});
	addEdgeConnections({
		edges,
		goalIds,
		entityIds: new Set(milestoneById.keys()),
		entityKind: 'milestone',
		connections: milestoneConnections,
		edgeActivityByGoal
	});

	const connectedTaskIds = new Set<string>();
	const summaries: GoalConnectionSummary[] = goals.map((goal) => {
		const taskCounts = emptyTaskCounts();
		const planCounts = emptyPlanCounts();
		const milestoneCounts = emptyMilestoneCounts();
		const activityTimestamps = [
			goal.updated_at,
			goal.created_at,
			...(edgeActivityByGoal.get(goal.id) ?? [])
		];

		for (const taskId of taskConnections.get(goal.id) ?? []) {
			const task = taskById.get(taskId);
			if (!task) continue;
			connectedTaskIds.add(task.id);
			taskCounts.total += 1;
			taskCounts[task.state_key] += 1;
			taskCounts.items.push({
				id: task.id,
				title: task.title,
				state_key: task.state_key,
				due_at: task.due_at,
				updated_at: task.updated_at
			});
			activityTimestamps.push(latestEntityActivity(task));
		}

		for (const planId of planConnections.get(goal.id) ?? []) {
			const plan = planById.get(planId);
			if (!plan) continue;
			planCounts.total += 1;
			planCounts[plan.state_key] += 1;
			planCounts.items.push({
				id: plan.id,
				name: plan.name,
				state_key: plan.state_key,
				updated_at: plan.updated_at
			});
			activityTimestamps.push(latestEntityActivity(plan));
		}

		const incompleteDueDates: string[] = [];
		for (const milestoneId of milestoneConnections.get(goal.id) ?? []) {
			const milestone = milestoneById.get(milestoneId);
			if (!milestone) continue;
			milestoneCounts.total += 1;
			milestoneCounts[milestone.state_key] += 1;
			milestoneCounts.items.push({
				id: milestone.id,
				title: milestone.title,
				state_key: milestone.state_key,
				due_at: milestone.due_at,
				updated_at: milestone.updated_at
			});
			activityTimestamps.push(latestEntityActivity(milestone));
			if (
				milestone.due_at &&
				milestone.state_key !== 'completed' &&
				milestone.state_key !== 'missed'
			) {
				incompleteDueDates.push(milestone.due_at);
				if (Date.parse(milestone.due_at) < now.getTime()) milestoneCounts.overdue += 1;
			}
		}
		milestoneCounts.next_due_at =
			incompleteDueDates.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

		taskCounts.items.sort((a, b) => {
			const stateDifference = TASK_STATE_ORDER[a.state_key] - TASK_STATE_ORDER[b.state_key];
			if (stateDifference !== 0) return stateDifference;
			const dueDifference = compareOptionalDates(a.due_at, b.due_at);
			return dueDifference !== 0 ? dueDifference : a.title.localeCompare(b.title);
		});
		planCounts.items.sort((a, b) => {
			const stateDifference = PLAN_STATE_ORDER[a.state_key] - PLAN_STATE_ORDER[b.state_key];
			return stateDifference !== 0 ? stateDifference : a.name.localeCompare(b.name);
		});
		milestoneCounts.items.sort((a, b) => {
			const stateDifference =
				MILESTONE_STATE_ORDER[a.state_key] - MILESTONE_STATE_ORDER[b.state_key];
			if (stateDifference !== 0) return stateDifference;
			const dueDifference = compareOptionalDates(a.due_at, b.due_at);
			return dueDifference !== 0 ? dueDifference : a.title.localeCompare(b.title);
		});

		return {
			goal_id: goal.id,
			created_at: goal.created_at,
			updated_at: goal.updated_at,
			last_activity_at: latestTimestamp(...activityTimestamps),
			tasks: taskCounts,
			plans: planCounts,
			milestones: milestoneCounts,
			tracking:
				milestoneCounts.total > 0
					? {
							source: 'milestones',
							completed: milestoneCounts.completed,
							total: milestoneCounts.total,
							percent: Math.round(
								(milestoneCounts.completed / milestoneCounts.total) * 100
							)
						}
					: { source: 'none', completed: 0, total: 0, percent: null }
		};
	});

	return {
		project_id: projectId,
		goals: summaries,
		tasks: {
			total: tasks.length,
			connected: connectedTaskIds.size,
			project_level: Math.max(0, tasks.length - connectedTaskIds.size)
		}
	};
}
