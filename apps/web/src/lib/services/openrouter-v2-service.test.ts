// apps/web/src/lib/services/openrouter-v2-service.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

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
								'Qwen 3.6 Plus is temporarily unavailable from the upstream provider.'
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
					model: 'deepseek/deepseek-v3.2',
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
			userPrompt: 'Respond with {"ok":true}.'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe('qwen/qwen3.6-plus');
		expect(requestBodies[0]?.models).toEqual([
			'deepseek/deepseek-v3.2',
			'openai/gpt-oss-120b',
			'openai/gpt-4.1-nano'
		]);
		expect(requestBodies[1]?.model).toBe('deepseek/deepseek-v3.2');
	});

	it('honors JSON profile hints before JSON lane defaults', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return new Response(
				JSON.stringify({
					id: 'chatcmpl-v2-profile',
					model: 'qwen/qwen3.5-flash-02-23',
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
		expect(requestBodies[0]?.model).toBe('qwen/qwen3.5-flash-02-23');
		expect(requestBodies[0]?.response_format).toEqual({ type: 'json_object' });
		expect(requestBodies[0]?.models).toContain('openai/gpt-4.1-nano');
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
						model: 'x-ai/grok-4.1-fast',
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
		const insertMock = vi.fn(async () => ({ error: null }));
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-json-usage',
						model: 'qwen/qwen3.6-plus',
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
							total_tokens: 150
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
			model_used: 'qwen/qwen3.6-plus',
			prompt_tokens: 100,
			completion_tokens: 50,
			total_tokens: 150
		});
	});

	it('prices provider date-suffixed model ids with the configured base model', async () => {
		const insertMock = vi.fn(async () => ({ error: null }));
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						id: 'chatcmpl-versioned-model',
						model: 'deepseek/deepseek-v3.2-20251201',
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
			model: 'deepseek/deepseek-v3.2',
			models: ['deepseek/deepseek-v3.2'],
			userId: '11111111-1111-4111-8111-111111111111',
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			turnRunId: '33333333-3333-4333-8333-333333333333',
			operationType: 'agent_state_reconciliation'
		});

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			model_used: 'deepseek/deepseek-v3.2-20251201',
			metadata: {
				pricingModel: 'deepseek/deepseek-v3.2'
			}
		});
		expect(insertMock.mock.calls[0]?.[0]?.input_cost_usd).toBeCloseTo(0.00026);
		expect(insertMock.mock.calls[0]?.[0]?.output_cost_usd).toBeCloseTo(0.00019);
		expect(insertMock.mock.calls[0]?.[0]?.total_cost_usd).toBeCloseTo(0.00045);
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
						model: 'x-ai/grok-4.1-fast',
						choices: [
							{
								delta: {
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
					'x-openrouter-model': 'x-ai/grok-4.1-fast'
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
		const doneEvent = events.find((event) => event.type === 'done');

		expect(streamedText).toBe('Visible start Visible end');
		expect(doneEvent).toMatchObject({
			type: 'done',
			reasoning_tokens: 4,
			reasoningTokens: 4,
			model: 'x-ai/grok-4.1-fast'
		});
		expect(requestBodies[0]?.stream_options).toEqual({ include_usage: true });
	});

	it('logs streaming usage against the started fallback request model and resolved provider', async () => {
		const insertMock = vi.fn(async () => ({ error: null }));
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message: 'Primary model is temporarily rate-limited.'
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

			return createSseResponse(
				[
					JSON.stringify({
						id: 'stream-fallback',
						model: 'deepseek/deepseek-v3.2',
						choices: [
							{
								delta: {
									content: 'Fallback answer'
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
					'x-openrouter-model': 'deepseek/deepseek-v3.2',
					'x-openrouter-provider': 'resolved-openrouter-provider',
					'x-openrouter-request-id': 'stream-fallback-request'
				}
			);
		});

		vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

		const service = createServiceWithUsageLogger(insertMock);
		const events = [];

		for await (const event of service.streamText({
			messages: [{ role: 'user', content: 'hello' }],
			userId: '11111111-1111-4111-8111-111111111111',
			model: 'qwen/qwen3.6-plus',
			models: ['qwen/qwen3.6-plus', 'deepseek/deepseek-v3.2'],
			chatSessionId: '22222222-2222-4222-8222-222222222222',
			turnRunId: '33333333-3333-4333-8333-333333333333',
			streamRunId: 'stream-run-fallback',
			clientTurnId: 'client-turn-fallback',
			operationType: 'agentic_chat_v2_stream'
		})) {
			events.push(event);
		}

		await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe('qwen/qwen3.6-plus');
		expect(requestBodies[0]?.models).toContain('deepseek/deepseek-v3.2');
		expect(requestBodies[1]?.model).toBe('deepseek/deepseek-v3.2');
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			type: 'done',
			model: 'deepseek/deepseek-v3.2',
			provider: 'resolved-openrouter-provider'
		});
		expect(insertMock.mock.calls[0]?.[0]).toMatchObject({
			model_requested: 'deepseek/deepseek-v3.2',
			model_used: 'deepseek/deepseek-v3.2',
			provider: 'resolved-openrouter-provider',
			streaming: true,
			openrouter_request_id: 'stream-fallback',
			prompt_tokens: 20,
			completion_tokens: 5,
			total_tokens: 25
		});
		expect(insertMock.mock.calls[0]?.[0]?.metadata).toMatchObject({
			modelRequested: 'deepseek/deepseek-v3.2',
			modelsAttempted: expect.arrayContaining(['deepseek/deepseek-v3.2']),
			attempts: 2
		});
	});
});
