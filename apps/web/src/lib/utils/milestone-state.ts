// apps/web/src/lib/utils/milestone-state.ts
// Helpers to normalize milestone state and compute "missed" status consistently
import { MILESTONE_STATES, type MilestoneState } from '$lib/types/onto';

export type MilestoneStateInput = {
	state_key?: string | null;
	due_at?: string | null;
	// Accept Json-typed props from database rows (Json can be primitives, arrays, or objects)
	props?: unknown;
	effective_state_key?: string | null;
	is_missed?: boolean | null;
};

const MILESTONE_STATE_SET = new Set<string>(MILESTONE_STATES);

/**
 * Resolve the effective milestone state, applying missed detection if needed.
 * Falls back to local computation when the API hasn't provided computed fields.
 */
export function resolveMilestoneState(
	milestone: MilestoneStateInput,
	now: Date = new Date()
): { state: MilestoneState; isMissed: boolean } {
	const props = milestone.props as Record<string, unknown> | null | undefined;
	const rawState =
		(milestone.effective_state_key as string | null | undefined) ??
		milestone.state_key ??
		(props?.state_key as string | undefined) ??
		'pending';

	const baseState: MilestoneState = MILESTONE_STATE_SET.has(rawState ?? '')
		? (rawState as MilestoneState)
		: 'pending';

	// Prefer server-provided missed flag/state when present
	const hasServerMissed = milestone.is_missed === true || baseState === 'missed';

	let isMissed = hasServerMissed;

	if (!isMissed && milestone.due_at) {
		const due = new Date(milestone.due_at);
		if (!Number.isNaN(due.getTime())) {
			isMissed =
				due.getTime() < now.getTime() &&
				baseState !== 'completed' &&
				baseState !== 'in_progress';
		}
	}

	const effectiveState: MilestoneState = isMissed ? 'missed' : baseState;

	return { state: effectiveState, isMissed };
}

/**
 * Attach computed fields (`effective_state_key`, `is_missed`) to a milestone-like object.
 */
export function withComputedMilestoneState<T extends MilestoneStateInput>(
	milestone: T,
	now: Date = new Date()
): T & { effective_state_key: MilestoneState; is_missed: boolean } {
	const { state, isMissed } = resolveMilestoneState(milestone, now);
	return {
		...milestone,
		effective_state_key: state,
		is_missed: isMissed
	};
}
