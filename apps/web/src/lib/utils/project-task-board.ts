// apps/web/src/lib/utils/project-task-board.ts
import type { Task } from '$lib/types/onto';
import {
	PROJECT_ACTIVE_TASK_BUCKET_KEYS,
	type ProjectActiveTaskBucketKey,
	type ProjectTaskBoardBucketKey,
	type ProjectTaskBucketCoverage,
	type ProjectTasksCoverage
} from '$lib/types/project-full-data';

type BucketableTask = Pick<
	Task,
	| 'id'
	| 'state_key'
	| 'deleted_at'
	| 'due_at'
	| 'start_at'
	| 'completed_at'
	| 'priority'
	| 'updated_at'
>;

function timestamp(value: string | null | undefined): number | null {
	if (!value) return null;
	const parsed = new Date(value).getTime();
	return Number.isFinite(parsed) ? parsed : null;
}

export function getProjectTaskAsOfMs(
	asOf: string | null | undefined,
	fallbackMs = Date.now()
): number {
	return timestamp(asOf) ?? fallbackMs;
}

function compareNullableTimestamp(
	valueA: string | null | undefined,
	valueB: string | null | undefined,
	direction: 'ascending' | 'descending'
): number {
	const timestampA = timestamp(valueA);
	const timestampB = timestamp(valueB);
	if (timestampA !== null && timestampB !== null && timestampA !== timestampB) {
		return direction === 'descending' ? timestampB - timestampA : timestampA - timestampB;
	}
	if (timestampA === null && timestampB !== null) return 1;
	if (timestampA !== null && timestampB === null) return -1;
	return 0;
}

export function getProjectTaskBoardBucket(
	task: BucketableTask,
	nowMs = Date.now()
): ProjectTaskBoardBucketKey {
	if (task.deleted_at) return 'archived';
	if (task.state_key === 'done') return 'done';

	const dueMs = timestamp(task.due_at);
	if (dueMs !== null && dueMs < nowMs) return 'overdue';

	if (task.state_key === 'todo') {
		const startMs = timestamp(task.start_at);
		return (dueMs !== null && dueMs >= nowMs) || (startMs !== null && startMs >= nowMs)
			? 'scheduled'
			: 'backlog';
	}
	if (task.state_key === 'in_progress') return 'in_progress';
	if (task.state_key === 'blocked') return 'blocked';
	return 'backlog';
}

export function compareProjectTasksForBucket(
	bucket: ProjectTaskBoardBucketKey,
	a: BucketableTask,
	b: BucketableTask
): number {
	if (bucket === 'archived') {
		const archivedDifference = compareNullableTimestamp(
			a.deleted_at,
			b.deleted_at,
			'descending'
		);
		if (archivedDifference !== 0) return archivedDifference;
		return a.id.localeCompare(b.id);
	}

	const priorityA = typeof a.priority === 'number' ? a.priority : 5;
	const priorityB = typeof b.priority === 'number' ? b.priority : 5;
	if (priorityA !== priorityB) return priorityA - priorityB;

	if (bucket === 'done') {
		const completedDifference = compareNullableTimestamp(
			a.completed_at,
			b.completed_at,
			'descending'
		);
		if (completedDifference !== 0) return completedDifference;
	} else {
		const dueDifference = compareNullableTimestamp(a.due_at, b.due_at, 'ascending');
		if (dueDifference !== 0) return dueDifference;
		const startDifference = compareNullableTimestamp(a.start_at, b.start_at, 'ascending');
		if (startDifference !== 0) return startDifference;
	}

	const updatedDifference = (timestamp(b.updated_at) ?? 0) - (timestamp(a.updated_at) ?? 0);
	if (updatedDifference !== 0) return updatedDifference;
	return a.id.localeCompare(b.id);
}

export function selectProjectPulseTasks<T extends BucketableTask>(
	tasks: readonly T[],
	limit = 6,
	nowMs = Date.now()
): T[] {
	return tasks
		.filter((task) => {
			if (task.deleted_at || task.state_key === 'done') return false;
			return timestamp(task.due_at ?? task.start_at) !== null;
		})
		.slice()
		.sort((a, b) => {
			const dateA = timestamp(a.due_at ?? a.start_at) ?? Number.POSITIVE_INFINITY;
			const dateB = timestamp(b.due_at ?? b.start_at) ?? Number.POSITIVE_INFINITY;
			const overdueA = dateA < nowMs;
			const overdueB = dateB < nowMs;
			if (overdueA !== overdueB) return overdueA ? -1 : 1;
			if (dateA !== dateB) return dateA - dateB;
			return a.id.localeCompare(b.id);
		})
		.slice(0, Math.max(0, Math.floor(limit)));
}

export function groupProjectTasksByBucket<T extends BucketableTask>(
	tasks: readonly T[],
	nowMs = Date.now()
): Record<ProjectTaskBoardBucketKey, T[]> {
	const buckets: Record<ProjectTaskBoardBucketKey, T[]> = {
		backlog: [],
		in_progress: [],
		scheduled: [],
		overdue: [],
		blocked: [],
		done: [],
		archived: []
	};

	for (const task of tasks) {
		buckets[getProjectTaskBoardBucket(task, nowMs)].push(task);
	}
	for (const bucket of Object.keys(buckets) as ProjectTaskBoardBucketKey[]) {
		buckets[bucket].sort((a, b) => compareProjectTasksForBucket(bucket, a, b));
	}
	return buckets;
}

export function createCompleteProjectTasksCoverage(
	tasks: readonly BucketableTask[],
	nowMs = Date.now()
): ProjectTasksCoverage {
	const grouped = groupProjectTasksByBucket(
		tasks.filter((task) => !task.deleted_at),
		nowMs
	);
	const buckets = {} as Record<ProjectActiveTaskBucketKey, ProjectTaskBucketCoverage>;
	for (const bucket of PROJECT_ACTIVE_TASK_BUCKET_KEYS) {
		const total = grouped[bucket].length;
		buckets[bucket] = { returned: total, total, complete: true };
	}
	const total = PROJECT_ACTIVE_TASK_BUCKET_KEYS.reduce(
		(sum, bucket) => sum + buckets[bucket].total,
		0
	);
	return {
		scope: 'all',
		as_of: new Date(nowMs).toISOString(),
		complete: true,
		returned: total,
		total,
		buckets
	};
}
