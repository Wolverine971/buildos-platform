// apps/web/src/lib/server/project-task-window.ts
import type { Task } from '$lib/types/onto';
import {
	PROJECT_ACTIVE_TASK_BUCKET_KEYS,
	type ProjectActiveTaskBucketKey,
	type ProjectTaskBucketCoverage,
	type ProjectTasksCoverage
} from '$lib/types/project-full-data';
import { groupProjectTasksByBucket } from '$lib/utils/project-task-board';

export const INITIAL_PROJECT_TASK_LIMIT_PER_BUCKET = 20;

export function buildInitialProjectTaskWindow<T extends Task>(
	tasks: readonly T[],
	options: { limitPerBucket?: number; nowMs?: number } = {}
): { tasks: T[]; coverage: ProjectTasksCoverage } {
	const nowMs = options.nowMs ?? Date.now();
	const limitPerBucket = Math.max(
		1,
		Math.floor(options.limitPerBucket ?? INITIAL_PROJECT_TASK_LIMIT_PER_BUCKET)
	);
	const grouped = groupProjectTasksByBucket(
		tasks.filter((task) => !task.deleted_at),
		nowMs
	);
	const selected: T[] = [];
	const buckets = {} as Record<ProjectActiveTaskBucketKey, ProjectTaskBucketCoverage>;

	for (const bucket of PROJECT_ACTIVE_TASK_BUCKET_KEYS) {
		const bucketTasks = grouped[bucket];
		const returned = Math.min(bucketTasks.length, limitPerBucket);
		selected.push(...bucketTasks.slice(0, limitPerBucket));
		buckets[bucket] = {
			returned,
			total: bucketTasks.length,
			complete: returned === bucketTasks.length
		};
	}

	const total = PROJECT_ACTIVE_TASK_BUCKET_KEYS.reduce(
		(sum, bucket) => sum + buckets[bucket].total,
		0
	);
	return {
		tasks: selected,
		coverage: {
			scope: 'initial-board',
			as_of: new Date(nowMs).toISOString(),
			complete: selected.length === total,
			returned: selected.length,
			total,
			limit_per_bucket: limitPerBucket,
			buckets
		}
	};
}
