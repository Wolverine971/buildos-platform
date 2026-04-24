// apps/web/src/lib/services/next-step-generation.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_EXPERIMENT_MODEL, DEEPSEEK_V4_FLASH_MODEL } from '@buildos/smart-llm';

vi.mock('$env/static/private', () => ({
	PRIVATE_OPENROUTER_API_KEY: 'openrouter-test-key'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

import { generateNextStepRecommendationFromPrompt } from './next-step-generation.service';

describe('next-step generation model fallback', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls back to Qwen when the DeepSeek primary model is rate-limited', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body) as Record<string, unknown>);
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message: 'Provider returned error',
							code: 429,
							metadata: {
								raw: `${DEEPSEEK_V4_FLASH_MODEL} is temporarily rate-limited upstream`,
								provider_name: 'DeepSeek'
							}
						}
					}),
					{
						status: 429,
						headers: {
							'content-type': 'application/json'
						}
					}
				);
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-next-step-fallback',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content:
									'{"short":"Start the draft","long":"Work on [[task:t1|the draft]] next."}'
							},
							finish_reason: 'stop'
						}
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 4,
						total_tokens: 14
					}
				}),
				{
					status: 200,
					headers: {
						'content-type': 'application/json'
					}
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const result = await generateNextStepRecommendationFromPrompt(
			'Recommend the next action.',
			{
				userId: 'user-1',
				projectId: 'project-1'
			}
		);

		expect(result).toEqual({
			short: 'Start the draft',
			long: 'Work on [[task:t1|the draft]] next.'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[0]?.models).toEqual([ACTIVE_EXPERIMENT_MODEL]);
		expect(requestBodies[1]?.model).toBe(ACTIVE_EXPERIMENT_MODEL);
		expect(requestBodies[1]?.models).toBeUndefined();
	});
});
