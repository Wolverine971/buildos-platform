// packages/smart-llm/src/smart-llm-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SmartLLMService } from './smart-llm-service';
import { LLMRequestCancelledError, LLMRequestTimeoutError } from './errors';
import {
	ACTIVE_EXPERIMENT_MODEL,
	DEEPSEEK_V4_FLASH_MODEL,
	GEMINI_37_FLASH_MODEL,
	GLM_53_MODEL,
	GPT_6_LUNA_MODEL,
	GROK_47_MODEL,
	KIMI_K3_MODEL,
	QWEN_38_27B_FREE_MODEL,
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

async function emitKimiToolCall(llm: SmartLLMService): Promise<void> {
	for await (const event of llm.streamText({
		messages: [{ role: 'user', content: 'Update this task.' }],
		tools: createToolDefs(),
		tool_choice: 'auto',
		model: KIMI_K3_MODEL,
		userId: 'user-private',
		sessionId: 'session-private',
		messageId: 'message-private',
		operationType: 'test_stream'
	})) {
		if (event.type === 'done' || event.type === 'error') break;
	}
}

function kimiToolCallResponse(): Response {
	return buildSSE([
		JSON.stringify({
			id: 'chatcmpl-kimi-log',
			object: 'chat.completion.chunk',
			created: 0,
			model: KIMI_K3_MODEL,
			provider: 'Moonshot AI',
			choices: [
				{
					index: 0,
					delta: {
						tool_calls: [
							{
								index: 0,
								id: 'update_onto_task:private',
								type: 'function',
								function: {
									name: 'update_onto_task',
									arguments:
										'{"task_id":"private-task","description":"private content"}'
								}
							}
						]
					},
					finish_reason: 'tool_calls'
				}
			]
		}),
		'[DONE]'
	]);
}

function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

describe('Kimi tool-call debug logging privacy', () => {
	it('does not write tool-call dumps unless the non-production debug gate is explicit', async () => {
		const dumpDir = await mkdtemp(join(tmpdir(), 'buildos-kimi-log-disabled-'));
		const previous = {
			log: process.env.KIMI_TOOL_CALL_LOG,
			dir: process.env.KIMI_TOOL_CALL_LOG_DIR,
			nodeEnv: process.env.NODE_ENV
		};
		try {
			delete process.env.KIMI_TOOL_CALL_LOG;
			process.env.KIMI_TOOL_CALL_LOG_DIR = dumpDir;
			process.env.NODE_ENV = 'test';
			const llm = new SmartLLMService({
				apiKey: 'openrouter-test-key',
				fetch: vi.fn(async () => kimiToolCallResponse()) as unknown as typeof fetch
			});

			await emitKimiToolCall(llm);

			expect(await readdir(dumpDir)).toEqual([]);
		} finally {
			restoreEnv('KIMI_TOOL_CALL_LOG', previous.log);
			restoreEnv('KIMI_TOOL_CALL_LOG_DIR', previous.dir);
			restoreEnv('NODE_ENV', previous.nodeEnv);
			await rm(dumpDir, { recursive: true, force: true });
		}
	});

	it('hard-disables all local stream diagnostics in production even when flags are set', async () => {
		const dumpDir = await mkdtemp(join(tmpdir(), 'buildos-stream-log-production-'));
		const previous = {
			kimi: process.env.KIMI_TOOL_CALL_LOG,
			kimiDir: process.env.KIMI_TOOL_CALL_LOG_DIR,
			stream: process.env.LLM_STREAM_DEBUG,
			streamDir: process.env.LLM_STREAM_DEBUG_DIR,
			nodeEnv: process.env.NODE_ENV
		};
		try {
			process.env.KIMI_TOOL_CALL_LOG = '1';
			process.env.KIMI_TOOL_CALL_LOG_DIR = dumpDir;
			process.env.LLM_STREAM_DEBUG = '1';
			process.env.LLM_STREAM_DEBUG_DIR = dumpDir;
			process.env.NODE_ENV = 'production';
			const llm = new SmartLLMService({
				apiKey: 'openrouter-test-key',
				fetch: vi.fn(async () => kimiToolCallResponse()) as unknown as typeof fetch
			});

			await emitKimiToolCall(llm);
			await new Promise((resolve) => setTimeout(resolve, 10));

			expect(await readdir(dumpDir)).toEqual([]);
		} finally {
			restoreEnv('KIMI_TOOL_CALL_LOG', previous.kimi);
			restoreEnv('KIMI_TOOL_CALL_LOG_DIR', previous.kimiDir);
			restoreEnv('LLM_STREAM_DEBUG', previous.stream);
			restoreEnv('LLM_STREAM_DEBUG_DIR', previous.streamDir);
			restoreEnv('NODE_ENV', previous.nodeEnv);
			await rm(dumpDir, { recursive: true, force: true });
		}
	});

	it('writes only bounded, redacted metadata with private permissions when opted in', async () => {
		const dumpDir = await mkdtemp(join(tmpdir(), 'buildos-kimi-log-enabled-'));
		const previous = {
			log: process.env.KIMI_TOOL_CALL_LOG,
			dir: process.env.KIMI_TOOL_CALL_LOG_DIR,
			retention: process.env.KIMI_TOOL_CALL_LOG_RETENTION_DAYS,
			nodeEnv: process.env.NODE_ENV
		};
		try {
			process.env.KIMI_TOOL_CALL_LOG = '1';
			process.env.KIMI_TOOL_CALL_LOG_DIR = dumpDir;
			process.env.KIMI_TOOL_CALL_LOG_RETENTION_DAYS = '2';
			process.env.NODE_ENV = 'test';
			await writeFile(join(dumpDir, 'kimi-tool-calls-2020-01-01.jsonl'), 'stale\n');
			const llm = new SmartLLMService({
				apiKey: 'openrouter-test-key',
				fetch: vi.fn(async () => kimiToolCallResponse()) as unknown as typeof fetch
			});

			await emitKimiToolCall(llm);
			await vi.waitFor(async () => {
				expect((await readdir(dumpDir)).some((name) => name.includes('2020-01-01'))).toBe(
					false
				);
				expect((await readdir(dumpDir)).some((name) => name.endsWith('.jsonl'))).toBe(true);
			});

			const [fileName] = (await readdir(dumpDir)).filter((name) => name.endsWith('.jsonl'));
			expect(fileName).toBeDefined();
			const filePath = join(dumpDir, fileName!);
			const raw = await readFile(filePath, 'utf8');
			const record = JSON.parse(raw.trim()) as Record<string, unknown>;
			expect(record).toMatchObject({
				toolName: 'update_onto_task',
				argumentsJsonValid: true
			});
			expect(record.argumentChars).toBeGreaterThan(0);
			expect(raw).not.toContain('private-task');
			expect(raw).not.toContain('private content');
			expect(raw).not.toContain('session-private');
			expect(raw).not.toContain('message-private');
			expect((await stat(filePath)).mode & 0o777).toBe(0o600);
			expect((await stat(dumpDir)).mode & 0o777).toBe(0o700);
		} finally {
			restoreEnv('KIMI_TOOL_CALL_LOG', previous.log);
			restoreEnv('KIMI_TOOL_CALL_LOG_DIR', previous.dir);
			restoreEnv('KIMI_TOOL_CALL_LOG_RETENTION_DAYS', previous.retention);
			restoreEnv('NODE_ENV', previous.nodeEnv);
			await rm(dumpDir, { recursive: true, force: true });
		}
	});
});

describe('LLM stream debug logging privacy', () => {
	it('writes only aggregate stream shapes with private permissions and bounded retention', async () => {
		const dumpDir = await mkdtemp(join(tmpdir(), 'buildos-stream-log-enabled-'));
		const previous = {
			debug: process.env.LLM_STREAM_DEBUG,
			dir: process.env.LLM_STREAM_DEBUG_DIR,
			retention: process.env.LLM_STREAM_DEBUG_RETENTION_DAYS,
			nodeEnv: process.env.NODE_ENV
		};
		try {
			process.env.LLM_STREAM_DEBUG = '1';
			process.env.LLM_STREAM_DEBUG_DIR = dumpDir;
			process.env.LLM_STREAM_DEBUG_RETENTION_DAYS = '2';
			process.env.NODE_ENV = 'test';
			await writeFile(join(dumpDir, 'llm-stream-deltas-2020-01-01.jsonl'), 'stale\n');
			const llm = new SmartLLMService({
				apiKey: 'openrouter-test-key',
				fetch: vi.fn(async () => kimiToolCallResponse()) as unknown as typeof fetch
			});

			await emitKimiToolCall(llm);
			await vi.waitFor(async () => {
				expect((await readdir(dumpDir)).some((name) => name.includes('2020-01-01'))).toBe(
					false
				);
				expect(
					(await readdir(dumpDir)).some((name) => name.startsWith('llm-stream-deltas-'))
				).toBe(true);
			});

			const [fileName] = (await readdir(dumpDir)).filter((name) =>
				name.startsWith('llm-stream-deltas-')
			);
			const filePath = join(dumpDir, fileName!);
			const raw = await readFile(filePath, 'utf8');
			const record = JSON.parse(raw.trim()) as Record<string, unknown>;
			expect(record).toMatchObject({
				model: KIMI_K3_MODEL,
				provider: 'Moonshot AI',
				stats: {
					toolCallChunks: 1,
					deltaKeyShapes: { tool_calls: 1 }
				}
			});
			for (const privateValue of [
				'private-task',
				'private content',
				'user-private',
				'session-private',
				'message-private',
				'chatcmpl-kimi-log'
			]) {
				expect(raw).not.toContain(privateValue);
			}
			expect((await stat(filePath)).mode & 0o777).toBe(0o600);
			expect((await stat(dumpDir)).mode & 0o777).toBe(0o700);
		} finally {
			restoreEnv('LLM_STREAM_DEBUG', previous.debug);
			restoreEnv('LLM_STREAM_DEBUG_DIR', previous.dir);
			restoreEnv('LLM_STREAM_DEBUG_RETENTION_DAYS', previous.retention);
			restoreEnv('NODE_ENV', previous.nodeEnv);
			await rm(dumpDir, { recursive: true, force: true });
		}
	});
});

describe('SmartLLMService embedding error privacy', () => {
	it.each([
		['single', (llm: SmartLLMService) => llm.generateEmbedding('private input', 'key')],
		['batch', (llm: SmartLLMService) => llm.generateEmbeddings(['private input'], 'key')]
	])('does not expose provider response bodies for %s requests', async (_kind, invoke) => {
		const sentinel = 'provider-body-secret-7f94';
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: vi.fn(
				async () => new Response(`upstream failure ${sentinel}`, { status: 429 })
			) as unknown as typeof fetch
		});

		const error = await invoke(llm).catch((cause) => cause);

		expect(error).toMatchObject({
			name: 'OpenAIEmbeddingError',
			message: 'OpenAI embedding request failed.',
			status: 429
		});
		expect(JSON.stringify(error)).not.toContain(sentinel);
		expect(String(error)).not.toContain(sentinel);
	});
});

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

describe('SmartLLMService OpenRouter data policy', () => {
	it('keeps JSON parse repair on the explicitly selected free model', async () => {
		const bodies: Record<string, unknown>[] = [];
		const llm = new SmartLLMService({
			apiKey: 'test-key',
			fetch: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
				bodies.push(JSON.parse(String(init?.body)));
				return buildJSONCompletion({
					model: QWEN_38_27B_FREE_MODEL,
					content: bodies.length === 1 ? 'invalid JSON' : '{"ok":true}',
					cost: 0
				});
			}) as typeof fetch
		});
		await expect(
			llm.getJSONResponse({
				model: QWEN_38_27B_FREE_MODEL,
				userId: 'dev',
				systemPrompt: 'Return JSON.',
				userPrompt: 'Summarize the fixture.',
				validation: { retryOnParseError: true, maxRetries: 1 }
			})
		).resolves.toEqual({ ok: true });
		expect(bodies).toHaveLength(2);
		for (const body of bodies) {
			expect(body.model).toBe(QWEN_38_27B_FREE_MODEL);
			expect(body).not.toHaveProperty('models');
			expect(body.provider).toMatchObject({
				max_price: { prompt: 0, completion: 0, request: 0 }
			});
		}
	});
	it('uses free Qwen for budgeted JSON with no paid profile fallbacks or estimated spend', async () => {
		const bodies: Record<string, unknown>[] = [];
		const onSpendReservation = vi.fn();
		const llm = new SmartLLMService({
			apiKey: 'test-key',
			fetch: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
				bodies.push(JSON.parse(String(init?.body)));
				return buildJSONCompletion({
					model: QWEN_38_27B_FREE_MODEL,
					content: '{"ok":true}',
					cost: 0
				});
			}) as typeof fetch
		});
		await expect(
			llm.getJSONResponse({
				model: QWEN_38_27B_FREE_MODEL,
				models: [GLM_53_MODEL],
				systemPrompt: 'Return JSON.',
				userPrompt: 'Summarize the fixture.',
				userId: 'dev',
				spendLimit: { maxCostUsd: 0.01 },
				onSpendReservation
			})
		).resolves.toEqual({ ok: true });
		expect(bodies).toHaveLength(1);
		expect(bodies[0]?.model).toBe(QWEN_38_27B_FREE_MODEL);
		expect(bodies[0]).not.toHaveProperty('models');
		expect(bodies[0]).not.toHaveProperty('response_format');
		expect(bodies[0]?.provider).toMatchObject({
			zdr: true,
			data_collection: 'deny',
			max_price: { prompt: 0, completion: 0, request: 0 }
		});
		expect(onSpendReservation).toHaveBeenCalledWith(
			expect.objectContaining({ reservedCostUsd: 0 })
		);
	});

	it('stops a free Qwen stream on endpoint removal without trying paid fallbacks', async () => {
		const bodies: Record<string, unknown>[] = [];
		const llm = new SmartLLMService({
			apiKey: 'test-key',
			fetch: vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
				bodies.push(JSON.parse(String(init?.body)));
				return new Response(JSON.stringify({ error: { message: 'No endpoints found' } }), {
					status: 404
				});
			}) as typeof fetch
		});
		const events = [];
		for await (const event of llm.streamText({
			model: QWEN_38_27B_FREE_MODEL,
			models: [GLM_53_MODEL],
			messages: [{ role: 'user', content: 'Read a fixture.' }],
			tools: createToolDefs(),
			tool_choice: 'required',
			userId: 'dev'
		}))
			events.push(event);
		expect(events.some((event) => event.type === 'error')).toBe(true);
		expect(bodies).toHaveLength(1);
		expect(bodies[0]?.model).toBe(QWEN_38_27B_FREE_MODEL);
		expect(bodies[0]).not.toHaveProperty('models');
	});

	async function captureJsonRequestBody(evaluationOnlyAllowNonZdr?: boolean) {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return buildJSONCompletion({
				model: GLM_53_MODEL,
				content: '{"ok":true}',
				provider: 'Z.AI'
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch,
			openrouter: { evaluationOnlyAllowNonZdr }
		});

		await llm.getJSONResponse({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Exercise the configured data policy.',
			model: GLM_53_MODEL,
			models: [],
			spendLimit: { maxCostUsd: 0.01 },
			userId: 'data-policy-test'
		});

		return requestBodies[0];
	}

	it('keeps data collection denied and requires ZDR by default', async () => {
		const body = await captureJsonRequestBody();

		expect(body?.provider).toMatchObject({
			data_collection: 'deny',
			zdr: true,
			max_price: expect.any(Object)
		});
	});

	it('preserves an explicit zero temperature for deterministic JSON grading', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return buildJSONCompletion({
				model: GLM_53_MODEL,
				content: '{"ok":true}',
				provider: 'Z.AI'
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await llm.getJSONResponse({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Grade this result deterministically.',
			model: GLM_53_MODEL,
			models: [],
			temperature: 0,
			userId: 'zero-temperature-test'
		});

		expect(requestBodies[0]?.temperature).toBe(0);
	});

	it('keeps an explicit custom JSON model chain free of profile fallbacks', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return buildJSONCompletion({
				model: GPT_6_LUNA_MODEL,
				content: '{"score":5}',
				provider: 'OpenAI'
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await llm.getJSONResponse({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Grade this result.',
			models: [GPT_6_LUNA_MODEL, KIMI_K3_MODEL, GROK_47_MODEL],
			profile: 'custom',
			temperature: 0,
			userId: 'custom-chain-test'
		});

		expect(requestBodies[0]?.model).toBe(GPT_6_LUNA_MODEL);
		expect(requestBodies[0]?.models).toEqual([KIMI_K3_MODEL, GROK_47_MODEL]);
		expect(requestBodies[0]?.models).not.toContain(DEEPSEEK_V4_FLASH_MODEL);
		expect(requestBodies[0]?.models).not.toContain(ACTIVE_EXPERIMENT_MODEL);
	});

	it('omits only the ZDR requirement when the evaluation-only opt-in is explicit', async () => {
		const body = await captureJsonRequestBody(true);

		expect(body?.provider).toMatchObject({
			data_collection: 'deny',
			max_price: expect.any(Object)
		});
		expect(body?.provider).not.toHaveProperty('zdr');
	});

	it('merges caller routing while preventing privacy-policy overrides', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return buildJSONCompletion({
				model: GLM_53_MODEL,
				content: '{"ok":true}',
				provider: 'Novita'
			});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await llm.getJSONResponse({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Exercise provider steering.',
			model: GLM_53_MODEL,
			models: [],
			userId: 'provider-routing-test',
			providerRouting: {
				order: ['novita', 'parasail'],
				allow_fallbacks: true,
				zdr: false,
				data_collection: 'allow'
			} as any
		});

		expect(requestBodies[0]?.provider).toEqual({
			order: ['novita', 'parasail'],
			allow_fallbacks: true,
			data_collection: 'deny',
			require_parameters: true,
			zdr: true
		});
	});

	it('keeps provider steering on the JSON validation-repair attempt', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return requestBodies.length === 1
				? buildJSONCompletion({
						model: GLM_53_MODEL,
						content: 'not valid JSON',
						provider: 'Novita'
					})
				: buildJSONCompletion({
						model: GEMINI_37_FLASH_MODEL,
						content: '{"ok":true}',
						provider: 'Novita'
					});
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Repair malformed JSON.',
			model: GLM_53_MODEL,
			models: [],
			userId: 'provider-routing-repair-test',
			providerRouting: { order: ['novita'], allow_fallbacks: true },
			validation: { retryOnParseError: true, maxRetries: 1 }
		});

		expect(result).toEqual({ ok: true });
		expect(requestBodies).toHaveLength(2);
		expect(requestBodies.map((body) => body.provider)).toEqual([
			{
				order: ['novita'],
				allow_fallbacks: true,
				data_collection: 'deny',
				require_parameters: true,
				zdr: true
			},
			{
				order: ['novita'],
				allow_fallbacks: true,
				data_collection: 'deny',
				zdr: true
			}
		]);
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
				model: GLM_53_MODEL,
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
		expect(requestBodies[0]?.model).toBe(GEMINI_37_FLASH_MODEL);
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
		expect(requestBodies[1]?.model).toBe(GEMINI_37_FLASH_MODEL);
		expect(events.some((event) => event.type === 'error')).toBe(false);
		expect(events.some((event) => event.type === 'text')).toBe(true);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				modelRequested: GEMINI_37_FLASH_MODEL,
				modelUsed: ACTIVE_EXPERIMENT_MODEL,
				status: 'success',
				streaming: true
			})
		);
	});
});

describe('SmartLLMService JSON model recovery', () => {
	it('records an accepted timeout once and rethrows the typed error unwrapped', async () => {
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const timedOutResponse = {
			ok: true,
			headers: new Headers({ 'x-generation-id': 'gen-accepted-timeout' }),
			json: vi.fn().mockRejectedValue(cause)
		} as unknown as Response;
		const fetchMock = vi.fn().mockResolvedValue(timedOutResponse);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		let thrown: unknown;
		try {
			await llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Exercise accepted timeout handling.',
				userId: 'accepted-timeout-test',
				model: GLM_53_MODEL,
				models: [],
				timeoutMs: 42
			});
		} catch (error) {
			thrown = error;
		}

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(thrown).toBeInstanceOf(LLMRequestTimeoutError);
		expect(thrown).toMatchObject({
			openrouter: { generationId: 'gen-accepted-timeout' }
		});
		await vi.waitFor(() => {
			expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'timeout',
					metadata: expect.objectContaining({
						billingDisposition: 'uncertain',
						openrouterRequestId: 'gen-accepted-timeout'
					})
				})
			);
		});
	});

	it('fails over after a pre-header timeout with no accepted generation', async () => {
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const fetchMock = vi
			.fn()
			.mockRejectedValueOnce(cause)
			.mockResolvedValueOnce(
				buildJSONCompletion({
					model: DEEPSEEK_V4_FLASH_MODEL,
					content: '{"ok":true}',
					provider: 'Novita'
				})
			);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.getJSONResponse<{ ok: boolean }>({
			systemPrompt: 'Return JSON.',
			userPrompt: 'Fail over safely.',
			userId: 'pre-header-timeout-test',
			model: GLM_53_MODEL,
			models: [],
			timeoutMs: 42
		});

		expect(result).toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does not retry a caller cancellation', async () => {
		const controller = new AbortController();
		const abortReason = new Error('Worker timeout after 600000ms for buildos_project_loop');
		const fetchMock = vi.fn(async () => {
			controller.abort(abortReason);
			throw abortReason;
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Stop when ownership is lost.',
				userId: 'cancelled-test',
				model: GLM_53_MODEL,
				models: [],
				signal: controller.signal
			})
		).rejects.toBeInstanceOf(LLMRequestCancelledError);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('does not hide an accepted timeout from the validation-repair call', async () => {
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const timedOutResponse = {
			ok: true,
			headers: new Headers({ 'x-generation-id': 'gen-repair-timeout' }),
			json: vi.fn().mockRejectedValue(cause)
		} as unknown as Response;
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				buildJSONCompletion({
					model: GLM_53_MODEL,
					content: 'not valid JSON',
					provider: 'Novita'
				})
			)
			.mockResolvedValue(timedOutResponse);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Exercise repair timeout handling.',
				userId: 'repair-timeout-test',
				model: GLM_53_MODEL,
				models: [],
				timeoutMs: 42,
				validation: { retryOnParseError: true, maxRetries: 1 }
			})
		).rejects.toMatchObject({
			name: 'LLMRequestTimeoutError',
			openrouter: { generationId: 'gen-repair-timeout' }
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);
		await vi.waitFor(() => {
			expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
				expect.objectContaining({
					modelUsed: GEMINI_37_FLASH_MODEL,
					promptTokens: 0,
					completionTokens: 0,
					totalTokens: 0,
					status: 'timeout',
					metadata: expect.objectContaining({
						lastRequestedModel: GEMINI_37_FLASH_MODEL,
						lastModel: GEMINI_37_FLASH_MODEL,
						billingDisposition: 'uncertain',
						openrouterRequestId: 'gen-repair-timeout'
					})
				})
			);
		});
	});

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
				model: GEMINI_37_FLASH_MODEL,
				content: 'not valid JSON',
				provider: 'Google',
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
				model: GEMINI_37_FLASH_MODEL,
				maxTokens: expect.any(Number),
				estimatedInputTokens: expect.any(Number),
				reservedCostUsd: expect.any(Number)
			})
		);
		expect(requestBodies[0]?.model).toBe(GEMINI_37_FLASH_MODEL);
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
				model: GEMINI_37_FLASH_MODEL,
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

		let thrown: unknown;
		try {
			await llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Use one bounded attempt.',
				userId: 'user-lost-response',
				profile: 'powerful',
				spendLimit: { maxCostUsd: 0.01 },
				onUsage
			});
		} catch (error) {
			thrown = error;
		}

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error & { cause?: unknown }).cause).toMatchObject({
			openrouter: { generationId: 'gen-lost-response' }
		});
		expect(onUsage).toHaveBeenCalledOnce();
		expect(onUsage.mock.calls[0]?.[0]?.totalCost).toBeGreaterThan(0);
		expect(onUsage.mock.calls[0]?.[0]?.totalCost).toBeLessThanOrEqual(0.01);
		expect(onUsage.mock.calls[0]?.[0]?.costSource).toBe('reservation');
		expect(onUsage.mock.calls[0]?.[0]?.providerRequestId).toBe('gen-lost-response');
	});

	it('releases a strict reservation when routing is rejected before generation', async () => {
		const onUsage = vi.fn();
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					error: { message: 'No endpoints found that satisfy Zero Data Retention' }
				}),
				{
					status: 404,
					headers: { 'content-type': 'application/json' }
				}
			);
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Use one bounded attempt.',
				userId: 'user-route-rejected',
				profile: 'powerful',
				spendLimit: { maxCostUsd: 0.01 },
				onUsage
			})
		).rejects.toThrow('No eligible model endpoint was available');

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(onUsage).toHaveBeenCalledWith(
			expect.objectContaining({
				billingDisposition: 'released',
				totalCost: 0,
				totalTokens: 0,
				providerRequestId: undefined
			})
		);
	});

	it('keeps raw provider error bodies out of logs, usage rows, and returned errors', async () => {
		const sentinel = 'SUPER_SECRET_PROMPT_AND_PROVIDER_BODY';
		const errorLogger = { logAPIError: vi.fn(async () => undefined) };
		const usageLogger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						error: {
							message: sentinel,
							metadata: { provider_name: sentinel, echoed_prompt: sentinel }
						}
					}),
					{
						status: 503,
						headers: { 'content-type': 'application/json' }
					}
				)
		);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			errorLogger,
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		let thrown: unknown;
		try {
			await llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Use one bounded attempt.',
				userId: 'user-private-error',
				profile: 'powerful',
				spendLimit: { maxCostUsd: 0.01 }
			});
		} catch (error) {
			thrown = error;
		}

		expect(JSON.stringify(errorLogger.logAPIError.mock.calls)).not.toContain(sentinel);
		expect(JSON.stringify(usageLogger.logUsageToDatabase.mock.calls)).not.toContain(sentinel);
		expect(JSON.stringify(consoleError.mock.calls)).not.toContain(sentinel);
		expect(String((thrown as Error)?.message)).not.toContain(sentinel);
		expect(JSON.stringify((thrown as Error & { cause?: unknown })?.cause)).not.toContain(
			sentinel
		);
		consoleError.mockRestore();
	});

	it('settles a budgeted call to the spend-plan reservation when a 200 response omits usage', async () => {
		const onUsage = vi.fn();
		const onSpendReservation = vi.fn(async () => {});
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					id: 'completion-no-usage-budgeted',
					model: GLM_53_MODEL,
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
					model: GLM_53_MODEL,
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
			GEMINI_37_FLASH_MODEL,
			XIAOMI_MIMO_V25_MODEL
		]);
		expect(errorLogger.logAPIError).not.toHaveBeenCalled();
	});
});

describe('SmartLLMService text generation timeout classification', () => {
	it('records a text-path accepted timeout with status timeout, not failure', async () => {
		// Regression: the typed timeout message says "timed out", so the old
		// message.includes('timeout') heuristic misclassified text-path timeouts.
		const usageLogger = {
			logUsageToDatabase: vi.fn(async () => undefined)
		};
		const cause = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
		const timedOutResponse = {
			ok: true,
			headers: new Headers({ 'x-generation-id': 'gen-text-timeout' }),
			json: vi.fn().mockRejectedValue(cause)
		} as unknown as Response;
		const fetchMock = vi.fn().mockResolvedValue(timedOutResponse);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		let thrown: unknown;
		try {
			await llm.generateText({
				prompt: 'Exercise text-path timeout classification.',
				userId: 'text-timeout-test',
				timeoutMs: 42
			});
		} catch (error) {
			thrown = error;
		}

		// An accepted (billed) generation must not be dispatched again to the
		// next model, and the typed error must reach the caller unwrapped.
		expect(fetchMock).toHaveBeenCalledOnce();
		expect(thrown).toBeInstanceOf(LLMRequestTimeoutError);
		expect(thrown).toMatchObject({ openrouter: { generationId: 'gen-text-timeout' } });
		await vi.waitFor(() => {
			expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
				expect.objectContaining({ status: 'timeout' })
			);
		});
		expect(usageLogger.logUsageToDatabase).not.toHaveBeenCalledWith(
			expect.objectContaining({ status: 'failure' })
		);
	});
});

describe('SmartLLMService text generation retry rule', () => {
	it('does not fail over on a non-retryable 4xx rejection', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'bad request' } }), {
					status: 400,
					headers: { 'content-type': 'application/json' }
				})
		);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.generateText({ prompt: 'Reject me once.', userId: 'text-400-test' })
		).rejects.toThrow('Failed to generate text');
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('forwards the caller signal and does not retry a cancellation', async () => {
		const controller = new AbortController();
		const abortReason = new Error('Worker timeout after 600000ms for text job');
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			expect(init?.signal).toBeDefined();
			controller.abort(abortReason);
			throw abortReason;
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.generateText({
				prompt: 'Stop when ownership is lost.',
				userId: 'text-cancel-test',
				signal: controller.signal
			})
		).rejects.toBeInstanceOf(LLMRequestCancelledError);
		expect(fetchMock).toHaveBeenCalledOnce();
	});

	it('does not dispatch at all when the caller signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort(new Error('already gone'));
		const fetchMock = vi.fn();
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.generateText({
				prompt: 'Never sent.',
				userId: 'text-pre-aborted-test',
				signal: controller.signal
			})
		).rejects.toBeInstanceOf(LLMRequestCancelledError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps an explicit zero temperature and never requests SSE on the text path', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return buildJSONCompletion({ model: DEEPSEEK_V4_FLASH_MODEL, content: 'Hello.' });
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const text = await llm.generateText({
			prompt: 'Say hello.',
			userId: 'text-zero-temp-test',
			temperature: 0,
			streaming: true
		});

		expect(text).toBe('Hello.');
		expect(requestBodies[0]?.temperature).toBe(0);
		expect(requestBodies[0]?.stream).not.toBe(true);
	});
});

describe('SmartLLMService billed intermediate attempts', () => {
	it('logs a billed empty-content text attempt as its own usage row before failing over', async () => {
		const usageLogger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				buildJSONCompletion({
					model: DEEPSEEK_V4_FLASH_MODEL,
					content: null,
					finishReason: 'length',
					provider: 'DeepSeek',
					cost: 0.0042
				})
			)
			.mockResolvedValueOnce(
				buildJSONCompletion({ model: GEMINI_37_FLASH_MODEL, content: 'Recovered.' })
			);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.generateText({ prompt: 'Recover after empty output.', userId: 'text-billed' })
		).resolves.toBe('Recovered.');

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledTimes(2);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'invalid_response',
				modelUsed: DEEPSEEK_V4_FLASH_MODEL,
				promptTokens: 10,
				completionTokens: 5,
				totalCost: 0.0042,
				openrouterRequestId: `completion-${DEEPSEEK_V4_FLASH_MODEL}`
			})
		);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'success', modelUsed: GEMINI_37_FLASH_MODEL })
		);
	});

	it('charges the billed usage of the final failed text attempt on the terminal row', async () => {
		const usageLogger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const fetchMock = vi.fn(async () =>
			buildJSONCompletion({
				model: DEEPSEEK_V4_FLASH_MODEL,
				content: null,
				provider: 'DeepSeek',
				cost: 0.001
			})
		);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.generateText({ prompt: 'Always empty.', userId: 'text-billed-terminal' })
		).rejects.toThrow('Failed to generate text');

		const rows = usageLogger.logUsageToDatabase.mock.calls.map(
			(call) => (call as unknown as [Record<string, unknown>])[0]
		);
		// Every paid call is represented exactly once: intermediates plus the terminal row.
		expect(rows).toHaveLength(fetchMock.mock.calls.length);
		const terminal = rows.find((row) => row.status === 'failure');
		expect(terminal).toMatchObject({ promptTokens: 10, completionTokens: 5, totalCost: 0.001 });
		expect(rows.reduce((sum, row) => sum + Number(row.totalCost), 0)).toBeCloseTo(
			0.001 * fetchMock.mock.calls.length
		);
	});

	it('logs the malformed JSON response that a validation repair superseded', async () => {
		const usageLogger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				buildJSONCompletion({
					model: GLM_53_MODEL,
					content: 'not valid JSON',
					provider: 'Novita',
					cost: 0.002
				})
			)
			.mockResolvedValueOnce(
				buildJSONCompletion({ model: GEMINI_37_FLASH_MODEL, content: '{"ok":true}' })
			);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			usageLogger,
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.getJSONResponse({
				systemPrompt: 'Return JSON.',
				userPrompt: 'Repair me.',
				userId: 'json-billed-repair',
				model: GLM_53_MODEL,
				validation: { retryOnParseError: true, maxRetries: 1 }
			})
		).resolves.toEqual({ ok: true });

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledTimes(2);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'invalid_response',
				modelUsed: GLM_53_MODEL,
				promptTokens: 10,
				totalCost: 0.002
			})
		);
		expect(usageLogger.logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({ status: 'success', modelUsed: GEMINI_37_FLASH_MODEL })
		);
	});

	it('honours an explicit maxRetries of zero (no validation-repair call)', async () => {
		const requestBodies: Array<Record<string, unknown>> = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
			return requestBodies.length === 1
				? buildJSONCompletion({ model: GLM_53_MODEL, content: 'not valid JSON' })
				: buildJSONCompletion({ model: DEEPSEEK_V4_FLASH_MODEL, content: '{"ok":true}' });
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await llm.getJSONResponse({
			systemPrompt: 'Return JSON.',
			userPrompt: 'No repair allowed.',
			userId: 'json-zero-retries',
			model: GLM_53_MODEL,
			validation: { retryOnParseError: true, maxRetries: 0 }
		});

		// A repair call would go to the powerful-profile model; with zero repairs
		// the malformed response fails over to the next profile model instead.
		expect(requestBodies).toHaveLength(2);
		expect(requestBodies[1]?.model).toBe(DEEPSEEK_V4_FLASH_MODEL);
	});
});

describe('SmartLLMService transcription terminal error', () => {
	it('keeps the provider HTTP status on the sanitized terminal error', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ error: { message: 'slow down' } }), {
					status: 429,
					headers: { 'content-type': 'application/json' }
				})
		);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		let thrown: unknown;
		try {
			await llm.transcribeAudio({
				audio: { kind: 'buffer', data: new Uint8Array([1, 2, 3]), format: 'wav' },
				userId: 'transcribe-429',
				models: ['openai/whisper-1'],
				maxRetries: 0
			});
		} catch (error) {
			thrown = error;
		}

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error & { status?: number }).status).toBe(429);
		expect(String((thrown as Error).message)).not.toContain('slow down');
	});
});

describe('SmartLLMService dictation transcription', () => {
	function transcriptionResponse(text: string) {
		return new Response(JSON.stringify({ text, model: 'openai/gpt-transcribe' }), {
			status: 200,
			headers: { 'content-type': 'application/json' }
		});
	}

	it('sends vocabulary and prior words to the model as a provider prompt', async () => {
		const bodies: Record<string, any>[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return transcriptionResponse('Call Marcus about Samos.');
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.transcribeAudio({
			audio: { kind: 'buffer', data: new Uint8Array([1, 2, 3]), format: 'webm' },
			userId: 'transcribe-prompt',
			models: ['openai/gpt-transcribe'],
			vocabularyTerms: 'Samos, Marcus',
			context: 'so the bid desk needs a follow-up'
		});

		expect(result.text).toBe('Call Marcus about Samos.');
		const prompt = bodies[0]?.provider?.options?.openai?.prompt as string;
		expect(prompt).toContain('Samos, Marcus');
		expect(prompt).toContain('so the bid desk needs a follow-up');
		expect(bodies[0]?.provider?.data_collection).toBe('deny');
	});

	it('drops the prompt and retries once if the provider rejects it', async () => {
		const bodies: Record<string, any>[] = [];
		const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return bodies.length === 1
				? new Response('{}', {
						status: 400,
						headers: { 'content-type': 'application/json' }
					})
				: transcriptionResponse('Plain transcript.');
		});
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.transcribeAudio({
			audio: { kind: 'buffer', data: new Uint8Array([1]), format: 'webm' },
			userId: 'transcribe-prompt-rejected',
			models: ['openai/gpt-transcribe'],
			maxRetries: 0,
			vocabularyTerms: 'Samos'
		});

		expect(result.text).toBe('Plain transcript.');
		expect(bodies).toHaveLength(2);
		expect(bodies[0]?.provider?.options).toBeDefined();
		expect(bodies[1]?.provider?.options).toBeUndefined();
		expect(bodies[1]?.provider?.data_collection).toBe('deny');
	});

	it('returns empty text for silence when allowed, without retrying', async () => {
		const fetchMock = vi.fn(async () => transcriptionResponse(''));
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		const result = await llm.transcribeAudio({
			audio: { kind: 'buffer', data: new Uint8Array([1]), format: 'webm' },
			userId: 'transcribe-empty',
			models: ['openai/gpt-transcribe', 'openai/gpt-4o-mini-transcribe'],
			allowEmptyTranscript: true
		});

		expect(result.text).toBe('');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('stops trying once the deadline cannot fit another attempt', async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })
		);
		const llm = new SmartLLMService({
			apiKey: 'openrouter-test-key',
			fetch: fetchMock as unknown as typeof fetch
		});

		await expect(
			llm.transcribeAudio({
				audio: { kind: 'buffer', data: new Uint8Array([1]), format: 'webm' },
				userId: 'transcribe-deadline',
				models: ['openai/gpt-transcribe', 'openai/gpt-4o-mini-transcribe'],
				maxRetries: 2,
				initialRetryDelayMs: 1_000,
				deadlineMs: 3_500
			})
		).rejects.toThrow();
		// First attempt fits; a 1s backoff + 3s minimum attempt does not.
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
