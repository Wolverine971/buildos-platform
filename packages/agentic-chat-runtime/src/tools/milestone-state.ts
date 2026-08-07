// packages/agentic-chat-runtime/src/tools/milestone-state.ts
// Pure milestone decoration shared by agent reads and the Svelte UI shim.

import { MILESTONE_STATES, type MilestoneState } from '@buildos/shared-agent-ops/ontology/onto';

export type MilestoneStateInput = {
	state_key?: string | null;
	due_at?: string | null;
	props?: unknown;
	effective_state_key?: string | null;
	is_missed?: boolean | null;
};

const MILESTONE_STATE_SET = new Set<string>(MILESTONE_STATES);

export function resolveMilestoneState(
	milestone: MilestoneStateInput,
	now: Date = new Date()
): { state: MilestoneState; isMissed: boolean } {
	const props = milestone.props as Record<string, unknown> | null | undefined;
	const rawState =
		milestone.effective_state_key ??
		milestone.state_key ??
		(props?.state_key as string | undefined) ??
		'pending';
	const baseState: MilestoneState = MILESTONE_STATE_SET.has(rawState)
		? (rawState as MilestoneState)
		: 'pending';
	let isMissed = milestone.is_missed === true || baseState === 'missed';

	if (!isMissed && milestone.due_at) {
		const due = new Date(milestone.due_at);
		if (!Number.isNaN(due.getTime())) {
			isMissed =
				due.getTime() < now.getTime() &&
				baseState !== 'completed' &&
				baseState !== 'in_progress';
		}
	}

	return { state: isMissed ? 'missed' : baseState, isMissed };
}

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
