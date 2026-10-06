// apps/web/src/lib/components/today/today-task-order.ts
// How Today lays out its untimed tasks, and the order the reader walks them in.
import type { TodayTask, TodayTaskBucket } from '$lib/types/today';

export const TODAY_TASK_BUCKETS: { key: TodayTaskBucket; label: string }[] = [
	{ key: 'due_today', label: 'Due today' },
	{ key: 'starts_today', label: 'Starting today' },
	{ key: 'in_progress', label: 'In progress' }
];

export interface TodayTaskGroup {
	key: TodayTaskBucket;
	label: string;
	projects: { id: string; name: string; tasks: TodayTask[] }[];
}

/** Urgency first, then project. IDs keep equally named projects apart; tasks keep their order. */
export function groupTodayTasks(tasks: readonly TodayTask[]): TodayTaskGroup[] {
	const byBucket = new Map(
		TODAY_TASK_BUCKETS.map((bucket) => [bucket.key, new Map<string, TodayTask[]>()])
	);
	for (const task of tasks) {
		const projects = byBucket.get(task.bucket)!;
		const projectTasks = projects.get(task.project_id);
		if (projectTasks) projectTasks.push(task);
		else projects.set(task.project_id, [task]);
	}
	return TODAY_TASK_BUCKETS.map((bucket) => ({
		...bucket,
		projects: Array.from(byBucket.get(bucket.key)!, ([id, items]) => ({
			id,
			name: items[0]!.project_name,
			tasks: items
		}))
	})).filter((bucket) => bucket.projects.length > 0);
}

/** Task ids as they read down the page: the timed schedule, then each anytime group. */
export function todayTaskOrder(
	scheduled: readonly (TodayTask | null | undefined)[],
	anytime: readonly TodayTask[]
): string[] {
	const ids: string[] = [];
	const seen = new Set<string>();
	const add = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		ids.push(id);
	};
	for (const task of scheduled) if (task) add(task.id);
	for (const bucket of groupTodayTasks(anytime))
		for (const project of bucket.projects) for (const task of project.tasks) add(task.id);
	return ids;
}
