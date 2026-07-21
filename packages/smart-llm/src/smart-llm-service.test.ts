// packages/smart-llm/src/smart-llm-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SmartLLMService } from './smart-llm-service';
import {
	ACTIVE_EXPERIMENT_MODEL,
	DEEPSEEK_V4_FLASH_MODEL,
	GLM_52_MODEL,
	KIMI_K3_MODEL,
	TENCENT_HY3_MODEL,
	XIAOMI_MIMO_V25_MODEL
} from './model-config';

function buildSSE(payloads: string[], headers?: Record<string, string>): Response {
	const encoder = new TextEncoder();
	const body = payloads.map((payload) => `data: ${payload}\n\n`).join('');
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(body));
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

function buildJSONCompletion(params: {
	model: string;
	content: string | null;
	finishReason?: string;
	provider?: string;
	cost?: number;
}): Response {
	return new Response(
		JSON.stringify({
			id: `completion-${params.model}`,
			model: params.model,
			provider: params.provider,
			choices: [
				{
					message: { role: 'assistant', content: params.content },
					finish_reason: params.finishReason ?? 'stop'
				}
			],
			usage: {
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				...(params.cost === undefined ? {} : { cost: params.cost })
			}
		}),
		{
			status: 200,
			headers: { 'content-type': 'application/json' }
		}
	);
}

function createToolDefs(): Array<{
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}> {
	return [
		{
			type: 'function',
			function: {
				name: 'tool_schema',
				description: 'Load a BuildOS tool schema',
				parameters: {
					type: 'object',
					properties: {
						op: { type: 'string' }
					},
					required: ['op']
				}
			}
		},
		{
			type: 'function',
			function: {
				name: 'update_onto_task',
				description: 'Update a task',
				parameters: {
					type: 'object',
					properties: {
						task_id: { type: 'string' },
						description: { type: 'string' }
					},
					required: ['task_id']
				}
			}
		}
	];
}

describe('SmartLLMService streamText Moonshot tool handling', () => {
	it('captures include_usage chunks that arrive with empty choices', async () => {
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const fetchMock = vi.fn(async () =>
			buildSSE([
				JSON.stringify({
					id: 'chatcmpl-usage',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							index: 0,
							delta: { content: 'Hello' },
							finish_reason: null
						}
					],
					usage: null
				}),
				JSON.stringify({
					id: 'chatcmpl-usage',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							index: 0,
							delta: {},
							finish_reason: 'stop'
						}
					],
					usage: null
				}),
				JSON.stringify({
					id: 'chatcmpl-usage',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [],
					usage: {
						prompt_tokens: 11,
						completion_tokens: 2,
						total_tokens: 13,
						completion_tokens_details: {
							reasoning_tokens: 0
						}
					}
				}),
				'[DONE]'
			])
		);

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		const events: Array<{ type: string; [key: string]: unknown }> = [];
		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'Say hello.' }],
			userId: 'user-usage',
			sessionId: 'session-usage',
			chatSessionId: 'chat-usage',
			operationType: 'test_stream'
		})) {
			events.push(event);
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		const doneEvent = events.find((event) => event.type === 'done') as any;
		expect(doneEvent?.usage).toMatchObject({
			prompt_tokens: 11,
			completion_tokens: 2,
			total_tokens: 13
		});
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				promptTokens: 11,
				completionTokens: 2,
				totalTokens: 13,
				status: 'success',
				streaming: true
			})
		);

		// D9 cache affinity: the OpenRouter streaming body must carry the session
		// as session_id + prompt_cache_key so multi-pass turns hit the provider
		// prompt-prefix cache. chatSessionId wins over sessionId.
		const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(requestBody.session_id).toBe('chat-usage');
		expect(requestBody.prompt_cache_key).toBe('chat-usage');
	});

	it('omits cache-affinity keys from the streaming body when no session id is supplied', async () => {
		const fetchMock = vi.fn(async () =>
			buildSSE([
				JSON.stringify({
					id: 'chatcmpl-nosession',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }],
					usage: null
				}),
				'[DONE]'
			])
		);

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'Say hi.' }],
			userId: 'user-nosession',
			operationType: 'test_stream'
		})) {
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
		expect(Object.keys(requestBody)).not.toContain('session_id');
		expect(Object.keys(requestBody)).not.toContain('prompt_cache_key');
	});

	it('does not emit partial pending tool calls when stream finishes with stop', async () => {
		const fetchMock = vi.fn(async () =>
			buildSSE([
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'update_onto_task:0',
										type: 'function',
										function: { name: 'update_onto_task', arguments: '' }
									}
								]
							},
							finish_reason: null
						}
					]
				}),
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: { content: 'Let me check that.' },
							finish_reason: 'stop'
						}
					]
				}),
				'[DONE]'
			])
		);

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		const events: Array<{ type: string; [key: string]: unknown }> = [];
		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'What projects do I have?' }],
			tools: createToolDefs(),
			tool_choice: 'auto',
			userId: 'user-1',
			sessionId: 'session-1',
			chatSessionId: 'chat-1',
			operationType: 'test_stream'
		})) {
			events.push(event);
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		expect(events.some((event) => event.type === 'tool_call')).toBe(false);
		expect(events.some((event) => event.type === 'text')).toBe(true);
		const doneEvent = events.find((event) => event.type === 'done');
		expect(doneEvent).toBeDefined();
		expect(doneEvent?.finished_reason).toBe('stop');
	});

	it('preserves malformed tool_call arguments for downstream validation when finish_reason is tool_calls', async () => {
		const fetchMock = vi.fn(async () =>
			buildSSE([
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'update_onto_task:0',
										type: 'function',
										function: {
											name: 'update_onto_task',
											arguments: '{"task_id":"abc","description":"done"'
										}
									}
								]
							},
							finish_reason: 'tool_calls'
						}
					]
				}),
				'[DONE]'
			])
		);

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		const events: Array<{ type: string; [key: string]: unknown }> = [];
		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'Update this task.' }],
			tools: createToolDefs(),
			tool_choice: 'auto',
			userId: 'user-1',
			sessionId: 'session-3',
			chatSessionId: 'chat-3',
			operationType: 'test_stream'
		})) {
			events.push(event);
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		const toolEvent = events.find((event) => event.type === 'tool_call');
		expect(toolEvent).toBeDefined();
		const args = (toolEvent as any)?.tool_call?.function?.arguments;
		expect(typeof args).toBe('string');
		expect(args).not.toBe('{}');
		expect(args).toContain('"task_id":"abc"');
	});

	it('preserves malformed assistant tool_call args when replaying history to the model', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return buildSSE([
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: { content: 'Retrying with corrected args.' },
							finish_reason: 'stop'
						}
					]
				}),
				'[DONE]'
			]);
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		const malformedArgs = '{"task_id":"abc","description":"done"';
		const messages = [
			{ role: 'system', content: 'You are helpful.' },
			{ role: 'user', content: 'Update that task.' },
			{
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'update_onto_task:0',
						type: 'function',
						function: {
							name: 'update_onto_task',
							arguments: malformedArgs
						}
					}
				]
			},
			{
				role: 'tool',
				tool_call_id: 'update_onto_task:0',
				content: JSON.stringify({
					error: 'Tool validation failed: Invalid JSON in tool arguments'
				})
			}
		];

		for await (const event of llm.streamText({
			messages,
			tools: createToolDefs(),
			tool_choice: 'auto',
			userId: 'user-1',
			sessionId: 'session-4',
			chatSessionId: 'chat-4',
			operationType: 'test_stream'
		})) {
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		expect(requestBodies.length).toBeGreaterThan(0);
		const outboundAssistant = (requestBodies[0].messages as Array<Record<string, any>>).find(
			(message) =>
				message.role === 'assistant' &&
				Array.isArray(message.tool_calls) &&
				message.tool_calls.length > 0
		);
		expect(outboundAssistant).toBeDefined();
		const outboundArgs = outboundAssistant?.tool_calls?.[0]?.function?.arguments;
		expect(typeof outboundArgs).toBe('string');
		expect(outboundArgs).toContain('"task_id":"abc"');
		expect(outboundArgs).not.toBe('{}');
	});

	it('injects non-empty reasoning_content for assistant tool-call history', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return buildSSE([
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: { content: 'Done.' },
							finish_reason: 'stop'
						}
					]
				}),
				'[DONE]'
			]);
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		const messages = [
			{ role: 'system', content: 'You are helpful.' },
			{ role: 'user', content: 'What projects do I have?' },
			{
				role: 'assistant',
				content: '',
				reasoning_content: '',
				tool_calls: [
					{
						id: 'tool_schema:0',
						type: 'function',
						function: {
							name: 'tool_schema',
							arguments: JSON.stringify({})
						}
					}
				]
			},
			{
				role: 'tool',
				tool_call_id: 'tool_schema:0',
				content: JSON.stringify({
					error: 'Tool validation failed: Missing required parameter: op'
				})
			}
		];

		for await (const event of llm.streamText({
			messages,
			tools: createToolDefs(),
			tool_choice: 'auto',
			userId: 'user-1',
			sessionId: 'session-2',
			chatSessionId: 'chat-2',
			operationType: 'test_stream'
		})) {
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		expect(requestBodies.length).toBeGreaterThan(0);
		const firstRequest = requestBodies[0];
		const assistantMessage = (firstRequest.messages as Array<Record<string, unknown>>).find(
			(message) =>
				message.role === 'assistant' &&
				Array.isArray(message.tool_calls) &&
				message.tool_calls.length > 0
		);

		expect(assistantMessage).toBeDefined();
		expect(typeof assistantMessage?.reasoning_content).toBe('string');
		const routedModel = String(firstRequest?.model || '');
		if (routedModel.startsWith('moonshotai/kimi')) {
			expect((assistantMessage?.reasoning_content as string).trim().length).toBeGreaterThan(
				0
			);
		}
	});

	it('uses Kimi through OpenRouter for tool calls when Moonshot direct routing is enabled', async () => {
		const requestBodies: any[] = [];
		const requestUrls: string[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestUrls.push(_url);
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return buildSSE([
				JSON.stringify({
					id: 'chatcmpl-test',
					object: 'chat.completion.chunk',
					created: 0,
					model: 'kimi-k2.6',
					choices: [
						{
							index: 0,
							delta: { content: 'Done.' },
							finish_reason: 'stop'
						}
					]
				}),
				'[DONE]'
			]);
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'Check my tasks and update the plan.' }],
			tools: createToolDefs(),
			tool_choice: 'auto',
			profile: 'balanced',
			userId: 'user-1',
			sessionId: 'session-5',
			chatSessionId: 'chat-5',
			operationType: 'test_stream'
		})) {
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		expect(requestBodies.length).toBeGreaterThan(0);
		expect(requestUrls[0]).toContain('openrouter.ai/api/v1/chat/completions');
		expect(requestBodies[0]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'low', exclude: false });
	});

	it('keeps the explicit K3 maximum profile on OpenRouter with fixed request parameters', async () => {
		const requestBodies: any[] = [];
		const requestUrls: string[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestUrls.push(_url);
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			return buildJSONCompletion({
				model: KIMI_K3_MODEL,
				content: 'Done.',
				provider: 'Moonshot AI'
			});
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			moonshot: {
				apiKey: 'moonshot-test-key',
				routeKimiModelsDirect: true
			},
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.generateTextDetailed({
			prompt: 'Do the hardest available analysis.',
			profile: 'maximum',
			userId: 'user-1',
			temperature: 0.2
		});

		expect(result.text).toBe('Done.');
		expect(requestUrls[0]).toContain('openrouter.ai/api/v1/chat/completions');
		expect(requestBodies[0]?.model).toBe(KIMI_K3_MODEL);
		expect(requestBodies[0]).not.toHaveProperty('temperature');
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'max', exclude: false });
	});
});

describe('SmartLLMService model failover', () => {
	it('forwards explicit reasoning effort for non-streaming JSON requests', async () => {
		const requestBodies: any[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}
			return buildJSONCompletion({
				model: GLM_52_MODEL,
				content: '{"ok":true}',
				provider: 'Z.AI'
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Analyze this carefully.',
			profile: 'powerful',
			reasoning: { effort: 'high', exclude: false },
			userId: 'user-1'
		});

		expect(result).toEqual({ ok: true });
		expect(requestBodies[0]?.model).toBe(GLM_52_MODEL);
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'high', exclude: false });
	});

	it('fails over from the primary text model to the next text fallback', async () => {
		const requestBodies: any[] = [];
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			if (typeof init?.body === 'string') {
				requestBodies.push(JSON.parse(init.body));
			}

			if (requestBodies.length === 1) {
				return new Response(
					JSON.stringify({
						error: {
							message: `Model ${DEEPSEEK_V4_FLASH_MODEL} is no longer available.`
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

			return buildSSE([
				JSON.stringify({
					id: 'chatcmpl-fallback',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							index: 0,
							delta: { content: 'Hello' },
							finish_reason: null
						}
					],
					usage: null
				}),
				JSON.stringify({
					id: 'chatcmpl-fallback',
					object: 'chat.completion.chunk',
					created: 0,
					model: ACTIVE_EXPERIMENT_MODEL,
					choices: [
						{
							index: 0,
							delta: {},
							finish_reason: 'stop'
						}
					],
					usage: {
						prompt_tokens: 3,
						completion_tokens: 1,
						total_tokens: 4
					}
				}),
				'[DONE]'
			]);
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		const events: Array<{ type: string; [key: string]: unknown }> = [];
		for await (const event of llm.streamText({
			messages: [{ role: 'user', content: 'Say hello.' }],
			profile: 'balanced',
			userId: 'user-1',
			sessionId: 'session-fallback',
			chatSessionId: 'chat-fallback',
			operationType: 'test_stream'
		})) {
			events.push(event);
			if (event.type === 'done' || event.type === 'error') {
				break;
			}
		}

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[1]?.model).toBe(TENCENT_HY3_MODEL);
		expect(events.some((event) => event.type === 'error')).toBe(false);
		expect(events.some((event) => event.type === 'text')).toBe(true);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				modelRequested: TENCENT_HY3_MODEL,
				modelUsed: ACTIVE_EXPERIMENT_MODEL,
				status: 'success',
				streaming: true
			})
		);
	});
});

describe('SmartLLMService JSON model recovery', () => {
	it('uses one priced attempt with a bounded output when a spend limit is supplied', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const dispatchOrder: string[] = [];
		const onUsage = vi.fn();
		const onSpendReservation = vi.fn(async () => {
			dispatchOrder.push('reserved');
		});
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			dispatchOrder.push('fetch');
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requestBodies.push(body);
			return buildJSONCompletion({
				model: GLM_52_MODEL,
				content: 'not valid JSON',
				provider: 'Z.AI',
				cost: 0.003
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Analyze within the reserved envelope.',
				userId: 'user-budgeted-json',
				profile: 'powerful',
				maxTokens: 100_000,
				spendLimit: { maxCostUsd: 0.01, minOutputTokens: 128 },
				validation: { retryOnParseError: true, maxRetries: 5 },
				onSpendReservation,
				onUsage
			})
		).rejects.toThrow();

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(dispatchOrder).toEqual(['reserved', 'fetch']);
		expect(onSpendReservation).toHaveBeenCalledWith(
			expect.objectContaining({
				model: GLM_52_MODEL,
				maxTokens: expect.any(Number),
				estimatedInputTokens: expect.any(Number),
				reservedCostUsd: expect.any(Number)
			})
		);
		expect(requestBodies[0]?.model).toBe(GLM_52_MODEL);
		expect(requestBodies[0]).not.toHaveProperty('models');
		expect(requestBodies[0]?.max_tokens).toEqual(expect.any(Number));
		expect(requestBodies[0]?.max_tokens).toBeLessThan(100_000);
		expect(requestBodies[0]?.provider).toMatchObject({
			max_price: expect.objectContaining({
				prompt: expect.any(Number),
				completion: expect.any(Number),
				request: 0
			})
		});
		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				model: GLM_52_MODEL,
				totalTokens: 15,
				totalCost: expect.any(Number)
			})
		);
		expect(onUsage.mock.calls[0]?.[0]?.totalCost).toBe(0.003);
		expect(onUsage.mock.calls[0]?.[0]?.costSource).toBe('provider_reported');
	});

	it('does not dispatch a strict request when durable reservation fails', async () => {
		const fetchMock = vi.fn();
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Do not dispatch without a reservation.',
				userId: 'user-budget-reservation-failure',
				profile: 'powerful',
				spendLimit: { maxCostUsd: 0.01 },
				onSpendReservation: async () => {
					throw new Error('ledger unavailable');
				}
			})
		).rejects.toThrow('ledger unavailable');

		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('charges the reservation when a strict-budget response is lost', async () => {
		const onUsage = vi.fn();
		const fetchMock = vi.fn(async () => {
			return new Response(JSON.stringify({ error: { message: 'upstream timeout' } }), {
				status: 504,
				headers: {
					'content-type': 'application/json',
					'x-generation-id': 'gen-lost-response'
				}
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Use one bounded attempt.',
				userId: 'user-lost-response',
				profile: 'powerful',
				spendLimit: { maxCostUsd: 0.01 },
				onUsage
			})
		).rejects.toThrow();

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage.mock.calls[0]?.[0]?.totalCost).toBeGreaterThan(0);
		expect(onUsage.mock.calls[0]?.[0]?.totalCost).toBeLessThanOrEqual(0.01);
		expect(onUsage.mock.calls[0]?.[0]?.costSource).toBe('reservation');
		expect(onUsage.mock.calls[0]?.[0]?.providerRequestId).toBe('gen-lost-response');
	});

	it('settles a budgeted call to the spend-plan reservation when a 200 response omits usage', async () => {
		const onUsage = vi.fn();
		const onSpendReservation = vi.fn(async () => {});
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					id: 'completion-no-usage-budgeted',
					model: GLM_52_MODEL,
					provider: 'Z.AI',
					choices: [
						{
							message: { role: 'assistant', content: '{"result":"ok"}' },
							finish_reason: 'stop'
						}
					]
					// usage intentionally omitted — a 200 without usage is not proof the call was free.
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ result: string }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Analyze within the reserved envelope.',
			userId: 'user-budgeted-no-usage',
			profile: 'powerful',
			spendLimit: { maxCostUsd: 0.01 },
			onSpendReservation,
			onUsage
		});

		expect(result).toEqual({ result: 'ok' });
		expect(onSpendReservation).toHaveBeenCalledOnce();
		const reservedCostUsd = onSpendReservation.mock.calls[0]?.[0]?.reservedCostUsd as number;
		expect(reservedCostUsd).toEqual(expect.any(Number));

		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				costSource: 'reservation',
				totalCost: reservedCostUsd,
				inputCost: reservedCostUsd,
				outputCost: 0
			})
		);
	});

	it('keeps reporting the $0 catalog estimate for unbudgeted calls when a 200 response omits usage', async () => {
		const onUsage = vi.fn();
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					id: 'completion-no-usage-unbudgeted',
					model: GLM_52_MODEL,
					provider: 'Z.AI',
					choices: [
						{
							message: { role: 'assistant', content: '{"result":"ok"}' },
							finish_reason: 'stop'
						}
					]
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ result: string }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'No spend limit, no usage object.',
			userId: 'user-unbudgeted-no-usage',
			profile: 'powerful',
			onUsage
		});

		expect(result).toEqual({ result: 'ok' });
		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				costSource: 'catalog_estimate',
				totalCost: 0,
				inputCost: 0,
				outputCost: 0
			})
		);
	});

	it('keeps an explicitly requested model first and retains profile fallbacks', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const errorLogger = {
			logAPIError: vi.fn(async () => undefined)
		};
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requestBodies.push(body);

			if (requestBodies.length === 1) {
				return buildJSONCompletion({
					model: 'custom/json-model',
					content: null,
					finishReason: 'error',
					provider: 'CustomProvider'
				});
			}

			return buildJSONCompletion({
				model: DEEPSEEK_V4_FLASH_MODEL,
				content: '{"ok":true}',
				provider: 'DeepSeek'
			});
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			errorLogger,
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Confirm the request.',
			userId: 'user-json-fallback',
			model: 'custom/json-model'
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(requestBodies[0]?.model).toBe('custom/json-model');
		expect(requestBodies[1]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
		expect(errorLogger.logAPIError).not.toHaveBeenCalled();
	});

	it('does not report a recoverable parse retry as a terminal incident', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const errorLogger = {
			logAPIError: vi.fn(async () => undefined)
		};
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
			requestBodies.push(body);

			if (requestBodies.length === 1) {
				return buildJSONCompletion({
					model: DEEPSEEK_V4_FLASH_MODEL,
					content: 'not valid JSON',
					provider: 'DeepSeek'
				});
			}

			if (requestBodies.length === 2) {
				return buildJSONCompletion({
					model: ACTIVE_EXPERIMENT_MODEL,
					content: null,
					finishReason: 'error',
					provider: 'Alibaba'
				});
			}

			return buildJSONCompletion({
				model: ACTIVE_EXPERIMENT_MODEL,
				content: '{"recovered":true}',
				provider: 'Alibaba'
			});
		});

		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			errorLogger,
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ recovered: boolean }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Recover after a malformed response.',
			userId: 'user-json-retry',
			model: DEEPSEEK_V4_FLASH_MODEL,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			}
		});

		expect(result).toEqual({ recovered: true });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(requestBodies.map((body) => body.model)).toEqual([
			DEEPSEEK_V4_FLASH_MODEL,
			GLM_52_MODEL,
			XIAOMI_MIMO_V25_MODEL
		]);
		expect(errorLogger.logAPIError).not.toHaveBeenCalled();
	});
});
