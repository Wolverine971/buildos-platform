// apps/web/src/lib/services/next-step-generation.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

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

	it('falls back to the next OpenRouter model when the primary model is rate-limited', async () => {
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
								raw: 'qwen/qwen3.5-flash-02-23 is temporarily rate-limited upstream',
								provider_name: 'Alibaba'
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
					model: 'deepseek/deepseek-v3.2',
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content:
									'{"short":"Draft the brief","long":"Draft [[task:task-1|the brief]] to move the project forward."}'
							},
							finish_reason: 'stop'
						}
					],
					usage: {
						prompt_tokens: 12,
						completion_tokens: 9,
						total_tokens: 21
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
			short: 'Draft the brief',
			long: 'Draft [[task:task-1|the brief]] to move the project forward.'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe('qwen/qwen3.5-flash-02-23');
		expect(requestBodies[0]?.extra_body).toEqual({
			models: [
				'deepseek/deepseek-v3.2',
				'qwen/qwen3.6-plus',
				'openai/gpt-oss-120b',
				'openai/gpt-4.1-nano'
			]
		});
		expect(requestBodies[1]?.model).toBe('deepseek/deepseek-v3.2');
	});
});
