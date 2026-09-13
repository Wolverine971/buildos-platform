// scripts/agentic/gate-policy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEDAR_CASES, evaluateGateScorecard } from './gate-policy';
function card() {
	return {
		kind: 'agentic_chat_battery_scorecard',
		battery: 'cedar-house',
		provenance: { verified: true },
		cases: CEDAR_CASES.map((n) => ({
			case: n,
			scenarioId: `case-${n}`,
			expectedTurnCount: 1,
			score: 4
		})),
		turns: CEDAR_CASES.flatMap((n) =>
			[1, 2, 3].map((repetition) => ({
				scenarioId: `case-${n}`,
				repetition,
				turnIndex: 1,
				resultClass: 'end_to_end_pass',
				durationMs: 10_000,
				toolCallCount: 2
			}))
		)
	};
}
test('accepts a complete provenance-verified three-repetition run', () =>
	assert.deepEqual(evaluateGateScorecard(card(), 3), []));
test('rejects eleven cases, skipped repetitions and partial turns even if aggregate scores are perfect', () => {
	for (const mutate of [
		(c: any) => c.cases.splice(9, 2),
		(c: any) => c.turns.pop(),
		(c: any) => c.cases[3].expectedTurnCount++
	]) {
		const c = card();
		mutate(c);
		assert.ok(evaluateGateScorecard(c, 3).length);
	}
});
test('rejects stale provenance, failed outcomes and slow load-bearing cases', () => {
	const c = card();
	c.provenance.verified = false;
	c.cases[0]!.score = 0;
	c.turns.find((t) => t.scenarioId === 'case-4')!.durationMs = 30_000;
	const failures = evaluateGateScorecard(c, 3);
	assert.ok(failures.some((f) => f.includes('provenance')));
	assert.ok(failures.some((f) => f.includes('0/4')));
	assert.ok(failures.some((f) => f.includes('latency')));
});
