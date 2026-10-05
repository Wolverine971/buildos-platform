// apps/web/src/lib/components/projects/desktop/reader-task-groups.ts
//
// The task list beside the reader: the project board folded into one column.
// Groups follow the board's columns (In progress leads, since that is what is
// being worked), and each group keeps the board's order within its column.
import { compareProjectTasksForBucket } from '$lib/utils/project-task-board';

export type ReaderTask = {
	id: string;
	title: string;
	state_key: string;
	due_at?: string | null;
	start_at?: string | null;
	priority?: number | null;
	completed_at?: string | null;
	updated_at?: string | null;
	deleted_at?: string | null;
	archived_at?: string | null;
};

export type TaskGroupKey = 'in_progress' | 'backlog' | 'blocked' | 'done';
export type TaskGroup<T extends ReaderTask = ReaderTask> = {
	key: TaskGroupKey;
	label: string;
	tasks: T[];
};

const GROUPS: readonly { key: TaskGroupKey; label: string }[] = [
	{ key: 'in_progress', label: 'In progress' },
	{ key: 'backlog', label: 'Backlog' },
	{ key: 'blocked', label: 'Blocked' },
	{ key: 'done', label: 'Done' }
];

function groupOf(task: ReaderTask): TaskGroupKey {
	if (task.state_key === 'done') return 'done';
	if (task.state_key === 'in_progress') return 'in_progress';
	if (task.state_key === 'blocked') return 'blocked';
	return 'backlog';
}

/** The non-empty groups, in order; archived and deleted tasks are left out. */
export function groupTasksForReader<T extends ReaderTask>(tasks: readonly T[]): TaskGroup<T>[] {
	const byKey = new Map<TaskGroupKey, T[]>(GROUPS.map((group) => [group.key, []]));
	for (const task of tasks) {
		if (task.archived_at || task.deleted_at) continue;
		byKey.get(groupOf(task))!.push(task);
	}
	return GROUPS.flatMap(({ key, label }) => {
		const list = byKey.get(key)!;
		if (!list.length) return [];
		list.sort((a, b) => compareProjectTasksForBucket(key, normalize(a), normalize(b)));
		return [{ key, label, tasks: list }];
	});
}

/** Prev/Next order: every shown row, top to bottom. */
export function taskReaderOrder(groups: readonly TaskGroup[], showDone: boolean): string[] {
	return groups
		.filter((group) => showDone || group.key !== 'done')
		.flatMap((group) => group.tasks.map((task) => task.id));
}

type Comparable = Parameters<typeof compareProjectTasksForBucket>[1];

function normalize(task: ReaderTask): Comparable {
	return {
		id: task.id,
		state_key: task.state_key as Comparable['state_key'],
		due_at: task.due_at ?? null,
		start_at: task.start_at ?? null,
		completed_at: task.completed_at ?? null,
		priority: task.priority ?? null,
		updated_at: task.updated_at ?? '',
		deleted_at: task.deleted_at ?? null
	};
}
