// apps/web/src/lib/tests/agentic-e2e/harness/turn-sequencing.test.ts
import { describe, expect, it, vi } from 'vitest';
import { checkTurnBeforeFollowupRelease } from './turn-sequencing';

describe('checkTurnBeforeFollowupRelease', () => {
	it('checks assertions, judging, and evidence capture before releasing an intermediate turn', async () => {
		const order: string[] = [];
		let capturedJudgeStatus: string | null = null;

		await checkTurnBeforeFollowupRelease({
			hasFollowup: true,
			assertTurn: async () => void order.push('assert'),
			judgeTurn: async () => {
				order.push('judge');
				return { score: 4, passed: true, reasoning: 'Good result.', threshold: 3 };
			},
			captureTurn: async (outcome) => {
				capturedJudgeStatus = outcome.judge.status;
				order.push(outcome.overallError ? 'capture-error' : 'capture');
			},
			releaseForFollowup: async () => void order.push('release')
		});

		expect(order).toEqual(['assert', 'judge', 'capture', 'release']);
		expect(capturedJudgeStatus).toBe('passed');
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
		const captureTurn = vi.fn();
		const releaseForFollowup = vi.fn();

		await expect(
			checkTurnBeforeFollowupRelease({
				hasFollowup: true,
				assertTurn: async () => {
					throw new Error('assertion failed');
				},
				judgeTurn,
				captureTurn,
				releaseForFollowup
			})
		).rejects.toThrow('assertion failed');
		expect(judgeTurn).not.toHaveBeenCalled();
		expect(captureTurn).toHaveBeenCalledOnce();
		expect(captureTurn.mock.calls[0]?.[0]).toMatchObject({
			deterministicAssertionPassed: false,
			deterministicAssertionError: expect.any(Error),
			judge: { status: 'not_reached' },
			overallError: expect.any(Error)
		});
		expect(releaseForFollowup).not.toHaveBeenCalled();
	});

	it('captures an explicit failed judge verdict before rejecting the turn', async () => {
		const captureTurn = vi.fn();
		const releaseForFollowup = vi.fn();

		await expect(
			checkTurnBeforeFollowupRelease({
				hasFollowup: true,
				assertTurn: async () => undefined,
				judgeTurn: async () => ({
					score: 2,
					passed: false,
					reasoning: 'The requested structure was not created.',
					threshold: 3
				}),
				captureTurn,
				releaseForFollowup
			})
		).rejects.toThrow('LLM judge scored 2/5');
		expect(captureTurn).toHaveBeenCalledOnce();
		expect(captureTurn.mock.calls[0]?.[0]).toMatchObject({
			deterministicAssertionPassed: true,
			deterministicAssertionError: null,
			judge: {
				status: 'failed',
				result: { score: 2, passed: false, threshold: 3 }
			},
			overallError: expect.any(Error)
		});
		expect(releaseForFollowup).not.toHaveBeenCalled();
	});

	it('distinguishes a judge provider error from a low quality score', async () => {
		const captureTurn = vi.fn();

		await expect(
			checkTurnBeforeFollowupRelease({
				hasFollowup: false,
				assertTurn: async () => undefined,
				judgeTurn: async () => {
					throw new Error('judge provider unavailable');
				},
				captureTurn,
				releaseForFollowup: async () => undefined
			})
		).rejects.toThrow('judge provider unavailable');
		expect(captureTurn.mock.calls[0]?.[0]).toMatchObject({
			deterministicAssertionPassed: true,
			judge: { status: 'error', error: expect.any(Error) },
			overallError: expect.any(Error)
		});
	});
});
