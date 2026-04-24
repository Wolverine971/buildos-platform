// packages/smart-llm/src/smart-llm-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { SmartLLMService } from './smart-llm-service';
import {
	ACTIVE_EXPERIMENT_MODEL,
	DEEPSEEK_V4_FLASH_MODEL,
	GEMINI_31_FLASH_LITE_PREVIEW_MODEL
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
		expect(requestBodies[0]?.reasoning).toEqual({ effort: 'low', exclude: true });
	});
});

describe('SmartLLMService model failover', () => {
	it('fails over from DeepSeek V4 Flash to the next text fallback', async () => {
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
					model: GEMINI_31_FLASH_LITE_PREVIEW_MODEL,
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
					model: GEMINI_31_FLASH_LITE_PREVIEW_MODEL,
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
		expect(requestBodies[1]?.model).toBe(GEMINI_31_FLASH_LITE_PREVIEW_MODEL);
		expect(events.some((event) => event.type === 'error')).toBe(false);
		expect(events.some((event) => event.type === 'text')).toBe(true);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				modelRequested: GEMINI_31_FLASH_LITE_PREVIEW_MODEL,
				modelUsed: GEMINI_31_FLASH_LITE_PREVIEW_MODEL,
				status: 'success',
				streaming: true
			})
		);
	});
});
