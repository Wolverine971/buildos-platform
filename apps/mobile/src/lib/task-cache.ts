// apps/mobile/src/lib/task-cache.ts
import type {
	ProjectFullResponse,
	ProjectTask,
	TaskDetailResponse,
	TodayFeed
} from '@buildos/api-client';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Keeps every cached copy of a task (the task itself, Today, its project) in step with an edit.
 * Only the fields an edit touched are written, and an undo only puts a field back while it still
 * holds that edit's value, so two quick edits (a slow due date, then a fast Mark done) can
 * never undo each other whichever answer arrives first.
 */

export type TaskFields = Partial<
	Pick<ProjectTask, 'title' | 'description' | 'state_key' | 'due_at' | 'start_at' | 'priority'>
>;

const FIELDS = ['title', 'description', 'state_key', 'due_at', 'start_at', 'priority'] as const;
type Field = (typeof FIELDS)[number];
type TaskLike = Record<string, unknown> & { id: string };

function touched(fields: TaskFields): Field[] {
	return FIELDS.filter((field) => field in fields);
}

type Copy = {
	read: (data: unknown) => TaskLike[] | undefined;
	write: (data: unknown, map: (task: TaskLike) => TaskLike) => unknown;
};

function copies(userId: string | null, taskId: string): Array<{ key: QueryKey; copy: Copy }> {
	return [
		{
			key: ['task', userId, taskId],
			copy: {
				read: (data) => {
					const detail = data as TaskDetailResponse | undefined;
					return detail?.task ? [detail.task as unknown as TaskLike] : undefined;
				},
				write: (data, map) => {
					const detail = data as TaskDetailResponse;
					return { ...detail, task: map(detail.task as unknown as TaskLike) };
				}
			}
		},
		{
			key: ['today', userId],
			copy: {
				read: (data) =>
					(data as TodayFeed | undefined)?.tasks as unknown as TaskLike[] | undefined,
				write: (data, map) => {
					const feed = data as TodayFeed;
					return {
						...feed,
						tasks: feed.tasks.map((task) => map(task as unknown as TaskLike))
					};
				}
			}
		},
		{
			key: ['project', userId],
			copy: {
				read: (data) =>
					(data as ProjectFullResponse | undefined)?.tasks as unknown as
						| TaskLike[]
						| undefined,
				write: (data, map) => {
					const project = data as ProjectFullResponse;
					return {
						...project,
						tasks: project.tasks.map((task) => map(task as unknown as TaskLike))
					};
				}
			}
		}
	];
}

export type TaskEdit = {
	/** Puts back what this edit changed, field by field, unless a newer edit has changed it since. */
	undo: () => void;
	/** Swaps this edit's guesses for the server's values, again only where nothing newer landed. */
	confirm: (server: TaskFields) => void;
};

/** Writes `fields` into every cached copy of the task, as one edit that can be undone or confirmed. */
export function applyTaskEdit(
	queryClient: QueryClient,
	userId: string | null,
	taskId: string,
	fields: TaskFields
): TaskEdit {
	const names = touched(fields);
	const targets: Array<{
		queryKey: QueryKey;
		copy: Copy;
		before: Partial<Record<Field, unknown>>;
	}> = [];

	for (const { key, copy } of copies(userId, taskId)) {
		for (const [queryKey, data] of queryClient.getQueriesData({ queryKey: key })) {
			const task = copy.read(data)?.find((entry) => entry.id === taskId);
			if (!task) continue;
			const before: Partial<Record<Field, unknown>> = {};
			for (const name of names) if (name in task) before[name] = task[name];
			targets.push({ queryKey, copy, before });
			queryClient.setQueryData(queryKey, (current: unknown) =>
				current
					? copy.write(current, (entry) =>
							entry.id === taskId
								? { ...entry, ...pick(fields, names, entry) }
								: entry
						)
					: current
			);
		}
	}

	const replace = (
		next: (before: Partial<Record<Field, unknown>>) => Partial<Record<Field, unknown>>
	) => {
		for (const { queryKey, copy, before } of targets) {
			const values = next(before);
			queryClient.setQueryData(queryKey, (current: unknown) =>
				current
					? copy.write(current, (entry) => {
							if (entry.id !== taskId) return entry;
							const updated = { ...entry };
							for (const name of names) {
								if (!(name in values)) continue;
								// A newer edit changed this field since: its value stays.
								if (updated[name] === fields[name]) updated[name] = values[name];
							}
							return updated;
						})
					: current
			);
		}
	};

	return {
		undo: () => replace((before) => before),
		confirm: (server) => replace(() => server as Partial<Record<Field, unknown>>)
	};
}

/** Only fields the copy already carries (Today's tasks have no `priority`, for example). */
function pick(fields: TaskFields, names: Field[], entry: TaskLike): Partial<TaskLike> {
	const out: Partial<TaskLike> = {};
	for (const name of names) if (name in entry || name === 'state_key') out[name] = fields[name];
	return out;
}

/** The server's word on the fields this edit touched, and nothing else. */
export function serverFields(task: Partial<Record<Field, unknown>>, sent: TaskFields): TaskFields {
	const out: Record<string, unknown> = {};
	for (const name of touched(sent)) if (name in task) out[name] = task[name];
	return out as TaskFields;
}
