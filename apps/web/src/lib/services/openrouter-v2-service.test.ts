import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/private', () => ({
	PRIVATE_OPENROUTER_API_KEY: 'openrouter-test-key'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

import { OpenRouterV2Service } from './openrouter-v2-service';

describe('OpenRouterV2Service model failover', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('falls back to the next JSON lane model when the primary model is unavailable', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message:
								'Hunter Alpha was a stealth model revealed on March 18th as an early testing version of MiMo-V2-Pro.'
						}
					}),
					{
						status: 404,
						headers: {
							'content-type': 'application/json'
						}
					}
				);
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-v2-fallback',
					model: 'google/gemini-3.1-flash-lite-preview',
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: '{"ok":true}'
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

		const service = new OpenRouterV2Service({
			apiKey: 'openrouter-test-key',
			httpReferer: 'https://buildos.test',
			appName: 'OpenRouter V2 Test'
		});

		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe('deepseek/deepseek-v3.2');
		expect(requestBodies[1]?.model).toBe('google/gemini-3.1-flash-lite-preview');
	});
});
