import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getJSONResponse } = vi.hoisted(() => ({
	getJSONResponse: vi.fn()
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = getJSONResponse;
	}
}));

import { judgeQuality } from './judge';

describe('judgeQuality', () => {
	beforeEach(() => {
		getJSONResponse.mockReset();
	});

	it('returns the first successful verdict without another paid call', async () => {
		getJSONResponse.mockResolvedValueOnce({ score: 4, reasoning: 'Specific and complete.' });

		await expect(
			judgeQuality({ rubric: 'Do the work.', transcript: 'The work was done.' })
		).resolves.toEqual({
			score: 4,
			passed: true,
			reasoning: 'Specific and complete.'
		});
		expect(getJSONResponse).toHaveBeenCalledTimes(1);
	});

	it('retries one provider failure without changing the rubric or threshold', async () => {
		getJSONResponse
			.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
			.mockResolvedValueOnce({ score: 2, reasoning: 'The recommendation was generic.' });

		await expect(
			judgeQuality({
				rubric: 'Give a specific recommendation.',
				transcript: 'Consider prioritizing strategically.',
				threshold: 3
			})
		).resolves.toEqual({
			score: 2,
			passed: false,
			reasoning: 'The recommendation was generic.'
		});
		expect(getJSONResponse).toHaveBeenCalledTimes(2);
	});

	it('surfaces the provider failure after the bounded retry', async () => {
		getJSONResponse
			.mockRejectedValueOnce(new Error('first timeout'))
			.mockRejectedValueOnce(new Error('second timeout'));

		await expect(
			judgeQuality({ rubric: 'Do the work.', transcript: 'The work was done.' })
		).rejects.toThrow('second timeout');
		expect(getJSONResponse).toHaveBeenCalledTimes(2);
	});
});
