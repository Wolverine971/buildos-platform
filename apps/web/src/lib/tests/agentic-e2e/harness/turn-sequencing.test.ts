// apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { checkTurnBeforeFollowupRelease } from './turn-sequencing';

describe('checkTurnBeforeFollowupRelease', () => {
	it('checks assertions and judging before releasing an intermediate turn', async () => {
		const order: string[] = [];

		await checkTurnBeforeFollowupRelease({
			hasFollowup: true,
			assertTurn: async () => void order.push('assert'),
			judgeTurn: async () => void order.push('judge'),
			releaseForFollowup: async () => void order.push('release')
		});

		expect(order).toEqual(['assert', 'judge', 'release']);
	});

	it('never releases the final turn', async () => {
		const releaseForFollowup = vi.fn();

		await checkTurnBeforeFollowupRelease({
			hasFollowup: false,
			assertTurn: async () => undefined,
			releaseForFollowup
		});

		expect(releaseForFollowup).not.toHaveBeenCalled();
	});

	it('does not judge or release a turn whose assertions fail', async () => {
		const judgeTurn = vi.fn();
		const releaseForFollowup = vi.fn();

		await expect(
			checkTurnBeforeFollowupRelease({
				hasFollowup: true,
				assertTurn: async () => {
					throw new Error('assertion failed');
				},
				judgeTurn,
				releaseForFollowup
			})
		).rejects.toThrow('assertion failed');
		expect(judgeTurn).not.toHaveBeenCalled();
		expect(releaseForFollowup).not.toHaveBeenCalled();
	});

	it('does not release a turn whose judge fails', async () => {
		const releaseForFollowup = vi.fn();

		await expect(
			checkTurnBeforeFollowupRelease({
				hasFollowup: true,
				assertTurn: async () => undefined,
				judgeTurn: async () => {
					throw new Error('judge failed');
				},
				releaseForFollowup
			})
		).rejects.toThrow('judge failed');
		expect(releaseForFollowup).not.toHaveBeenCalled();
	});
});
