// apps/web/src/lib/utils/overdue-task-batches.ts
import type { LaneKey, OverdueProjectBatch, OverdueTask } from '$lib/types/overdue-triage';

export const LANE_ORDER: LaneKey[] = ['assigned_collab', 'assigned_other', 'other'];

const LANE_WEIGHT: Record<LaneKey, number> = {
	assigned_collab: 0,
	assigned_other: 1,
	other: 2
};

export function safeTimeMs(raw: string | null | undefined): number {
	if (!raw) return 0;
	const parsed = Date.parse(raw);
	return Number.isNaN(parsed) ? 0 : parsed;
}

export function toPriorityValue(priority: number | null | undefined): number {
	if (typeof priority !== 'number' || !Number.isFinite(priority)) return Number.MAX_SAFE_INTEGER;
	return priority;
}

export function resolveOverdueLane(task: {
	is_assigned_to_me: boolean;
	project_is_collaborative: boolean;
}): LaneKey {
	if (!task.is_assigned_to_me) return 'other';
	return task.project_is_collaborative ? 'assigned_collab' : 'assigned_other';
}

export function sortGlobalOverdueTasks(tasks: OverdueTask[]): OverdueTask[] {
	return [...tasks].sort((a, b) => {
		const laneDelta = LANE_WEIGHT[a.lane] - LANE_WEIGHT[b.lane];
		if (laneDelta !== 0) return laneDelta;

		const dueDelta = safeTimeMs(a.due_at) - safeTimeMs(b.due_at);
		if (dueDelta !== 0) return dueDelta;

		const priorityDelta = toPriorityValue(a.priority) - toPriorityValue(b.priority);
		if (priorityDelta !== 0) return priorityDelta;

		return safeTimeMs(a.updated_at) - safeTimeMs(b.updated_at);
	});
}

export function sortBatchTasks(tasks: OverdueTask[]): OverdueTask[] {
	return [...tasks].sort((a, b) => {
		if (a.is_assigned_to_me !== b.is_assigned_to_me) {
			return a.is_assigned_to_me ? -1 : 1;
		}

		const dueDelta = safeTimeMs(a.due_at) - safeTimeMs(b.due_at);
		if (dueDelta !== 0) return dueDelta;

		const priorityDelta = toPriorityValue(a.priority) - toPriorityValue(b.priority);
		if (priorityDelta !== 0) return priorityDelta;

		return safeTimeMs(a.updated_at) - safeTimeMs(b.updated_at);
	});
}

function resolveBatchLane(tasks: OverdueTask[]): LaneKey {
	const hasAssigned = tasks.some((task) => task.is_assigned_to_me);
	if (!hasAssigned) return 'other';
	const hasCollaborativeAssigned = tasks.some(
		(task) => task.is_assigned_to_me && task.project_is_collaborative
	);
	return hasCollaborativeAssigned ? 'assigned_collab' : 'assigned_other';
}

function oldestDue(tasks: OverdueTask[]): string | null {
	let oldest: string | null = null;
	let oldestMs = Number.POSITIVE_INFINITY;

	for (const task of tasks) {
		const dueMs = safeTimeMs(task.due_at);
		if (!dueMs) continue;
		if (dueMs < oldestMs) {
			oldestMs = dueMs;
			oldest = task.due_at;
		}
	}

	return oldest;
}

export function buildOverdueProjectBatches(tasks: OverdueTask[]): OverdueProjectBatch[] {
	const byProject = new Map<string, OverdueTask[]>();

	for (const task of tasks) {
		const group = byProject.get(task.project_id);
		if (group) group.push(task);
		else byProject.set(task.project_id, [task]);
	}

	const batches: OverdueProjectBatch[] = [];

	for (const projectTasks of byProject.values()) {
		const firstTask = projectTasks[0];
		if (!firstTask) continue;

		const sortedTasks = sortBatchTasks(projectTasks);
		const assignedTasks = sortedTasks.filter((task) => task.is_assigned_to_me);

		batches.push({
			project_id: firstTask.project_id,
			project_name: firstTask.project_name,
			project_state_key: firstTask.project_state_key,
			project_is_shared: firstTask.project_is_shared,
			project_is_collaborative: firstTask.project_is_collaborative,
			lane: resolveBatchLane(sortedTasks),
			overdue_count: sortedTasks.length,
			assigned_to_me_count: assignedTasks.length,
			oldest_due_at: oldestDue(sortedTasks),
			oldest_assigned_due_at: oldestDue(assignedTasks),
			project_updated_at: firstTask.project_updated_at,
			tasks: sortedTasks
		});
	}

	return sortOverdueProjectBatches(batches);
}

export function sortOverdueProjectBatches(batches: OverdueProjectBatch[]): OverdueProjectBatch[] {
	return [...batches].sort((a, b) => {
		const laneDelta = LANE_WEIGHT[a.lane] - LANE_WEIGHT[b.lane];
		if (laneDelta !== 0) return laneDelta;

		const dueDelta =
			safeTimeMs(a.oldest_assigned_due_at ?? a.oldest_due_at) -
			safeTimeMs(b.oldest_assigned_due_at ?? b.oldest_due_at);
		if (dueDelta !== 0) return dueDelta;

		if (a.overdue_count !== b.overdue_count) {
			return b.overdue_count - a.overdue_count;
		}

		return safeTimeMs(b.project_updated_at) - safeTimeMs(a.project_updated_at);
	});
}

export function laneCountsFromTasks(tasks: OverdueTask[]): Record<LaneKey, number> {
	return {
		assigned_collab: tasks.filter((task) => task.lane === 'assigned_collab').length,
		assigned_other: tasks.filter((task) => task.lane === 'assigned_other').length,
		other: tasks.filter((task) => task.lane === 'other').length
	};
}
