// apps/web/src/lib/services/next-step-generation.service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_EXPERIMENT_MODEL } from '@buildos/smart-llm';

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

	it('does not fall back to non-active models when the experiment model is rate-limited', async () => {
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
								raw: `${ACTIVE_EXPERIMENT_MODEL} is temporarily rate-limited upstream`,
								provider_name: 'Qwen'
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

			throw new Error('Unexpected fallback request');
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const result = await generateNextStepRecommendationFromPrompt(
			'Recommend the next action.',
			{
				userId: 'user-1',
				projectId: 'project-1'
			}
		);

		expect(result).toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(requestBodies[0]?.model).toBe(ACTIVE_EXPERIMENT_MODEL);
		expect(requestBodies[0]?.models).toBeUndefined();
	});
});
