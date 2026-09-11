// apps/web/src/lib/tests/agentic-e2e/harness/judge.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getJSONResponse } = vi.hoisted(() => ({
	getJSONResponse: vi.fn()
}));

vi.mock('$lib/services/smart-llm-service', () => ({
	SmartLLMService: class {
		getJSONResponse = getJSONResponse;
	}
}));

import {
	JUDGE_FORBIDDEN_MODELS,
	JUDGE_MODEL_CHAIN,
	judgeQuality,
	resolveJudgeModels
} from './judge';

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
		expect(getJSONResponse.mock.calls[0]?.[0]?.signal).toBeInstanceOf(AbortSignal);
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
		expect(getJSONResponse.mock.calls[0]?.[0]?.signal).not.toBe(
			getJSONResponse.mock.calls[1]?.[0]?.signal
		);
	});

	it('retains a malformed first verdict and retries only the judge', async () => {
		const onAttempt = vi.fn();
		getJSONResponse
			.mockResolvedValueOnce({ score: 'invalid' })
			.mockResolvedValueOnce({ score: 4, reasoning: 'Grounded.' });
		await judgeQuality({ rubric: 'Exact work.', transcript: 'Saved response.', onAttempt });
		expect(onAttempt.mock.calls[0]?.[0]).toMatchObject({
			attempt: 1,
			raw: { score: 'invalid' },
			error: 'Quality judge returned an invalid verdict'
		});
		expect(onAttempt.mock.calls[1]?.[0]).toMatchObject({ attempt: 2, raw: { score: 4 } });
		expect(getJSONResponse.mock.calls[1]?.[0].userPrompt).toBe(
			getJSONResponse.mock.calls[0]?.[0].userPrompt
		);
		expect(getJSONResponse.mock.calls[1]?.[0].models).toEqual(JUDGE_MODEL_CHAIN.slice(1));
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
	it('keeps each attempt payload separate when a malformed verdict is followed by timeout', async () => {
		const onAttempt = vi.fn();
		getJSONResponse
			.mockResolvedValueOnce({ score: 'invalid' })
			.mockRejectedValueOnce(new Error('timeout'));
		await expect(
			judgeQuality({ rubric: 'Exact work.', transcript: 'Saved response.', onAttempt })
		).rejects.toThrow('timeout');
		expect(onAttempt.mock.calls[0]?.[0].raw).toEqual({ score: 'invalid' });
		expect(onAttempt.mock.calls[1]?.[0].raw).toBeNull();
	});
	it('retains the actual judge model and provider returned by usage accounting', async () => {
		const onAttempt = vi.fn();
		const usage = {
			model: 'openai/gpt-5.6-luna',
			provider: 'OpenAI',
			providerRequestId: 'qa-request'
		};
		getJSONResponse.mockImplementationOnce(async (options) => {
			await options.onUsage(usage);
			return { score: 4, reasoning: 'Grounded in the receipt.' };
		});
		await judgeQuality({ rubric: 'Exact work.', transcript: 'Saved response.', onAttempt });
		expect(onAttempt.mock.calls[0]?.[0].usage).toEqual([usage]);
	});
});

// The `powerful` JSON profile ends its fallback chain on the acting model, so
// a bad run could have the model under test grade its own work
// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 J6).
describe('judge model routing', () => {
	it('never routes the judge to a model the battery is testing', () => {
		for (const model of JUDGE_MODEL_CHAIN) {
			expect(JUDGE_FORBIDDEN_MODELS).not.toContain(model);
		}
		expect(resolveJudgeModels(null)).toEqual([...JUDGE_MODEL_CHAIN]);
	});

	it('puts an explicit override first and keeps the strong chain behind it', () => {
		expect(resolveJudgeModels('moonshotai/kimi-k3')).toEqual([
			'moonshotai/kimi-k3',
			...JUDGE_MODEL_CHAIN.filter((model) => model !== 'moonshotai/kimi-k3')
		]);
	});

	it('refuses an override that names a model under test', () => {
		expect(() => resolveJudgeModels(JUDGE_FORBIDDEN_MODELS[0]!)).toThrow(
			/cannot run on a model under test/
		);
	});

	it('sends the pinned chain and the acting-model-free profile to SmartLLM', async () => {
		getJSONResponse.mockResolvedValueOnce({ score: 5, reasoning: 'Complete.' });
		await judgeQuality({ rubric: 'Do the work.', transcript: 'Done.' });

		expect(getJSONResponse).toHaveBeenCalledWith(
			expect.objectContaining({ models: [...JUDGE_MODEL_CHAIN], profile: 'maximum' })
		);
	});
});
