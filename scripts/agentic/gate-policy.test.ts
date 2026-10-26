// scripts/agentic/gate-policy.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CEDAR_CASES, WORKSPACE_CHAT_CASES, evaluateGateScorecard } from './gate-policy';
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
test('scores the Workspace chat battery on its own six cases with no Cedar latency limits', () => {
	const c = card();
	c.battery = 'workspace-chat';
	c.cases = WORKSPACE_CHAT_CASES.map((n) => ({
		case: n,
		scenarioId: `case-${n}`,
		expectedTurnCount: 1,
		score: 4
	}));
	c.turns = WORKSPACE_CHAT_CASES.flatMap((n) =>
		[1, 2, 3].map((repetition) => ({
			scenarioId: `case-${n}`,
			repetition,
			turnIndex: 1,
			resultClass: 'end_to_end_pass',
			// Slower than Cedar's case 2/4 ceilings: no ceiling applies here.
			durationMs: 90_000,
			toolCallCount: 12
		}))
	);
	assert.deepEqual(evaluateGateScorecard(c, 3, 'workspace-chat'), []);
	assert.deepEqual(evaluateGateScorecard(c, 3), ['Missing Cedar House scorecard']);
	c.cases.pop();
	assert.ok(
		evaluateGateScorecard(c, 3, 'workspace-chat').includes(
			'The complete 6-case workspace-chat battery did not run'
		)
	);
});
