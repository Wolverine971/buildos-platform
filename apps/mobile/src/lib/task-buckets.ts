// apps/mobile/src/lib/task-buckets.ts
import type { ProjectTask, ProjectTaskBucket } from '@buildos/api-client';

/**
 * The project page's task groups, using the same rule as the server's project read
 * (supabase/migrations/20260715020000_project_full_v2_window_tasks.sql), so the phone's counts
 * match the website's board. Order on the phone: what needs attention first.
 */
export const BUCKET_ORDER: ProjectTaskBucket[] = [
	'overdue',
	'in_progress',
	'scheduled',
	'backlog',
	'blocked',
	'done'
];

export const BUCKET_LABEL: Record<ProjectTaskBucket, string> = {
	overdue: 'Overdue',
	in_progress: 'In progress',
	scheduled: 'Scheduled',
	backlog: 'To do',
	blocked: 'Blocked',
	done: 'Done'
};

type BucketTask = Pick<ProjectTask, 'id' | 'state_key' | 'due_at' | 'start_at'> &
	Partial<Pick<ProjectTask, 'priority' | 'updated_at' | 'title'>>;

export function bucketOf(task: BucketTask, asOf: Date): ProjectTaskBucket {
	const now = asOf.getTime();
	const due = task.due_at ? Date.parse(task.due_at) : null;
	const start = task.start_at ? Date.parse(task.start_at) : null;
	if (task.state_key === 'done') return 'done';
	if (due !== null && due < now) return 'overdue';
	if (
		task.state_key === 'todo' &&
		((due !== null && due >= now) || (due === null && start !== null && start >= now))
	) {
		return 'scheduled';
	}
	if (task.state_key === 'in_progress') return 'in_progress';
	if (task.state_key === 'blocked') return 'blocked';
	return 'backlog';
}

function compareTasks(a: BucketTask, b: BucketTask, bucket: ProjectTaskBucket): number {
	if (bucket === 'done')
		return Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? '') || 0;
	const dueA = a.due_at ? Date.parse(a.due_at) : Number.POSITIVE_INFINITY;
	const dueB = b.due_at ? Date.parse(b.due_at) : Number.POSITIVE_INFINITY;
	if (dueA !== dueB) return dueA - dueB;
	const priA = a.priority ?? 3;
	const priB = b.priority ?? 3;
	if (priA !== priB) return priA - priB;
	return Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? '') || 0;
}

export type TaskGroup<T> = { bucket: ProjectTaskBucket; label: string; tasks: T[] };

/** Non-empty groups in `BUCKET_ORDER`; within a group, soonest due first, then priority. */
export function groupTasks<T extends BucketTask>(tasks: readonly T[], asOf: Date): TaskGroup<T>[] {
	const groups = new Map<ProjectTaskBucket, T[]>();
	for (const task of tasks) {
		const bucket = bucketOf(task, asOf);
		const list = groups.get(bucket) ?? [];
		list.push(task);
		groups.set(bucket, list);
	}
	return BUCKET_ORDER.flatMap((bucket) => {
		const list = groups.get(bucket);
		if (!list?.length) return [];
		return [
			{
				bucket,
				label: BUCKET_LABEL[bucket],
				tasks: [...list].sort((a, b) => compareTasks(a, b, bucket))
			}
		];
	});
}

export type BucketPage<T> = {
	tasks: T[];
	hasMore: boolean;
	nextOffset: number | null;
	total: number;
};

/**
 * Every task in one group, a page at a time (the route returns at most 100 per call). Stops at
 * `maxPages` so a runaway group cannot loop forever.
 */
export async function fetchWholeBucket<T extends { id: string }>(
	fetchPage: (offset: number) => Promise<BucketPage<T>>,
	maxPages = 20
): Promise<{ tasks: T[]; total: number; complete: boolean }> {
	const tasks: T[] = [];
	const seen = new Set<string>();
	let offset = 0;
	let total = 0;
	for (let page = 0; page < maxPages; page += 1) {
		const result = await fetchPage(offset);
		total = result.total;
		for (const task of result.tasks) {
			if (seen.has(task.id)) continue;
			seen.add(task.id);
			tasks.push(task);
		}
		if (!result.hasMore || result.nextOffset === null || result.nextOffset <= offset) {
			return { tasks, total, complete: true };
		}
		offset = result.nextOffset;
	}
	return { tasks, total, complete: false };
}
