// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/read-loop-escalation.ts
//
// Read-loop escalation policy.
//
// The orchestrator injects a system instruction when the model is making
// read-only tool calls without progress. Earlier versions fired this once
// per turn ("nudge"), which the model often ignored — leading to the canned
// "I hit a safety limit" failure once the round cap fired (see Rod
// Chamberlin audit, 2026-05-12).
//
// This module produces an escalating level based on how many read-only
// rounds have occurred and how many rounds remain before the cap. The
// orchestrator gates re-injection by rank: a higher level can replace a
// lower one, but not the other way around. Reset to 0 on any write round.

export type ReadLoopRepairEscalation = 'nudge' | 'stop_and_answer' | 'must_synthesize';

export const READ_LOOP_REPAIR_RANK: Record<ReadLoopRepairEscalation, number> = {
	nudge: 1,
	stop_and_answer: 2,
	must_synthesize: 3
};

export function selectReadLoopRepairEscalation(params: {
	readOnlyRoundCount: number;
	roundsRemaining: number;
}): ReadLoopRepairEscalation | null {
	if (params.roundsRemaining <= 1 || params.readOnlyRoundCount >= 6) {
		return 'must_synthesize';
	}
	if (params.readOnlyRoundCount >= 4) {
		return 'stop_and_answer';
	}
	if (params.readOnlyRoundCount >= 2) {
		return 'nudge';
	}
	return null;
}
