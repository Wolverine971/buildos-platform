// apps/web/src/routes/api/onto/shared/task-state.ts
import { TASK_STATES, type TaskState } from '$lib/types/onto';

const TASK_STATE_ALIASES: Record<string, TaskState> = {
	pending: 'todo',
	not_started: 'todo',
	backlog: 'todo',
	inprogress: 'in_progress',
	started: 'in_progress',
	working: 'in_progress',
	active: 'in_progress',
	completed: 'done',
	complete: 'done'
};

const TASK_STATE_SET = new Set<TaskState>(TASK_STATES);

export function normalizeTaskStateInput(state: unknown): TaskState | undefined {
	if (state === undefined || state === null) return undefined;
	if (typeof state !== 'string') return undefined;

	const normalized = state
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return undefined;

	const candidate = TASK_STATE_ALIASES[normalized] ?? normalized;
	return TASK_STATE_SET.has(candidate as TaskState) ? (candidate as TaskState) : undefined;
}
