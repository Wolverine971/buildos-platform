// apps/web/src/lib/services/openrouter-v2-service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	ACTIVE_EXPERIMENT_MODEL,
	AGENT_STATE_RECONCILIATION_MODEL,
	DEEPSEEK_V4_FLASH_MODEL,
	DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER,
	GEMINI_31_FLASH_LITE_MODEL,
	GLM_53_FLASH_MODEL,
	GPT_6_LUNA_MODEL,
	KIMI_EXPERIMENT_MODEL,
	OPENROUTER_V2_JSON_MODELS,
	OPENROUTER_V2_MULTIMODAL_MODELS,
	OPENROUTER_V2_TOOL_MODELS,
	QWEN_38_27B_FREE_MODEL,
	XIAOMI_MIMO_V25_MODEL
} from '@buildos/smart-llm';

vi.mock('$env/static/private', () => ({
	PRIVATE_OPENROUTER_API_KEY: 'openrouter-test-key'
}));

vi.mock('$env/dynamic/private', () => ({
	env: {}
}));

import { OpenRouterV2Service } from './openrouter-v2-service';

function createService() {
	return new OpenRouterV2Service({
		apiKey: 'openrouter-test-key',
		httpReferer: 'https://buildos.test',
		appName: 'OpenRouter V2 Test'
	});
}

function createServiceWithUsageLogger(insertMock: ReturnType<typeof vi.fn>) {
	return new OpenRouterV2Service({
		apiKey: 'openrouter-test-key',
		httpReferer: 'https://buildos.test',
		appName: 'OpenRouter V2 Test',
		supabase: {
			from: vi.fn((table: string) => {
				if (table !== 'llm_usage_logs') {
					throw new Error(`Unexpected table ${table}`);
				}
				return {
					insert: insertMock
				};
			})
		} as any
	});
}

function createSseResponse(payloads: string[], headers?: Record<string, string>) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const payload of payloads) {
				controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
			}
			controller.close();
		}
	});

	return new Response(stream, {
		status: 200,
		headers: {
			'content-type': 'text/event-stream',
			...headers
		}
	});
}

describe('OpenRouterV2Service model routing', () => {
	it.each(['json', 'text', 'stream'] as const)(
		'does not escape free Qwen to paid fallbacks for %s',
		async (operation) => {
			const bodies: Record<string, unknown>[] = [];
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
				bodies.push(JSON.parse(String(init?.body)));
				return new Response(JSON.stringify({ error: { message: 'No endpoints found' } }), {
					status: 404
				});
			});
			vi.stubGlobal('fetch', fetchMock);
			const service = createService();
			if (operation === 'json') {
				await expect(
					service.getJSONResponse({
						model: QWEN_38_27B_FREE_MODEL,
						systemPrompt: 'Return JSON.',
						userPrompt: 'Summarize a fixture.',
						userId: 'dev'
					})
				).rejects.toThrow();
				expect(bodies[0]).not.toHaveProperty('response_format');
			} else if (operation === 'text') {
				await expect(
					service.generateTextDetailed({
						model: QWEN_38_27B_FREE_MODEL,
						prompt: 'Summarize a fixture.',
						userId: 'dev'
					})
				).rejects.toThrow();
			} else {
				const events = [];
				for await (const event of service.streamText({
					model: QWEN_38_27B_FREE_MODEL,
					messages: [{ role: 'user', content: 'Summarize a fixture.' }],
					userId: 'dev'
				}))
					events.push(event);
				expect(events.some((event) => event.type === 'error')).toBe(true);
			}
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(bodies[0]?.model).toBe(QWEN_38_27B_FREE_MODEL);
			expect(bodies[0]).not.toHaveProperty('models');
			expect(bodies[0]?.provider).toMatchObject({
				max_price: { prompt: 0, completion: 0, request: 0 }
			});
		}
	);
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('preserves assistant reasoning fields when replaying tool-call context', async () => {
		const requestBodies: any[] = [];
		const requestHeaders: HeadersInit[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			if (init?.headers) {
				requestHeaders.push(init.headers);
			}
			return createSseResponse([
				JSON.stringify({
					id: 'stream-preserve-reasoning',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [{ delta: { content: 'done' } }]
				}),
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
				'[DONE]'
			]);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const reasoningDetails = [
			{ type: 'reasoning.summary', summary: 'picked the lookup tool', index: 0 }
		];

		for await (const event of service.streamText({
			messages: [
				{ role: 'user', content: 'Look this up.' },
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_lookup',
							type: 'function',
							function: { name: 'lookup', arguments: '{}' }
						}
					],
					reasoning: 'Need an external lookup.',
					reasoning_details: reasoningDetails
				},
				{ role: 'tool', tool_call_id: 'call_lookup', content: '{"ok":true}' }
			],
			userId: 'user_1'
		})) {
			if (event.type === 'done') break;
		}

		expect(requestBodies[0]?.messages[1]).toMatchObject({
			role: 'assistant',
			reasoning: 'Need an external lookup.',
			reasoning_details: reasoningDetails
		});
		expect(requestHeaders[0]).toMatchObject({
			'HTTP-Referer': 'https://buildos.test',
			'X-Title': 'OpenRouter V2 Test',
			'X-OpenRouter-Metadata': 'enabled'
		});
	});

	it('falls back from the DeepSeek JSON primary to the next roster model', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			if (requestBodies.length > 1) {
				return new Response(
					JSON.stringify({
						id: 'chatcmpl-v2-fallback',
						model: OPENROUTER_V2_JSON_MODELS[1],
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
			}

			return new Response(
				JSON.stringify({
					error: {
						message: `${DEEPSEEK_V4_FLASH_MODEL} is temporarily unavailable from the upstream provider.`
					}
				}),
				{
					status: 404,
					headers: {
						'content-type': 'application/json'
					}
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();

		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe(OPENROUTER_V2_JSON_MODELS[0]);
		expect(requestBodies[0]?.models).toEqual(OPENROUTER_V2_JSON_MODELS.slice(1, 4));
		// deepseek-v4-flash primary → per-model default provider steering applies
		// (WP-4: prefer hosts whose prompt-prefix caching actually works).
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true,
			order: [...DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER]
		});
		expect(requestBodies[1]?.model).toBe(OPENROUTER_V2_JSON_MODELS[1]);
		expect(requestBodies[1]?.models).toEqual(OPENROUTER_V2_JSON_MODELS.slice(2, 5));
		// The retry's primary model has no default order — steering is per-model.
		expect(requestBodies[1]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true
		});
	});

	it('uses a ZDR-protected discounted GLM dev primary and restores normal routing on fallback', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: { message: 'GLM 5.3 Flash is temporarily unavailable.' }
					}),
					{ status: 429, headers: { 'content-type': 'application/json' } }
				);
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-v2-glm-fallback',
					model: DEEPSEEK_V4_FLASH_MODEL,
					choices: [
						{
							index: 0,
							message: { role: 'assistant', content: '{"ok":true}' },
							finish_reason: 'stop'
						}
					],
					usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = new OpenRouterV2Service({
			apiKey: 'openrouter-test-key',
			devPrimaryModel: GLM_53_FLASH_MODEL
		});
		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.'
		});

		expect(result).toEqual({ ok: true });
		expect(requestBodies[0]?.model).toBe(GLM_53_FLASH_MODEL);
		expect(requestBodies[0]?.models).toContain(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'low', exclude: true });
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true,
			order: ['z-ai'],
			max_price: { prompt: 0.075, completion: 0.25, request: 0 }
		});
		expect(requestBodies[1]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[1]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true,
			order: [...DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER]
		});
	});

	it('applies PRIVATE_OPENROUTER_PROVIDER_ORDER as a provider order preference', async () => {
		vi.stubEnv('PRIVATE_OPENROUTER_PROVIDER_ORDER', ' Baidu, GMICloud ,');
		try {
			const requestBodies: any[] = [];
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
				if (typeof init?.body === 'string') {
					requestBodies.push(JSON.parse(init.body));
				}
				return new Response(
					JSON.stringify({
						id: 'chatcmpl-v2-provider-order',
						model: DEEPSEEK_V4_FLASH_MODEL,
						choices: [
							{
								index: 0,
								message: { role: 'assistant', content: '{"ok":true}' },
								finish_reason: 'stop'
							}
						],
						usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			});
			vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

			const service = createService();
			const result = await service.getJSONResponse<{ ok: boolean }>({
				systemPrompt: 'Return valid JSON.',
				userPrompt: 'Respond with {"ok":true}.'
			});

			expect(result).toEqual({ ok: true });
			expect(requestBodies[0]?.provider).toEqual({
				allow_fallbacks: true,
				require_parameters: true,
				data_collection: 'deny',
				zdr: true,
				order: ['baidu', 'gmicloud']
			});
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('disables provider steering entirely when PRIVATE_OPENROUTER_PROVIDER_ORDER is "off"', async () => {
		vi.stubEnv('PRIVATE_OPENROUTER_PROVIDER_ORDER', 'off');
		try {
			const requestBodies: any[] = [];
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
				if (typeof init?.body === 'string') {
					requestBodies.push(JSON.parse(init.body));
				}
				return new Response(
					JSON.stringify({
						id: 'chatcmpl-v2-provider-order-off',
						model: DEEPSEEK_V4_FLASH_MODEL,
						choices: [
							{
								index: 0,
								message: { role: 'assistant', content: '{"ok":true}' },
								finish_reason: 'stop'
							}
						],
						usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			});
			vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

			const service = createService();
			const result = await service.getJSONResponse<{ ok: boolean }>({
				systemPrompt: 'Return valid JSON.',
				userPrompt: 'Respond with {"ok":true}.'
			});

			// The kill switch suppresses even the per-model defaults — instant
			// no-deploy revert if a preferred host degrades.
			expect(result).toEqual({ ok: true });
			expect(requestBodies[0]?.provider).toEqual({
				allow_fallbacks: true,
				require_parameters: true,
				data_collection: 'deny',
				zdr: true
			});
		} finally {
			vi.unstubAllEnvs();
		}
	});

	it('honors JSON profile hints while keeping DeepSeek as the primary model', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-v2-profile',
					model: DEEPSEEK_V4_FLASH_MODEL,
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

		const service = createService();

		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			profile: 'fast'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(requestBodies[0]?.model).toBe(OPENROUTER_V2_JSON_MODELS[0]);
		expect(requestBodies[0]?.response_format).toEqual({ type: 'json_object' });
		expect(requestBodies[0]?.models).toEqual([
			GPT_6_LUNA_MODEL,
			XIAOMI_MIMO_V25_MODEL,
			GEMINI_31_FLASH_LITE_MODEL
		]);
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true,
			order: [...DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER]
		});
	});

	it('routes allowlisted reconciliation JSON calls without default fallbacks', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-reconciliation-side-route',
					model: AGENT_STATE_RECONCILIATION_MODEL,
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

		const service = createService();

		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false,
			maxTokens: 1200,
			operationType: 'agent_state_reconciliation'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(requestBodies[0]?.model).toBe(AGENT_STATE_RECONCILIATION_MODEL);
		expect(requestBodies[0]?.models).toBeUndefined();
		expect(requestBodies[0]?.max_tokens).toBe(1200);
		expect(requestBodies[0]?.response_format).toEqual({ type: 'json_object' });
	});

	it('recovers a truncated JSON response when validation allows repair', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-v2-truncated-json',
						model: AGENT_STATE_RECONCILIATION_MODEL,
						choices: [
							{
								index: 0,
								message: {
									role: 'assistant',
									content: '{"ok":true,"items":['
								},
								finish_reason: 'length'
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
				)
		);

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false,
			validation: {
				allowTruncatedJsonRecovery: true
			}
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries parse failures for a single explicit JSON model', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			const content =
				requestBodies.length === 1 ? '{"ok":' : '{"ok":true,"retrySucceeded":true}';

			return new Response(
				JSON.stringify({
					id: `chatcmpl-v2-json-retry-${requestBodies.length}`,
					model: AGENT_STATE_RECONCILIATION_MODEL,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content
							},
							finish_reason: requestBodies.length === 1 ? 'length' : 'stop'
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

		const service = createService();
		const result = await service.getJSONResponse<{
			ok: boolean;
			retrySucceeded: boolean;
		}>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});

		expect(result).toEqual({ ok: true, retrySucceeded: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies.map((body) => body.model)).toEqual([
			AGENT_STATE_RECONCILIATION_MODEL,
			AGENT_STATE_RECONCILIATION_MODEL
		]);
		expect(requestBodies[1]?.temperature).toBe(0.1);
	});

	it('retries empty content for a single explicit JSON model', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			const content = requestBodies.length === 1 ? '' : '{"ok":true,"retrySucceeded":true}';

			return new Response(
				JSON.stringify({
					id: `chatcmpl-v2-json-empty-retry-${requestBodies.length}`,
					model: AGENT_STATE_RECONCILIATION_MODEL,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content
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

		const service = createService();
		const result = await service.getJSONResponse<{
			ok: boolean;
			retrySucceeded: boolean;
		}>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});

		expect(result).toEqual({ ok: true, retrySucceeded: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies.map((body) => body.model)).toEqual([
			AGENT_STATE_RECONCILIATION_MODEL,
			AGENT_STATE_RECONCILIATION_MODEL
		]);
		expect(requestBodies[1]?.temperature).toBe(0.1);
	});

	// Tasker 103: direct Moonshot/OpenAI fallbacks bypassed ZDR and were removed.
	it.each(['json', 'text', 'stream'] as const)(
		'never leaves OpenRouter when every OpenRouter model fails (%s)',
		async (operation) => {
			vi.stubEnv('PRIVATE_MOONSHOT_API_KEY', 'moonshot-test-key');
			vi.stubEnv('PRIVATE_OPENAI_API_KEY', 'openai-test-key');
			vi.stubEnv('PRIVATE_OPENAI_CHAT_FALLBACK_MODEL', 'gpt-4o-mini');
			vi.stubEnv('OPENROUTER_V2_DIRECT_FALLBACKS_ENABLED', 'true');
			try {
				const requestUrls: string[] = [];
				const fetchMock = vi.fn(async (url: string) => {
					requestUrls.push(url);
					return new Response(JSON.stringify({ error: { message: 'unavailable' } }), {
						status: 503
					});
				});
				vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
				const service = createService();
				if (operation === 'json') {
					await expect(
						service.getJSONResponse({
							systemPrompt: 'Return JSON.',
							userPrompt: 'Respond.',
							userId: 'user-1'
						})
					).rejects.toThrow();
				} else if (operation === 'text') {
					await expect(
						service.generateTextDetailed({ prompt: 'Respond.', userId: 'user-1' })
					).rejects.toThrow();
				} else {
					const events = [];
					for await (const event of service.streamText({
						messages: [{ role: 'user', content: 'Respond.' }],
						userId: 'user-1'
					}))
						events.push(event);
					expect(events.some((event) => event.type === 'error')).toBe(true);
				}
				expect(requestUrls.length).toBeGreaterThan(0);
				for (const url of requestUrls) {
					expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
				}
			} finally {
				vi.unstubAllEnvs();
			}
		}
	);

	it('ignores the retired PRIVATE_OPENROUTER_REQUIRE_ZDR=false opt-out', async () => {
		vi.stubEnv('PRIVATE_OPENROUTER_REQUIRE_ZDR', 'false');
		try {
			const requestBodies: any[] = [];
			const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
				requestBodies.push(JSON.parse(String(init?.body)));
				return new Response(
					JSON.stringify({
						id: 'chatcmpl-zdr',
						model: DEEPSEEK_V4_FLASH_MODEL,
						choices: [
							{
								index: 0,
								message: { role: 'assistant', content: 'Hi' },
								finish_reason: 'stop'
							}
						],
						usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				);
			});
			vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
			await createService().generateTextDetailed({ prompt: 'Hi', userId: 'user-1' });
			expect(requestBodies[0]?.provider).toMatchObject({
				data_collection: 'deny',
				zdr: true
			});
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

describe('OpenRouterV2Service visible text filtering', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('strips reasoning content from non-streaming completions', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-visible-text',
						model: ACTIVE_EXPERIMENT_MODEL,
						choices: [
							{
								index: 0,
								message: {
									role: 'assistant',
									content: [
										{ type: 'reasoning', text: 'internal only' },
										{ type: 'text', text: 'Visible answer' }
									]
								},
								finish_reason: 'stop'
							}
						],
						usage: {
							prompt_tokens: 8,
							completion_tokens: 3,
							total_tokens: 11
						}
					}),
					{
						status: 200,
						headers: {
							'content-type': 'application/json'
						}
					}
				)
		);

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const result = await service.generateTextDetailed({
			systemPrompt: 'You are concise.',
			prompt: 'Answer visibly.'
		});

		expect(result.text).toBe('Visible answer');
	});

	it('logs non-streaming JSON usage with turn attribution', async () => {
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-json-usage',
						model: ACTIVE_EXPERIMENT_MODEL,
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
							prompt_tokens: 100,
							completion_tokens: 50,
							total_tokens: 150,
							prompt_tokens_details: {
								cached_tokens: 25,
								cache_write_tokens: 4
							},
							completion_tokens_details: {
								reasoning_tokens: 12
							},
							cost: 0.000123,
							is_byok: false
						}
					}),
					{
						status: 200,
						headers: {
							'content-type': 'application/json'
						}
					}
				)
		);

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			userId: '11111111-1111-4111-8111-111111111111',
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			turnRunId: '33333333-3333-4333-8333-333333333333',
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			operationType: 'agent_state_reconciliation'
		});

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(result).toEqual({ ok: true });
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			user_id: '11111111-1111-4111-8111-111111111111',
			chat_session_id: '22222222-2222-4222-8222-222222222222',
			turn_run_id: '33333333-3333-4333-8333-333333333333',
			stream_run_id: 'stream-run-1',
			client_turn_id: 'client-turn-1',
			operation_type: 'agent_state_reconciliation',
			model_used: ACTIVE_EXPERIMENT_MODEL,
			prompt_tokens: 100,
			completion_tokens: 50,
			total_tokens: 150,
			total_cost_usd: 0.000123,
			openrouter_usage_cost_usd: 0.000123,
			openrouter_byok: false,
			reasoning_tokens: 12,
			cached_prompt_tokens: 25,
			cache_write_tokens: 4,
			metadata: {
				costSource: 'openrouter_usage',
				openrouterUsageCost: 0.000123,
				reasoningTokens: 12,
				cachedPromptTokens: 25,
				cacheWriteTokens: 4
			}
		});
	});

	it('logs billed usage for an unparseable JSON attempt before retrying', async () => {
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const usageEvents: Array<Record<string, unknown>> = [];
		let calls = 0;
		const fetchMock = vi.fn(async () => {
			calls++;
			return new Response(
				JSON.stringify({
					id: `chatcmpl-json-unusable-${calls}`,
					model: AGENT_STATE_RECONCILIATION_MODEL,
					choices: [
						{
							index: 0,
							message: {
								role: 'assistant',
								content: calls === 1 ? '{"ok":' : '{"ok":true}'
							},
							finish_reason: 'stop'
						}
					],
					usage: { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48 }
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const result = await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			userId: '11111111-1111-4111-8111-111111111111',
			operationType: 'agent_state_reconciliation',
			model: AGENT_STATE_RECONCILIATION_MODEL,
			models: [AGENT_STATE_RECONCILIATION_MODEL],
			allowedModelIds: [AGENT_STATE_RECONCILIATION_MODEL],
			includeDefaultModels: false,
			validation: { retryOnParseError: true, maxRetries: 1 },
			onUsage: (event) => {
				usageEvents.push(event as unknown as Record<string, unknown>);
			}
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		// Both attempts were billed, and the rows are written before the call returns.
		expect(insertMock).toHaveBeenCalledTimes(2);
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			status: 'invalid_response',
			prompt_tokens: 40,
			completion_tokens: 8
		});
		expect(insertMock.mock.calls[1]?.[0]).toMatchObject({ status: 'success' });
		expect(usageEvents).toHaveLength(2);
	});

	it('logs billed usage when every text attempt comes back empty', async () => {
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-text-empty',
						model: AGENT_STATE_RECONCILIATION_MODEL,
						choices: [
							{
								index: 0,
								message: { role: 'assistant', content: '' },
								finish_reason: 'stop'
							}
						],
						usage: { prompt_tokens: 30, completion_tokens: 0, total_tokens: 30 }
					}),
					{ status: 200, headers: { 'content-type': 'application/json' } }
				)
		);
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		await expect(
			service.generateTextDetailed({
				prompt: 'Say something.',
				userId: '11111111-1111-4111-8111-111111111111',
				model: AGENT_STATE_RECONCILIATION_MODEL,
				models: [AGENT_STATE_RECONCILIATION_MODEL]
			} as any)
		).rejects.toThrow(/empty text content/);

		expect(insertMock).toHaveBeenCalled();
		for (const [row] of insertMock.mock.calls) {
			expect(row).toMatchObject({ status: 'invalid_response', prompt_tokens: 30 });
		}
		expect(insertMock).toHaveBeenCalledTimes(fetchMock.mock.calls.length);
	});

	it('prices provider date-suffixed model ids with the configured base model', async () => {
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-versioned-model',
						model: 'moonshotai/kimi-k2.6-20260420',
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
							prompt_tokens: 1000,
							completion_tokens: 500,
							total_tokens: 1500
						}
					}),
					{
						status: 200,
						headers: {
							'content-type': 'application/json'
						}
					}
				)
		);

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		await service.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return valid JSON.',
			userPrompt: 'Respond with {"ok":true}.',
			model: KIMI_EXPERIMENT_MODEL,
			models: [KIMI_EXPERIMENT_MODEL],
			userId: '11111111-1111-4111-8111-111111111111',
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			turnRunId: '33333333-3333-4333-8333-333333333333',
			operationType: 'agent_state_reconciliation'
		});

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			model_used: 'moonshotai/kimi-k2.6-20260420',
			metadata: {
				pricingModel: KIMI_EXPERIMENT_MODEL
			}
		});
		expect(insertMock.mock.calls[0]?.[0]?.input_cost_usd).toBeCloseTo(0.00095);
		expect(insertMock.mock.calls[0]?.[0]?.output_cost_usd).toBeCloseTo(0.002);
		expect(insertMock.mock.calls[0]?.[0]?.total_cost_usd).toBeCloseTo(0.00295);
	});

	it('suppresses streamed reasoning text while preserving reasoning token metadata', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return createSseResponse(
				[
					JSON.stringify({
						id: 'stream-visible-text',
						model: ACTIVE_EXPERIMENT_MODEL,
						choices: [
							{
								delta: {
									reasoning: 'native hidden reasoning',
									content: [
										{ type: 'reasoning', text: 'hidden reasoning' },
										{ type: 'text', text: 'Visible start' }
									]
								}
							}
						]
					}),
					JSON.stringify({
						choices: [
							{
								delta: {
									content: '<think>hidden'
								}
							}
						]
					}),
					JSON.stringify({
						choices: [
							{
								delta: {
									content: ' still hidden</think> Visible end'
								}
							}
						],
						usage: {
							prompt_tokens: 12,
							completion_tokens: 6,
							total_tokens: 18,
							completion_tokens_details: {
								reasoning_tokens: 4
							}
						}
					}),
					'[DONE]'
				],
				{
					'x-openrouter-model': ACTIVE_EXPERIMENT_MODEL
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];

		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: 'user_1'
		})) {
			events.push(event);
		}

		const streamedText = events
			.filter((event) => event.type === 'text')
			.map((event) => event.content)
			.join('');
		const reasoningEvents = events.filter((event) => event.type === 'reasoning');
		const doneEvent = events.find((event) => event.type === 'done');

		expect(streamedText).toBe('Visible start Visible end');
		expect(reasoningEvents).toHaveLength(1);
		expect(reasoningEvents[0]).toMatchObject({
			type: 'reasoning',
			reasoning: 'native hidden reasoning'
		});
		expect(doneEvent).toMatchObject({
			type: 'done',
			reasoning_tokens: 4,
			reasoningTokens: 4,
			model: ACTIVE_EXPERIMENT_MODEL
		});
		expect(requestBodies[0]?.reasoning).toEqual({ exclude: true });
		expect(requestBodies[0]?.stream_options).toEqual({ include_usage: true });
	});

	it('preserves multimodal content arrays and routes image turns to the multimodal lane', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return createSseResponse([
				JSON.stringify({
					id: 'stream-vision',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [{ delta: { content: 'I can inspect this image.' } }]
				}),
				JSON.stringify({
					choices: [{ delta: {}, finish_reason: 'stop' }],
					usage: {
						prompt_tokens: 100,
						completion_tokens: 8,
						total_tokens: 108
					}
				}),
				'[DONE]'
			]);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];

		for await (const event of service.streamText({
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Inspect this screenshot.' },
						{
							type: 'image_url',
							image_url: { url: 'https://signed.example/image.png' }
						}
					]
				}
			],
			userId: 'user_1'
		})) {
			events.push(event);
		}

		expect(events.find((event) => event.type === 'done')).toMatchObject({ type: 'done' });
		expect(requestBodies[0]?.model).toBe(OPENROUTER_V2_MULTIMODAL_MODELS[0]);
		expect(requestBodies[0]?.models).toEqual(OPENROUTER_V2_MULTIMODAL_MODELS.slice(1, 4));
		expect(requestBodies[0]?.messages[0]?.content).toEqual([
			{ type: 'text', text: 'Inspect this screenshot.' },
			{ type: 'image_url', image_url: { url: 'https://signed.example/image.png' } }
		]);
		expect(requestBodies[0]).not.toHaveProperty('temperature');
		expect(requestBodies[0]?.reasoning).toEqual({ exclude: true });
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true
		});
	});

	it('preserves tool calling while routing image turns through the multimodal lane', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return createSseResponse([
				JSON.stringify({
					id: 'stream-vision-tool',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'call_create_task',
										type: 'function',
										function: {
											name: 'create_onto_task',
											arguments: '{"title":"From image"}'
										}
									}
								]
							},
							finish_reason: 'tool_calls'
						}
					]
				}),
				JSON.stringify({
					choices: [{ delta: {}, finish_reason: 'tool_calls' }],
					usage: {
						prompt_tokens: 120,
						completion_tokens: 12,
						total_tokens: 132
					}
				}),
				'[DONE]'
			]);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];

		for await (const event of service.streamText({
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Turn the screenshot into a task.' },
						{
							type: 'image_url',
							image_url: { url: 'https://signed.example/task.png' }
						}
					]
				}
			],
			tools: [
				{
					type: 'function',
					function: {
						name: 'create_onto_task',
						description: 'Create a task.',
						parameters: {
							type: 'object',
							properties: {
								title: { type: 'string' }
							},
							required: ['title']
						}
					}
				}
			],
			tool_choice: 'auto',
			userId: 'user_1'
		})) {
			events.push(event);
		}

		const toolEvent = events.find((event) => event.type === 'tool_call');
		expect(requestBodies[0]?.model).toBe(OPENROUTER_V2_MULTIMODAL_MODELS[0]);
		expect(requestBodies[0]?.models).toEqual(OPENROUTER_V2_MULTIMODAL_MODELS.slice(1, 4));
		expect(requestBodies[0]?.messages[0]?.content).toEqual([
			{ type: 'text', text: 'Turn the screenshot into a task.' },
			{ type: 'image_url', image_url: { url: 'https://signed.example/task.png' } }
		]);
		expect(requestBodies[0]?.tools).toHaveLength(1);
		expect(requestBodies[0]?.tool_choice).toBe('auto');
		expect(requestBodies[0]).not.toHaveProperty('temperature');
		expect(requestBodies[0]?.reasoning).toEqual({ exclude: true });
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true
		});
		expect(toolEvent).toMatchObject({
			type: 'tool_call',
			tool_call: {
				id: 'call_create_task',
				type: 'function',
				function: {
					name: 'create_onto_task',
					arguments: '{"title":"From image"}'
				}
			}
		});
		expect(JSON.parse((toolEvent as any).tool_call.function.arguments)).toEqual({
			title: 'From image'
		});
	});

	it('falls back to OCR-only text when the multimodal route cannot start', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			if (requestBodies.length <= OPENROUTER_V2_MULTIMODAL_MODELS.length) {
				return new Response(
					JSON.stringify({ error: { message: 'vision route unavailable' } }),
					{ status: 400, headers: { 'content-type': 'application/json' } }
				);
			}
			return createSseResponse([
				JSON.stringify({
					id: 'stream-text-fallback',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [{ delta: { content: 'Using OCR context instead.' } }]
				}),
				JSON.stringify({
					choices: [{ delta: {}, finish_reason: 'stop' }],
					usage: {
						prompt_tokens: 50,
						completion_tokens: 5,
						total_tokens: 55
					}
				}),
				'[DONE]'
			]);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];

		for await (const event of service.streamText({
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: 'Inspect this screenshot.\nOCR: Settings' },
						{
							type: 'image_url',
							image_url: { url: 'https://signed.example/image.png' }
						}
					]
				}
			],
			userId: 'user_1'
		})) {
			events.push(event);
		}

		expect(events.some((event) => event.type === 'text')).toBe(true);
		expect(requestBodies[0]?.messages[0]?.content).toEqual([
			{ type: 'text', text: 'Inspect this screenshot.\nOCR: Settings' },
			{ type: 'image_url', image_url: { url: 'https://signed.example/image.png' } }
		]);
		const textFallbackBody = requestBodies[OPENROUTER_V2_MULTIMODAL_MODELS.length];
		expect(textFallbackBody?.messages[0]?.content).toBe(
			'Inspect this screenshot.\nOCR: Settings'
		);
		expect(textFallbackBody?.reasoning).toEqual({ exclude: true });
	});

	it('uses the refreshed tool-calling fallback route for profiled streams', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return createSseResponse([
				JSON.stringify({
					id: 'stream-tool-profile',
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [{ delta: { content: 'Tool-ready answer' } }]
				}),
				JSON.stringify({
					choices: [{ delta: {}, finish_reason: 'stop' }],
					usage: {
						prompt_tokens: 12,
						completion_tokens: 3,
						total_tokens: 15
					}
				}),
				'[DONE]'
			]);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];

		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			tools: [
				{
					type: 'function',
					function: {
						name: 'lookup_project',
						description: 'Lookup a project.',
						parameters: { type: 'object', properties: {} }
					}
				}
			],
			tool_choice: 'auto',
			userId: 'user_1',
			profile: 'balanced'
		})) {
			events.push(event);
		}

		expect(events.find((event) => event.type === 'done')).toMatchObject({
			type: 'done'
		});
		expect(requestBodies[0]?.model).toBe(OPENROUTER_V2_TOOL_MODELS[0]);
		expect(requestBodies[0]?.models).toEqual(OPENROUTER_V2_TOOL_MODELS.slice(1, 4));
		expect(requestBodies[0]?.tools).toHaveLength(1);
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'low', exclude: false });
		expect(requestBodies[0]?.provider).toEqual({
			allow_fallbacks: true,
			require_parameters: true,
			data_collection: 'deny',
			zdr: true,
			order: [...DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER]
		});
	});

	it('applies a request-scoped provider exclusion and reports the normalized provider slug', async () => {
		const requestBodies: any[] = [];
		const routeObservations: unknown[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return createSseResponse(
				[
					JSON.stringify({
						id: 'stream-synthesis-route',
						model: DEEPSEEK_V4_FLASH_MODEL,
						choices: [{ delta: { content: 'Synthesis answer' } }]
					}),
					JSON.stringify({
						provider: 'DigitalOcean',
						choices: [{ delta: {}, finish_reason: 'stop' }],
						openrouter_metadata: {
							strategy: 'fallback',
							summary: 'available=3, selected=DigitalOcean',
							attempt: 3
						},
						usage: { prompt_tokens: 20, completion_tokens: 4, total_tokens: 24 }
					}),
					'[DONE]'
				],
				{ 'x-openrouter-provider': 'DigitalOcean' }
			);
		});
		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createService();
		const events = [];
		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'Synthesize the evidence.' }],
			userId: 'user_1',
			models: [DEEPSEEK_V4_FLASH_MODEL],
			providerRouting: { ignore: ['DigitalOcean'] },
			onRouteObserved: (observation) => {
				routeObservations.push(observation);
			},
			maxTokens: 6000
		})) {
			events.push(event);
		}

		expect(requestBodies[0]).toMatchObject({
			model: DEEPSEEK_V4_FLASH_MODEL,
			max_tokens: 6000,
			provider: {
				allow_fallbacks: true,
				data_collection: 'deny',
				zdr: true,
				order: [...DEEPSEEK_V4_FLASH_ZDR_PROVIDER_ORDER],
				ignore: ['digitalocean']
			}
		});
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			type: 'done',
			provider: 'DigitalOcean',
			provider_raw: 'DigitalOcean',
			provider_slug: 'digitalocean'
		});
		expect(routeObservations.at(-1)).toMatchObject({
			model: DEEPSEEK_V4_FLASH_MODEL,
			provider: 'DigitalOcean',
			provider_slug: 'digitalocean',
			request_id: 'stream-synthesis-route',
			router_metadata: {
				strategy: 'fallback',
				attempt: 3
			}
		});
	});

	it('logs streaming usage against the active request model and resolved provider', async () => {
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return createSseResponse(
				[
					JSON.stringify({
						id: 'stream-qwen',
						model: ACTIVE_EXPERIMENT_MODEL,
						choices: [
							{
								delta: {
									content: 'Qwen answer'
								}
							}
						]
					}),
					JSON.stringify({
						choices: [{ delta: {}, finish_reason: 'stop' }],
						usage: {
							prompt_tokens: 20,
							completion_tokens: 5,
							total_tokens: 25
						}
					}),
					'[DONE]'
				],
				{
					'x-openrouter-model': ACTIVE_EXPERIMENT_MODEL,
					'x-openrouter-provider': 'qwen',
					'x-openrouter-request-id': 'stream-qwen-request'
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const events = [];

		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: '11111111-1111-4111-8111-111111111111',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL, DEEPSEEK_V4_FLASH_MODEL, GEMINI_31_FLASH_LITE_MODEL],
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			turnRunId: '33333333-3333-4333-8333-333333333333',
			streamRunId: 'stream-run-fallback',
			clientTurnId: 'client-turn-fallback',
			operationType: 'agentic_chat_v2_stream'
		})) {
			events.push(event);
		}

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(requestBodies[0]?.model).toBe(ACTIVE_EXPERIMENT_MODEL);
		expect(requestBodies[0]?.models).toEqual([
			DEEPSEEK_V4_FLASH_MODEL,
			GEMINI_31_FLASH_LITE_MODEL,
			GPT_6_LUNA_MODEL
		]);
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			type: 'done',
			model: ACTIVE_EXPERIMENT_MODEL,
			provider: 'qwen'
		});
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			model_requested: ACTIVE_EXPERIMENT_MODEL,
			model_used: ACTIVE_EXPERIMENT_MODEL,
			provider: 'qwen',
			streaming: true,
			openrouter_request_id: 'stream-qwen',
			prompt_tokens: 20,
			completion_tokens: 5,
			total_tokens: 25
		});
		expect(insertMock.mock.calls[0]?.[0]?.metadata).toMatchObject({
			modelRequested: ACTIVE_EXPERIMENT_MODEL,
			modelsAttempted: expect.arrayContaining([ACTIVE_EXPERIMENT_MODEL]),
			attempts: 1
		});
	});

	it('logs a failure usage row with the real usage frame when the stream errors mid-flight', async () => {
		// D10: abort/error is a normal end state for chat turns and must still record
		// token usage — billing credits are computed from llm_usage_logs.
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const encoder = new TextEncoder();
		const fetchMock = vi.fn(async () => {
			let stage = 0;
			const stream = new ReadableStream({
				// pull so the chunk is delivered before the error; error() in start()
				// would reset the queue and discard the pending chunk.
				pull(controller) {
					if (stage === 0) {
						stage = 1;
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									id: 'stream-fail',
									model: ACTIVE_EXPERIMENT_MODEL,
									choices: [{ delta: { content: 'Partial answer' } }],
									usage: {
										prompt_tokens: 20,
										completion_tokens: 5,
										total_tokens: 25
									}
								})}\n\n`
							)
						);
						return;
					}
					controller.error(new Error('upstream exploded'));
				}
			});
			return new Response(stream, {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			});
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const events = [];
		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: '11111111-1111-4111-8111-111111111111',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL],
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			operationType: 'agentic_chat_v2_stream'
		})) {
			events.push(event);
		}

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(events.some((event) => event.type === 'error')).toBe(true);
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			status: 'failure',
			error_message: 'upstream exploded',
			streaming: true,
			prompt_tokens: 20,
			completion_tokens: 5,
			total_tokens: 25
		});
	});

	it('estimates token usage on a failed stream when no usage frame arrived', async () => {
		// D10: when the provider never sent a usage frame, fall back to a char/4 estimate
		// so cancelled/errored turns are still billed rather than undercounted at zero.
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const encoder = new TextEncoder();
		const fetchMock = vi.fn(async () => {
			let stage = 0;
			const stream = new ReadableStream({
				pull(controller) {
					if (stage === 0) {
						stage = 1;
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									id: 'stream-fail-nousage',
									model: ACTIVE_EXPERIMENT_MODEL,
									choices: [{ delta: { content: 'Partial answer' } }]
								})}\n\n`
							)
						);
						return;
					}
					controller.error(new Error('boom'));
				}
			});
			return new Response(stream, {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			});
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const events = [];
		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: '11111111-1111-4111-8111-111111111111',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL],
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			operationType: 'agentic_chat_v2_stream'
		})) {
			events.push(event);
		}

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		const logged = insertMock.mock.calls[0]?.[0];
		expect(logged?.status).toBe('failure');
		expect(logged?.error_message).toBe('boom');
		// char/4 estimate from emitted text ('Partial answer' -> 4) + prompt ('hello' -> 2).
		expect(logged?.completion_tokens).toBeGreaterThan(0);
		expect(logged?.prompt_tokens).toBeGreaterThan(0);
	});

	it('surfaces a mid-stream OpenRouter error frame as an error event (D11)', async () => {
		// D11: an upstream `{ error }` frame has no `choices`, so it used to be
		// silently skipped and the stream ended as a successful `done`, shipping the
		// truncated buffer as a complete answer. It must now surface as an error.
		const insertMock = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
		const routeObservations: unknown[] = [];
		const encoder = new TextEncoder();
		const fetchMock = vi.fn(async () => {
			let stage = 0;
			const stream = new ReadableStream({
				pull(controller) {
					if (stage === 0) {
						stage = 1;
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									id: 'stream-errframe',
									model: ACTIVE_EXPERIMENT_MODEL,
									choices: [{ delta: { content: 'Partial answer' } }]
								})}\n\n`
							)
						);
						return;
					}
					if (stage === 1) {
						stage = 2;
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({
									openrouter_metadata: {
										strategy: 'fallback',
										attempt: 2,
										attempts: [
											{
												provider: 'DigitalOcean',
												model: ACTIVE_EXPERIMENT_MODEL,
												status: 429
											}
										]
									},
									error: { message: 'upstream rate limited', code: 429 }
								})}\n\n`
							)
						);
						return;
					}
					controller.close();
				}
			});
			return new Response(stream, {
				status: 200,
				headers: { 'content-type': 'text/event-stream' }
			});
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const events = [];
		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: '11111111-1111-4111-8111-111111111111',
			model: ACTIVE_EXPERIMENT_MODEL,
			models: [ACTIVE_EXPERIMENT_MODEL],
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			operationType: 'agentic_chat_v2_stream',
			onRouteObserved: (observation) => {
				routeObservations.push(observation);
			}
		})) {
			events.push(event);
		}

		const errorEvent = events.find((event) => event.type === 'error') as
			| { type: 'error'; error?: string }
			| undefined;
		expect(errorEvent).toBeDefined();
		expect(errorEvent?.error).toContain('upstream rate limited');
		// It must NOT terminate as a successful done.
		expect(events.some((event) => event.type === 'done')).toBe(false);
		expect(routeObservations.at(-1)).toMatchObject({
			model: ACTIVE_EXPERIMENT_MODEL,
			provider: 'DigitalOcean',
			provider_slug: 'digitalocean',
			router_metadata: {
				strategy: 'fallback',
				attempt: 2,
				lastAttemptProvider: 'DigitalOcean',
				lastAttemptStatus: 429
			}
		});
		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(insertMock.mock.calls[0]![0]).toMatchObject({ status: 'failure' });
	});
});
