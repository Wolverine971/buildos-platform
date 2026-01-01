// apps/web/src/routes/api/onto/shared/milestone-state.ts
import { MILESTONE_STATES } from '$lib/types/onto';

const MILESTONE_STATE_ALIASES: Record<string, string> = {
	achieved: 'completed',
	done: 'completed',
	deferred: 'pending'
};

const MILESTONE_STATE_SET = new Set(MILESTONE_STATES);

export function normalizeMilestoneStateInput(state: unknown): string | undefined {
	if (state === undefined || state === null) return undefined;
	if (typeof state !== 'string') return undefined;

	const normalized = state
		.trim()
		.toLowerCase()
		.replace(/[\s-]+/g, '_');
	if (!normalized) return undefined;

	const candidate = MILESTONE_STATE_ALIASES[normalized] ?? normalized;
	return MILESTONE_STATE_SET.has(candidate) ? candidate : undefined;
}
