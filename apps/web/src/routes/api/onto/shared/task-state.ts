import { TASK_STATES } from '$lib/types/onto';

const TASK_STATE_ALIASES: Record<string, string> = {
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

const TASK_STATE_SET = new Set(TASK_STATES);

export function normalizeTaskStateInput(state: unknown): string | undefined {
	if (state === undefined || state === null) return undefined;
	if (typeof state !== 'string') return undefined;

	const normalized = state
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return undefined;

	const candidate = TASK_STATE_ALIASES[normalized] ?? normalized;
	return TASK_STATE_SET.has(candidate) ? candidate : undefined;
}
