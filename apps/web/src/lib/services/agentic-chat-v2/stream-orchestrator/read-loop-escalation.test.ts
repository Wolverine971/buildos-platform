// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/read-loop-escalation.test.ts
import { describe, expect, it } from 'vitest';
import {
	READ_LOOP_REPAIR_RANK,
	selectReadLoopRepairEscalation,
	type ReadLoopRepairEscalation
} from './read-loop-escalation';

describe('selectReadLoopRepairEscalation', () => {
	it('returns null before three read-only rounds', () => {
		expect(
			selectReadLoopRepairEscalation({ readOnlyRoundCount: 0, roundsRemaining: 10 })
		).toBeNull();
		expect(
			selectReadLoopRepairEscalation({ readOnlyRoundCount: 1, roundsRemaining: 10 })
		).toBeNull();
		expect(
			selectReadLoopRepairEscalation({ readOnlyRoundCount: 2, roundsRemaining: 10 })
		).toBeNull();
	});

	it('returns nudge at the lower threshold (3 read-only rounds)', () => {
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 3, roundsRemaining: 10 })).toBe(
			'nudge'
		);
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 5, roundsRemaining: 10 })).toBe(
			'nudge'
		);
	});

	it('returns stop_and_answer at 6 read-only rounds', () => {
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 6, roundsRemaining: 10 })).toBe(
			'stop_and_answer'
		);
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 7, roundsRemaining: 10 })).toBe(
			'stop_and_answer'
		);
	});

	it('returns must_synthesize at 8 read-only rounds', () => {
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 8, roundsRemaining: 10 })).toBe(
			'must_synthesize'
		);
		expect(
			selectReadLoopRepairEscalation({ readOnlyRoundCount: 12, roundsRemaining: 10 })
		).toBe('must_synthesize');
	});

	it('returns must_synthesize when two or fewer rounds remain, regardless of read count', () => {
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 2, roundsRemaining: 2 })).toBe(
			'must_synthesize'
		);
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 0, roundsRemaining: 0 })).toBe(
			'must_synthesize'
		);
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 5, roundsRemaining: 1 })).toBe(
			'must_synthesize'
		);
	});

	it('prefers must_synthesize when both ceiling triggers apply', () => {
		expect(selectReadLoopRepairEscalation({ readOnlyRoundCount: 8, roundsRemaining: 0 })).toBe(
			'must_synthesize'
		);
	});

	it('rank ordering is monotonic so callers can compare with <', () => {
		const ranks: ReadLoopRepairEscalation[] = ['nudge', 'stop_and_answer', 'must_synthesize'];
		const values = ranks.map((level) => READ_LOOP_REPAIR_RANK[level]);
		for (let i = 1; i < values.length; i += 1) {
			expect(values[i]).toBeGreaterThan(values[i - 1]!);
		}
	});

	it('produces only-increasing escalation across the lifecycle of a read-heavy turn', () => {
		// Simulates the Rod-style failure: 9 read-only rounds, maxToolRounds=12.
		// Walks the (readOnlyRoundCount, roundsRemaining) pair across each
		// round and confirms that the escalation never downgrades.
		const maxToolRounds = 12;
		let priorRank = 0;
		for (let round = 1; round <= 9; round += 1) {
			const roundsRemaining = maxToolRounds - round;
			const level = selectReadLoopRepairEscalation({
				readOnlyRoundCount: round,
				roundsRemaining
			});
			if (level === null) continue;
			const rank = READ_LOOP_REPAIR_RANK[level];
			expect(rank).toBeGreaterThanOrEqual(priorRank);
			priorRank = rank;
		}
		// By round 9 we should be at must_synthesize.
		expect(priorRank).toBe(READ_LOOP_REPAIR_RANK.must_synthesize);
	});
});
