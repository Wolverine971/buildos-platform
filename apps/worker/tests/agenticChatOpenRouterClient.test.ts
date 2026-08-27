// apps/worker/tests/agenticChatOpenRouterClient.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatLlmUsageObserver,
	AgenticChatOpenRouterClient,
	createStableAgenticChatProviderUsageLogIdV1,
	type AgenticChatOpenAiCompatibleRouteV1,
	type AgenticChatProviderUsageObservationV1
} from '../src/workers/agentic-chat/provider/openrouter-client';
import type { AgenticChatTurnProviderClientEventV1 } from '../src/workers/agentic-chat/provider/contracts';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';
import { AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1 } from '../src/workers/agentic-chat/mutationToolCatalog';
import { AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1 } from '../src/workers/agentic-chat/tools/execution-adapter';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '50000000-0000-4000-8000-000000000005';

afterEach(() => {
	vi.useRealTimers();
});

function input(signal = new AbortController().signal) {
	return {
		messages: [
			{ role: 'system', content: 'System prompt' },
			{ role: 'user', content: 'Current request' }
		] as const,
		tools: [],
		toolChoice: 'none' as const,
		userId: USER_ID,
		sessionId: SESSION_ID,
		turnRunId: TURN_RUN_ID,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		queueJobId: QUEUE_JOB_ID,
		processingToken: PROCESSING_TOKEN,
		executionGeneration: 2,
		providerRound: 'initial' as const,
		logicalProviderRound: 1,
		signal
	};
}

function readToolDefinition(name: string) {
	return {
		type: 'function' as const,
		function: {
			name,
			description: `Read with ${name}.`,
			parameters: {
				type: 'object',
				properties: { query: { type: 'string', description: name } }
			}
		}
	};
}

function route(
	overrides: Partial<AgenticChatOpenAiCompatibleRouteV1> = {}
): AgenticChatOpenAiCompatibleRouteV1 {
	return {
		id: 'openrouter',
		kind: 'openrouter',
		baseUrl: 'https://openrouter.example/api/v1',
		apiKey: 'provider-secret',
		model: 'provider/primary',
		fallbackModels: ['provider/fallback'],
		...overrides
	};
}

function sseResponse(
	frames: string[],
	options: {
		newline?: string;
		includeFinalNewline?: boolean;
		headers?: Record<string, string>;
	} = {}
): Response {
	const newline = options.newline ?? '\n';
	const text =
		frames.map((frame) => `data: ${frame}`).join(`${newline}${newline}`) +
		(options.includeFinalNewline === false ? '' : `${newline}${newline}`);
	return new Response(text, {
		status: 200,
		headers: { 'content-type': 'text/event-stream', ...(options.headers ?? {}) }
	});
}

function splitSseResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
				controller.close();
			}
		}),
		{ status: 200, headers: { 'content-type': 'text/event-stream' } }
	);
}

function harness(
	fetchImpl: typeof fetch,
	routes = [route()],
	options: { maxTokens?: number } = {}
) {
	const observations: AgenticChatProviderUsageObservationV1[] = [];
	const lifecycleObservations: AgenticChatExecutionObservationInputV1[] = [];
	const usage = {
		observe: vi.fn(async (observation: AgenticChatProviderUsageObservationV1) => {
			observations.push(observation);
		})
	};
	const executionObservations = {
		observe: vi.fn(async (observation: AgenticChatExecutionObservationInputV1) => {
			lifecycleObservations.push(observation);
		})
	};
	const client = new AgenticChatOpenRouterClient(
		{ usage, executionObservations },
		{
			routes,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 10_000,
			...options
		}
	);
	return { client, usage, observations, executionObservations, lifecycleObservations };
}

async function collect(
	stream: AsyncIterable<AgenticChatTurnProviderClientEventV1>
): Promise<AgenticChatTurnProviderClientEventV1[]> {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe('AgenticChatOpenRouterClient', () => {
	it('pins replay-stable usage identities per logical provider round and route', () => {
		const first = createStableAgenticChatProviderUsageLogIdV1({
			turnRunId: TURN_RUN_ID,
			executionGeneration: 2,
			logicalProviderRound: 1,
			routeId: 'openrouter'
		});
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
		expect(
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 2,
				logicalProviderRound: 1,
				routeId: 'openrouter'
			})
		).toBe(first);
		expect(
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 2,
				logicalProviderRound: 1,
				providerAttempt: 1,
				routeId: 'openrouter'
			})
		).toBe(first);
		expect(
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 2,
				logicalProviderRound: 2,
				routeId: 'openrouter'
			})
		).not.toBe(first);
		expect(
			createStableAgenticChatProviderUsageLogIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 2,
				logicalProviderRound: 1,
				providerAttempt: 2,
				routeId: 'openrouter'
			})
		).not.toBe(first);
	});

	it('streams private reasoning separately, sends no tools, and accounts exact provider usage', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse(
				[
					JSON.stringify({
						id: 'request-1',
						model: 'provider/resolved',
						provider: 'Resolved Provider',
						choices: [
							{
								delta: {
									reasoning_content: 'private chain',
									content: '<think>hidden</think>Visible answer'
								}
							}
						]
					}),
					JSON.stringify({
						usage: {
							prompt_tokens: 8,
							completion_tokens: 2,
							total_tokens: 10,
							prompt_tokens_details: {
								cached_tokens: 3,
								cache_write_tokens: 1
							},
							completion_tokens_details: { reasoning_tokens: 1 },
							is_byok: true,
							cost_details: {
								upstream_inference_cost: 0.0008,
								upstream_inference_prompt_cost: 0.00025,
								upstream_inference_completions_cost: 0.00055
							},
							cost: 0.001
						},
						choices: []
					}),
					JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
					'[DONE]'
				],
				{
					headers: {
						'x-openrouter-request-id': 'header-request',
						'x-openrouter-model': 'provider/header-model'
					}
				}
			)
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'reasoning', reasoning: 'private chain' },
			{ type: 'text', content: 'Visible answer' },
			{
				type: 'done',
				finishedReason: 'stop',
				usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 }
			}
		]);
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, request] = vi.mocked(fetchImpl).mock.calls[0]!;
		expect(url).toBe('https://openrouter.example/api/v1/chat/completions');
		const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
		expect(body).toMatchObject({
			model: 'provider/primary',
			models: ['provider/fallback'],
			messages: [
				{ role: 'system', content: 'System prompt' },
				{ role: 'user', content: 'Current request' }
			],
			tool_choice: 'none',
			stream: true,
			stream_options: { include_usage: true },
			reasoning: { exclude: true },
			provider: { allow_fallbacks: true, data_collection: 'deny' },
			session_id: SESSION_ID,
			prompt_cache_key: SESSION_ID,
			usage: { include: true }
		});
		expect(body).not.toHaveProperty('tools');
		expect(test.observations).toEqual([
			expect.objectContaining({
				usageLogId: expect.stringMatching(/^[0-9a-f-]{36}$/),
				status: 'success',
				logicalProviderRound: 1,
				attemptedRouteIds: ['openrouter'],
				routeId: 'openrouter',
				modelRequested: 'provider/primary',
				modelUsed: 'provider/resolved',
				provider: 'Resolved Provider',
				requestId: 'request-1',
				promptTokens: 8,
				completionTokens: 2,
				totalTokens: 10,
				reasoningTokens: 1,
				cachedPromptTokens: 3,
				cacheWriteTokens: 1,
				cacheStatus: '37.5% cache hit',
				estimated: false,
				providerCost: 0.001,
				providerInputCost: 0.00025,
				providerOutputCost: 0.00055,
				costSource: 'provider_reported',
				providerByok: true,
				providerUpstreamInferenceCost: 0.0008,
				error: null
			})
		]);
		expect(test.lifecycleObservations).toEqual([
			expect.objectContaining({
				phase: 'provider',
				eventType: 'provider_attempt_started',
				payload: {
					round: 'initial',
					logical_provider_round: 1,
					route_id: 'openrouter',
					model_requested: 'provider/primary'
				}
			}),
			expect.objectContaining({
				phase: 'provider',
				eventType: 'provider_attempt_ended',
				payload: expect.objectContaining({
					round: 'initial',
					logical_provider_round: 1,
					route_id: 'openrouter',
					status: 'success',
					finish_reason: 'stop',
					usage: {
						prompt_tokens: 8,
						completion_tokens: 2,
						total_tokens: 10,
						reasoning_tokens: 1,
						cached_prompt_tokens: 3,
						cache_write_tokens: 1
					}
				})
			})
		]);
		expect(JSON.stringify(test.lifecycleObservations)).not.toContain('Visible answer');
	});

	it('falls back only before accepting a stream and accounts an estimated natural close', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'temporarily unavailable' } }), {
					status: 503,
					headers: { 'content-type': 'application/json' }
				})
			)
			.mockResolvedValueOnce(
				sseResponse(
					[
						JSON.stringify({ choices: [{ delta: { content: 'fallback answer' } }] }),
						JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })
					],
					{ includeFinalNewline: false }
				)
			) as unknown as typeof fetch;
		const test = harness(fetchImpl, [
			route({ id: 'primary' }),
			route({
				id: 'direct',
				kind: 'openai_compatible',
				baseUrl: 'https://direct.example/v1',
				model: 'direct/model',
				fallbackModels: []
			})
		]);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'fallback answer' },
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
			'https://openrouter.example/api/v1/chat/completions',
			'https://direct.example/v1/chat/completions'
		]);
		const directBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
		expect(directBody).toMatchObject({
			model: 'direct/model',
			tool_choice: 'none',
			stream: true,
			stream_options: { include_usage: true }
		});
		expect(directBody).not.toHaveProperty('provider');
		expect(directBody).not.toHaveProperty('reasoning');
		expect(test.observations[0]).toMatchObject({
			status: 'success',
			attemptedRouteIds: ['primary', 'direct'],
			routeId: 'direct',
			modelRequested: 'direct/model',
			estimated: true,
			completionTokens: 4,
			error: null
		});
		expect(
			test.lifecycleObservations.map(({ eventType, payload }) => ({
				eventType,
				routeId: payload.route_id,
				status: payload.status ?? null
			}))
		).toEqual([
			{ eventType: 'provider_attempt_started', routeId: 'primary', status: null },
			{ eventType: 'provider_attempt_ended', routeId: 'primary', status: 'failure' },
			{ eventType: 'provider_attempt_started', routeId: 'direct', status: null },
			{ eventType: 'provider_attempt_ended', routeId: 'direct', status: 'success' }
		]);
	});

	it('forwards deterministic multimodal current-turn content without rewriting signed URLs', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({ choices: [{ delta: { content: 'Seen.' } }] }),
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
				'[DONE]'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const signedUrl = 'https://storage.example/signed/image?token=ephemeral';
		await collect(
			test.client.stream({
				...input(),
				messages: [
					{ role: 'system', content: 'System prompt' },
					{
						role: 'user',
						content: [
							{ type: 'text', text: 'Inspect the current image.' },
							{
								type: 'image_url',
								image_url: { url: signedUrl, detail: 'auto' }
							}
						]
					}
				]
			})
		);
		const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
		expect(body.messages).toEqual([
			{ role: 'system', content: 'System prompt' },
			{
				role: 'user',
				content: [
					{ type: 'text', text: 'Inspect the current image.' },
					{
						type: 'image_url',
						image_url: { url: signedUrl, detail: 'auto' }
					}
				]
			}
		]);
	});

	it('passes through one streamed read-tool call with the exact artifact-scoped HTTP surface', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'provider-read-1',
										type: 'function',
										function: {
											name: 'get_project_overview',
											arguments: '{"query":"9takes"}'
										}
									}
								]
							}
						}
					]
				}),
				JSON.stringify({
					usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 },
					choices: [{ delta: {}, finish_reason: 'tool_calls' }]
				}),
				'[DONE]'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const tools = [
			readToolDefinition('get_workspace_overview'),
			readToolDefinition('get_project_overview'),
			readToolDefinition('list_onto_tasks')
		];

		await expect(
			collect(
				test.client.stream({
					...input(),
					tools,
					toolChoice: 'auto'
				})
			)
		).resolves.toEqual([
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id: 'provider-read-1',
						type: 'function',
						function: {
							name: 'get_project_overview',
							arguments: '{"query":"9takes"}'
						}
					}
				]
			},
			{
				type: 'done',
				finishedReason: 'tool_calls',
				usage: { promptTokens: 9, completionTokens: 2, totalTokens: 11 }
			}
		]);
		const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({ tool_choice: 'auto', tools });
	});

	it('requires a semantic disposition tool call with the exact restricted surface', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'provider-disposition-1',
										type: 'function',
										function: {
											name: 'declare_read_only_turn',
											arguments:
												'{"reason":"The user requested analysis only."}'
										}
									}
								]
							}
						}
					]
				}),
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
				'[DONE]'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const tools = [
			readToolDefinition('declare_turn_contract'),
			readToolDefinition('declare_read_only_turn'),
			readToolDefinition('request_turn_clarification')
		];

		await expect(
			collect(
				test.client.stream({
					...input(),
					tools,
					toolChoice: 'required'
				})
			)
		).resolves.toEqual([
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id: 'provider-disposition-1',
						type: 'function',
						function: {
							name: 'declare_read_only_turn',
							arguments: '{"reason":"The user requested analysis only."}'
						}
					}
				]
			},
			{ type: 'done', finishedReason: 'tool_calls', usage: undefined }
		]);
		const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({ tool_choice: 'required', tools });
	});

	it('rejects a malformed artifact tool definition before opening the network', async () => {
		const fetchImpl = vi.fn() as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const malformed = {
			type: 'function' as const,
			function: {
				name: 'get_project_overview',
				description: 'Read one project.',
				parameters: { additionalProperties: true }
			}
		};

		await expect(
			collect(
				test.client.stream({
					...input(),
					tools: [malformed],
					toolChoice: 'auto'
				})
			)
		).rejects.toThrow('read tool definition is invalid');
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('accepts the full reviewed read and mutation provider surface', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({ choices: [{ delta: { content: 'Ready.' } }] }),
				JSON.stringify({
					choices: [{ delta: {}, finish_reason: 'stop' }],
					usage: { prompt_tokens: 7, completion_tokens: 2, total_tokens: 9 }
				}),
				'[DONE]'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const tools = [
			...AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
			...AGENTIC_CHAT_MUTATION_SURFACE_AUDIT_V1.reviewedToolNames
		].map(readToolDefinition);

		await expect(
			collect(
				test.client.stream({
					...input(),
					tools,
					toolChoice: 'auto'
				})
			)
		).resolves.toEqual([
			{ type: 'text', content: 'Ready.' },
			{
				type: 'done',
				finishedReason: 'stop',
				usage: { promptTokens: 7, completionTokens: 2, totalTokens: 9 }
			}
		]);
		const body = JSON.parse(String(vi.mocked(fetchImpl).mock.calls[0]?.[1]?.body));
		expect(body).toMatchObject({ tool_choice: 'auto', tools });
	});

	it('rejects multiple streamed choices instead of silently ignoring one', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({
					choices: [{ delta: { content: 'first' } }, { delta: { content: 'second' } }]
				})
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider returned more than one streamed choice',
				retryable: false
			}
		]);
		expect(test.observations[0]).toMatchObject({ status: 'failure', retryable: false });
	});

	it('rejects an HTTP 200 non-SSE body before acceptance and tries the next route', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({ choices: [{ message: { content: 'not a stream' } }] }),
					{
						status: 200,
						headers: { 'content-type': 'text/event-stream+json' }
					}
				)
			)
			.mockResolvedValueOnce(
				sseResponse([
					JSON.stringify({ choices: [{ delta: { content: 'streamed fallback' } }] }),
					'[DONE]'
				])
			) as unknown as typeof fetch;
		const test = harness(fetchImpl, [
			route({ id: 'non-sse' }),
			route({ id: 'fallback', model: 'provider/fallback-route' })
		]);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'streamed fallback' },
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.observations[0]).toMatchObject({
			status: 'success',
			attemptedRouteIds: ['non-sse', 'fallback'],
			routeId: 'fallback',
			modelRequested: 'provider/fallback-route'
		});
	});

	it('does not reinterpret a successful direct fallback as an OpenRouter model pin', async () => {
		const requests: Array<Record<string, unknown>> = [];
		const fetchImpl = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
			requests.push(JSON.parse(String(request?.body)) as Record<string, unknown>);
			if (requests.length === 1) {
				return new Response(
					JSON.stringify({ error: { message: 'openrouter unavailable' } }),
					{
						status: 503,
						headers: { 'content-type': 'application/json' }
					}
				);
			}
			return sseResponse([
				JSON.stringify({
					model: requests.length === 2 ? 'direct/model' : 'provider/fallback',
					provider_slug:
						requests.length === 2 ? 'direct-provider' : 'openrouter-provider',
					choices: [
						{ delta: { content: requests.length === 2 ? 'Direct' : 'OpenRouter' } }
					]
				}),
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
				'[DONE]'
			]);
		}) as unknown as typeof fetch;
		const test = harness(fetchImpl, [
			route({ id: 'openrouter' }),
			route({
				id: 'direct',
				kind: 'openai_compatible',
				baseUrl: 'https://direct.example/v1',
				model: 'direct/model',
				fallbackModels: []
			})
		]);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'Direct' },
			expect.objectContaining({ type: 'done' })
		]);
		await expect(
			collect(
				test.client.stream({
					...input(),
					streamRunId: 'stream-run-2',
					logicalProviderRound: 2
				})
			)
		).resolves.toEqual([
			{ type: 'text', content: 'OpenRouter' },
			expect.objectContaining({ type: 'done' })
		]);

		expect(requests[2]).toMatchObject({
			model: 'provider/fallback',
			models: ['provider/primary']
		});
		expect(requests[2]?.model).not.toBe('direct/model');
	});

	it('surfaces a retryable mid-stream error frame without reporting a successful done', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				JSON.stringify({ choices: [{ delta: { content: 'partial' } }] }),
				JSON.stringify({ error: { code: 429, message: 'rate limited' } })
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'partial' },
			{ type: 'error', error: 'rate limited', retryable: true }
		]);
		expect(test.observations[0]).toMatchObject({
			status: 'failure',
			estimated: true,
			completionTokens: 2,
			retryable: true,
			error: 'rate limited'
		});
	});

	it('keeps failed model and provider health for later retries in the same turn', async () => {
		const requests: Array<Record<string, unknown>> = [];
		const fetchImpl = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
			requests.push(JSON.parse(String(request?.body)) as Record<string, unknown>);
			if (requests.length === 1) {
				return sseResponse([
					JSON.stringify({
						openrouter_metadata: {
							strategy: 'fallback',
							attempt: 2,
							attempts: [
								{
									model: 'deepseek/deepseek-v4',
									provider: 'DigitalOcean',
									status: 408
								}
							]
						},
						error: { code: 408, message: 'provider timed out' }
					})
				]);
			}
			return sseResponse([
				JSON.stringify({
					model: 'google/gemini-2.5-flash',
					provider: 'google-vertex',
					choices: [{ delta: { content: 'Recovered' }, finish_reason: 'stop' }]
				}),
				'[DONE]'
			]);
		}) as unknown as typeof fetch;
		const test = harness(fetchImpl, [
			route({
				model: 'deepseek/deepseek-v4',
				fallbackModels: ['google/gemini-2.5-flash']
			})
		]);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'error', error: 'provider timed out', retryable: true }
		]);
		await expect(
			collect(
				test.client.stream({
					...input(),
					streamRunId: 'stream-run-2',
					logicalProviderRound: 2
				})
			)
		).resolves.toEqual([
			{ type: 'text', content: 'Recovered' },
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
		await collect(
			test.client.stream({
				...input(),
				streamRunId: 'stream-run-3',
				logicalProviderRound: 3
			})
		);
		await collect(
			test.client.stream({
				...input(),
				turnRunId: '30000000-0000-4000-8000-000000000099',
				streamRunId: 'stream-run-other-turn',
				logicalProviderRound: 1
			})
		);

		expect(requests[1]).toMatchObject({
			model: 'google/gemini-2.5-flash',
			models: ['deepseek/deepseek-v4'],
			provider: { ignore: ['digitalocean'] }
		});
		expect(requests[2]).toMatchObject({
			model: 'google/gemini-2.5-flash',
			provider: { ignore: ['digitalocean'] }
		});
		expect(requests[3]).toMatchObject({
			model: 'deepseek/deepseek-v4',
			models: ['google/gemini-2.5-flash']
		});
		expect(requests[3]?.provider).not.toMatchObject({ ignore: expect.anything() });
		const firstHeaders = vi.mocked(fetchImpl).mock.calls[0]?.[1]?.headers as Record<
			string,
			string
		>;
		expect(firstHeaders['X-OpenRouter-Metadata']).toBe('enabled');
	});

	it('pins later passes to the first successful model and provider until that route fails', async () => {
		const requests: Array<Record<string, unknown>> = [];
		const fetchImpl = vi.fn(async (_url: string | URL | Request, request?: RequestInit) => {
			requests.push(JSON.parse(String(request?.body)) as Record<string, unknown>);
			if (requests.length === 2) {
				return new Response(
					JSON.stringify({ error: { message: 'pinned route unavailable' } }),
					{
						status: 503,
						headers: { 'content-type': 'application/json' }
					}
				);
			}
			return sseResponse([
				JSON.stringify({
					model:
						requests.length === 1 ? 'provider/resolved-fallback' : 'provider/primary',
					provider: requests.length === 1 ? 'Warm Provider' : 'Recovery Provider',
					provider_slug: requests.length === 1 ? 'warm-provider' : 'recovery-provider',
					choices: [{ delta: { content: requests.length === 1 ? 'First' : 'Recovered' } }]
				}),
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
				'[DONE]'
			]);
		}) as unknown as typeof fetch;
		const test = harness(fetchImpl, [
			route({
				model: 'provider/primary',
				fallbackModels: ['provider/resolved-fallback'],
				providerRouting: { order: ['default-provider'], allow_fallbacks: true }
			})
		]);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'First' },
			expect.objectContaining({ type: 'done', finishedReason: 'stop' })
		]);
		await expect(
			collect(
				test.client.stream({
					...input(),
					streamRunId: 'stream-run-2',
					logicalProviderRound: 2
				})
			)
		).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider start failed (503): pinned route unavailable',
				retryable: true
			}
		]);
		await expect(
			collect(
				test.client.stream({
					...input(),
					streamRunId: 'stream-run-3',
					logicalProviderRound: 3
				})
			)
		).resolves.toEqual([
			{ type: 'text', content: 'Recovered' },
			expect.objectContaining({ type: 'done', finishedReason: 'stop' })
		]);

		expect(requests[0]).toMatchObject({
			model: 'provider/primary',
			models: ['provider/resolved-fallback'],
			provider: { order: ['default-provider'], allow_fallbacks: true }
		});
		expect(requests[1]).toMatchObject({
			model: 'provider/resolved-fallback',
			provider: { order: ['warm-provider'], allow_fallbacks: false }
		});
		expect(requests[1]).not.toHaveProperty('models');
		expect(requests[2]).toMatchObject({
			model: 'provider/primary',
			models: ['provider/resolved-fallback'],
			provider: { order: ['default-provider'], allow_fallbacks: true }
		});
	});

	it('handles split CRLF frames and completes safely without an explicit DONE marker', async () => {
		const fetchImpl = vi.fn(async () =>
			splitSseResponse([
				'data: {"choices":[{"delta":{"content":"split',
				' answer"}}]}\r\n\r\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);

		await expect(collect(test.client.stream(input()))).resolves.toEqual([
			{ type: 'text', content: 'split answer' },
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
	});

	it('treats finish_reason=error and malformed usage as failed protocol outcomes', async () => {
		const errorFinish = harness(
			vi.fn(async () =>
				sseResponse([
					JSON.stringify({ choices: [{ delta: {}, finish_reason: 'error' }] }),
					'[DONE]'
				])
			) as unknown as typeof fetch
		);
		await expect(collect(errorFinish.client.stream(input()))).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider stream ended with finish_reason=error',
				retryable: false
			}
		]);
		expect(errorFinish.observations[0]).toMatchObject({ status: 'failure' });

		const malformedUsage = harness(
			vi.fn(async () =>
				sseResponse([
					JSON.stringify({
						usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 99 },
						choices: [{ delta: {}, finish_reason: 'stop' }]
					}),
					'[DONE]'
				])
			) as unknown as typeof fetch
		);
		await expect(collect(malformedUsage.client.stream(input()))).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider usage payload is malformed',
				retryable: false
			}
		]);
		expect(malformedUsage.observations[0]).toMatchObject({
			status: 'failure',
			estimated: true
		});
	});

	it('propagates external abort and records aborted estimated usage', async () => {
		const controller = new AbortController();
		const fetchImpl = vi.fn(
			(_url: string | URL | Request, request?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					request?.signal?.addEventListener(
						'abort',
						() => reject(request.signal?.reason ?? new Error('aborted')),
						{ once: true }
					);
				})
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const aborted = new Error('user cancelled');
		const collecting = collect(test.client.stream(input(controller.signal)));
		await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());

		controller.abort(aborted);
		await expect(collecting).rejects.toBe(aborted);
		expect(test.observations[0]).toMatchObject({
			status: 'aborted',
			attemptedRouteIds: ['openrouter'],
			estimated: true,
			retryable: false,
			error: 'user cancelled'
		});
	});

	it('classifies the bounded request timeout as retryable provider pressure', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi.fn(
			(_url: string | URL | Request, request?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					request?.signal?.addEventListener(
						'abort',
						() => reject(request.signal?.reason ?? new Error('timed out')),
						{ once: true }
					);
				})
		) as unknown as typeof fetch;
		const observations: AgenticChatProviderUsageObservationV1[] = [];
		const client = new AgenticChatOpenRouterClient(
			{ usage: { observe: (observation) => observations.push(observation) } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				requestTimeoutMs: 1_000
			}
		);
		const collecting = collect(client.stream(input()));
		await vi.advanceTimersByTimeAsync(1_000);

		await expect(collecting).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider request timed out after 1000ms',
				retryable: true
			}
		]);
		expect(observations[0]).toMatchObject({
			status: 'failure',
			routeId: 'openrouter',
			modelRequested: 'provider/primary',
			retryable: true,
			estimated: true
		});
	});

	it('applies the request timeout after headers while the SSE body is stalled', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi.fn(
			async () =>
				new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
					status: 200,
					headers: { 'content-type': 'text/event-stream' }
				})
		) as unknown as typeof fetch;
		const observations: AgenticChatProviderUsageObservationV1[] = [];
		const lifecycleObservations: AgenticChatExecutionObservationInputV1[] = [];
		const client = new AgenticChatOpenRouterClient(
			{
				usage: { observe: (observation) => observations.push(observation) },
				executionObservations: {
					observe: (observation) => lifecycleObservations.push(observation)
				}
			},
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				requestTimeoutMs: 1_000
			}
		);
		const collecting = collect(client.stream(input()));
		await vi.advanceTimersByTimeAsync(1_000);

		await expect(collecting).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider request timed out after 1000ms',
				retryable: true
			}
		]);
		expect(observations[0]).toMatchObject({
			status: 'failure',
			retryable: true,
			estimated: true
		});
		const providerTiming = lifecycleObservations[1]?.payload.provider_timing as
			| Record<string, unknown>
			| undefined;
		expect(providerTiming).toMatchObject({
			network_started_at_ms: expect.any(Number),
			deadline_at_ms: expect.any(Number),
			response_opened_at_ms: expect.any(Number),
			timeout_fired_at_ms: expect.any(Number),
			timeout_overshoot_ms: 0,
			post_timeout_cleanup_ms: 0,
			network_boundary_ms: 1_000
		});
		expect(providerTiming?.deadline_at_ms).toBe(
			Number(providerTiming?.network_started_at_ms) + 1_000
		);
		expect(providerTiming?.timeout_fired_at_ms).toBe(providerTiming?.deadline_at_ms);
	});

	it('does not leak a rejected body read when timeout aborts the provider stream', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, request?: RequestInit) =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							request?.signal?.addEventListener(
								'abort',
								() =>
									controller.error(
										request.signal?.reason ?? new Error('timed out')
									),
								{ once: true }
							);
						}
					}),
					{ status: 200, headers: { 'content-type': 'text/event-stream' } }
				)
		) as unknown as typeof fetch;
		const client = new AgenticChatOpenRouterClient(
			{ usage: { observe: vi.fn() } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				requestTimeoutMs: 1_000
			}
		);
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);

		try {
			const collecting = collect(client.stream(input()));
			await vi.advanceTimersByTimeAsync(1_000);

			await expect(collecting).resolves.toEqual([
				{
					type: 'error',
					error: 'Agentic Chat provider request timed out after 1000ms',
					retryable: true
				}
			]);
			await Promise.resolve();
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('does not start an unhandled body read after timeout while an SSE event is yielded', async () => {
		vi.useFakeTimers();
		const encoder = new TextEncoder();
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, request?: RequestInit) =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(
								encoder.encode(
									'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n'
								)
							);
							request?.signal?.addEventListener(
								'abort',
								() =>
									controller.error(
										request.signal?.reason ?? new Error('timed out')
									),
								{ once: true }
							);
						}
					}),
					{ status: 200, headers: { 'content-type': 'text/event-stream' } }
				)
		) as unknown as typeof fetch;
		const client = new AgenticChatOpenRouterClient(
			{ usage: { observe: vi.fn() } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				requestTimeoutMs: 1_000
			}
		);
		const iterator = client.stream(input())[Symbol.asyncIterator]();
		const unhandled: unknown[] = [];
		const onUnhandled = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', onUnhandled);

		try {
			await expect(iterator.next()).resolves.toEqual({
				done: false,
				value: { type: 'text', content: 'Partial' }
			});
			await vi.advanceTimersByTimeAsync(1_000);
			await expect(iterator.next()).resolves.toEqual({
				done: false,
				value: {
					type: 'error',
					error: 'Agentic Chat provider request timed out after 1000ms',
					retryable: true
				}
			});
			await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
			await vi.advanceTimersByTimeAsync(0);
			expect(unhandled).toEqual([]);
		} finally {
			process.off('unhandledRejection', onUnhandled);
		}
	});

	it('does not drain buffered SSE events after timeout while an event is yielded', async () => {
		vi.useFakeTimers();
		const encoder = new TextEncoder();
		const fetchImpl = vi.fn(
			async (_url: string | URL | Request, request?: RequestInit) =>
				new Response(
					new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(
								encoder.encode(
									'data: {"choices":[{"delta":{"content":"First"}}]}\n\n' +
										'data: {"choices":[{"delta":{"content":"Second"}}]}\n\n'
								)
							);
							request?.signal?.addEventListener(
								'abort',
								() =>
									controller.error(
										request.signal?.reason ?? new Error('timed out')
									),
								{ once: true }
							);
						}
					}),
					{ status: 200, headers: { 'content-type': 'text/event-stream' } }
				)
		) as unknown as typeof fetch;
		const client = new AgenticChatOpenRouterClient(
			{ usage: { observe: vi.fn() } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				requestTimeoutMs: 1_000
			}
		);
		const iterator = client.stream(input())[Symbol.asyncIterator]();

		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: { type: 'text', content: 'First' }
		});
		await vi.advanceTimersByTimeAsync(1_000);
		await expect(iterator.next()).resolves.toEqual({
			done: false,
			value: {
				type: 'error',
				error: 'Agentic Chat provider request timed out after 1000ms',
				retryable: true
			}
		});
		await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
	});

	it('bounds route configuration and the SSE buffer before any provider use', async () => {
		expect(
			() =>
				new AgenticChatOpenRouterClient(
					{ usage: { observe: vi.fn() } },
					{
						routes: [route({ baseUrl: 'http://insecure.example/v1' })],
						httpReferer: 'https://build-os.com',
						appName: 'BuildOS'
					}
				)
		).toThrow('clean HTTPS base URL');
		expect(
			() =>
				new AgenticChatOpenRouterClient(
					{ usage: { observe: vi.fn() } },
					{
						routes: [route({ providerRouting: { data_collection: 'allow' } })],
						httpReferer: 'https://build-os.com',
						appName: 'BuildOS'
					}
				)
		).toThrow('cannot allow data collection');
		expect(
			() =>
				new AgenticChatOpenRouterClient(
					{ usage: { observe: vi.fn() } },
					{
						routes: [
							route({
								kind: 'openai_compatible',
								fallbackModels: ['ignored/model']
							})
						],
						httpReferer: 'https://build-os.com',
						appName: 'BuildOS'
					}
				)
		).toThrow('cannot declare fallback models');
		expect(
			() =>
				new AgenticChatOpenRouterClient(
					{ usage: { observe: vi.fn() } },
					{
						routes: [route({ headers: { Accept: 'application/json' } })],
						httpReferer: 'https://build-os.com',
						appName: 'BuildOS'
					}
				)
		).toThrow('cannot override protected headers');

		const routedFetch = vi.fn(async () => sseResponse(['[DONE]'])) as unknown as typeof fetch;
		const routed = harness(routedFetch, [route({ providerRouting: { sort: 'latency' } })]);
		await expect(collect(routed.client.stream(input()))).resolves.toEqual([
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
		const routedBody = JSON.parse(String(vi.mocked(routedFetch).mock.calls[0]?.[1]?.body));
		expect(routedBody.provider).toEqual({
			allow_fallbacks: true,
			data_collection: 'deny',
			sort: 'latency'
		});

		const fetchImpl = vi.fn(
			async () =>
				new Response(`data: ${'x'.repeat(2_000)}`, {
					status: 200,
					headers: { 'content-type': 'text/event-stream' }
				})
		) as unknown as typeof fetch;
		const test = new AgenticChatOpenRouterClient(
			{ usage: { observe: vi.fn() } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl,
				maxSseBufferBytes: 1_024
			}
		);
		await expect(collect(test.stream(input()))).resolves.toEqual([
			{
				type: 'error',
				error: 'Agentic Chat provider SSE buffer exceeded its bound',
				retryable: false
			}
		]);
	});

	it('does not let usage-observer failure change the provider result', async () => {
		const onUsageError = vi.fn();
		const client = new AgenticChatOpenRouterClient(
			{
				usage: {
					observe: vi.fn(async () => {
						throw new Error('usage database offline');
					})
				},
				onUsageError
			},
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl: vi.fn(async () => sseResponse(['[DONE]'])) as unknown as typeof fetch
			}
		);

		await expect(collect(client.stream(input()))).resolves.toEqual([
			{ type: 'done', finishedReason: 'stop', usage: undefined }
		]);
		expect(onUsageError).toHaveBeenCalledOnce();
	});

	it('awaits usage accounting before exposing the provider terminal event', async () => {
		let releaseUsage!: () => void;
		const usageSettled = new Promise<void>((resolve) => {
			releaseUsage = resolve;
		});
		const observe = vi.fn(() => usageSettled);
		const client = new AgenticChatOpenRouterClient(
			{ usage: { observe } },
			{
				routes: [route()],
				httpReferer: 'https://build-os.com',
				appName: 'BuildOS',
				fetchImpl: vi.fn(async () => sseResponse(['[DONE]'])) as unknown as typeof fetch
			}
		);
		const iterator = client.stream(input())[Symbol.asyncIterator]();
		let terminalExposed = false;
		const terminal = iterator.next().then((result) => {
			terminalExposed = true;
			return result;
		});

		await vi.waitFor(() => expect(observe).toHaveBeenCalledOnce());
		expect(terminalExposed).toBe(false);
		releaseUsage();
		await expect(terminal).resolves.toEqual({
			done: false,
			value: { type: 'done', finishedReason: 'stop', usage: undefined }
		});
	});

	it('maps observations into the durable shared usage logger contract', async () => {
		const logger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const observer = new AgenticChatLlmUsageObserver(logger);

		await observer.observe({
			usageLogId: '60000000-0000-5000-8000-000000000006',
			status: 'failure',
			requestStartedAtMs: 1_000,
			observedAtMs: 1_250,
			userId: USER_ID,
			sessionId: SESSION_ID,
			turnRunId: TURN_RUN_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: '40000000-0000-4000-8000-000000000004',
			logicalProviderRound: 3,
			providerAttempt: 2,
			attemptedRouteIds: ['openrouter', 'direct'],
			routeId: 'direct',
			modelRequested: 'direct/requested',
			modelUsed: 'direct/resolved',
			provider: 'Direct Provider',
			requestId: 'request-1',
			promptTokens: 10,
			completionTokens: 4,
			totalTokens: 14,
			reasoningTokens: 2,
			cachedPromptTokens: 5,
			cacheWriteTokens: 1,
			cacheStatus: '50% cache hit',
			estimated: true,
			providerCost: 0.002,
			providerInputCost: 0.0007,
			providerOutputCost: 0.0013,
			costSource: 'provider_reported',
			providerByok: true,
			providerUpstreamInferenceCost: 0.0015,
			retryable: true,
			error: 'rate limited'
		});

		expect(logger.logUsageToDatabase).toHaveBeenCalledWith({
			id: '60000000-0000-5000-8000-000000000006',
			userId: USER_ID,
			operationType: 'agentic_chat_worker_stream',
			modelRequested: 'direct/requested',
			modelUsed: 'direct/resolved',
			provider: 'Direct Provider',
			promptTokens: 10,
			completionTokens: 4,
			totalTokens: 14,
			inputCost: 0.0007,
			outputCost: 0.0013,
			totalCost: 0.002,
			responseTimeMs: 250,
			requestStartedAt: new Date(1_000),
			requestCompletedAt: new Date(1_250),
			status: 'failure',
			errorMessage: 'rate limited',
			streaming: true,
			projectId: '40000000-0000-4000-8000-000000000004',
			chatSessionId: SESSION_ID,
			turnRunId: TURN_RUN_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			openrouterRequestId: 'request-1',
			openrouterUsageCost: 0.002,
			openrouterCacheStatus: '50% cache hit',
			openrouterByok: true,
			openrouterUpstreamInferenceCost: 0.0015,
			reasoningTokens: 2,
			cachedPromptTokens: 5,
			cacheWriteTokens: 1,
			metadata: {
				contextType: 'project',
				entityId: 'project-1',
				routeId: 'direct',
				logicalProviderRound: 3,
				providerAttempt: 2,
				attemptedRouteIds: ['openrouter', 'direct'],
				estimatedUsage: true,
				costSource: 'provider_reported',
				retryable: true,
				providerStatus: 'failure'
			}
		});
	});
});

/**
 * Live evidence: Agentic Chat worker Phase 6 / Phase 4 rerun 2026-08-20,
 * `project-organize` reps 1 and 2 (stream runs ce06a335 / b95927e8). The semantic
 * reviewer runs with `maxTokens: 1_200`. Both turns recorded `completion_tokens:
 * 1200` — exactly the cap — and both died with `provider_tool_arguments_invalid`.
 * Of 32 reviewer calls in that battery only these two reached the cap; the next
 * highest was 909. `agentic_chat_execution_observations` shows the provider
 * nevertheless reported `finish_reason: "tool_calls"`, so every downstream
 * truncation guard was bypassed and truncated tool arguments were parsed as if
 * they were complete. The cap we sent is ground truth the provider's claim is not.
 */
describe('max-token truncation detection', () => {
	const cappedFrames = [
		JSON.stringify({
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id: 'reviewer-call-1',
								type: 'function',
								function: {
									name: 'approve_turn_contract_review',
									arguments:
										'{"contract_sha256":"abc","reason":"the six loose doc'
								}
							}
						]
					}
				}
			]
		}),
		JSON.stringify({
			choices: [{ delta: {}, finish_reason: 'tool_calls' }],
			usage: { prompt_tokens: 8896, completion_tokens: 1200, total_tokens: 10096 }
		}),
		'[DONE]'
	];

	it('reports a capped generation as truncated even when the provider claims tool_calls', async () => {
		const fetchImpl = vi.fn(async () => sseResponse(cappedFrames));
		const { client } = harness(fetchImpl as unknown as typeof fetch, [route()], {
			maxTokens: 1_200
		});
		const events = await collect(client.stream({ ...input(), tools: [], toolChoice: 'none' }));
		const done = events.find((event) => event.type === 'done');
		expect(done).toMatchObject({ type: 'done', finishedReason: 'length' });
	});

	it('leaves an uncapped generation’s finish reason untouched', async () => {
		const frames = [
			cappedFrames[0]!,
			JSON.stringify({
				choices: [{ delta: {}, finish_reason: 'tool_calls' }],
				usage: { prompt_tokens: 8896, completion_tokens: 909, total_tokens: 9805 }
			}),
			'[DONE]'
		];
		const fetchImpl = vi.fn(async () => sseResponse(frames));
		const { client } = harness(fetchImpl as unknown as typeof fetch, [route()], {
			maxTokens: 1_200
		});
		const events = await collect(client.stream({ ...input(), tools: [], toolChoice: 'none' }));
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'tool_calls'
		});
	});

	it('records the corrected finish reason on the provider attempt observation', async () => {
		const fetchImpl = vi.fn(async () => sseResponse(cappedFrames));
		const { client, lifecycleObservations } = harness(
			fetchImpl as unknown as typeof fetch,
			[route()],
			{ maxTokens: 1_200 }
		);
		await collect(client.stream({ ...input(), tools: [], toolChoice: 'none' }));
		const ended = lifecycleObservations.find(
			(observation) => observation.eventType === 'provider_attempt_ended'
		);
		expect(ended?.payload).toMatchObject({ finish_reason: 'length' });
	});
});

describe('rejected tool-call receipt', () => {
	function toolCallFrames(
		call: { name: string; arguments?: unknown; id?: string },
		finishReason = 'tool_calls'
	) {
		return [
			JSON.stringify({
				choices: [
					{
						delta: {
							tool_calls: [
								{
									index: 0,
									id: call.id ?? 'provider-call-1',
									type: 'function',
									function: {
										name: call.name,
										arguments: call.arguments ?? '{"query":"9takes"}'
									}
								}
							]
						}
					}
				]
			}),
			JSON.stringify({
				usage: { prompt_tokens: 9, completion_tokens: 2, total_tokens: 11 },
				choices: [{ delta: {}, finish_reason: finishReason }]
			}),
			'[DONE]'
		];
	}

	const tools = [
		readToolDefinition('get_workspace_overview'),
		readToolDefinition('get_project_overview'),
		readToolDefinition('list_onto_tasks')
	];

	async function endedPayload(frames: string[], toolChoice: 'auto' | 'none' = 'auto') {
		const fetchImpl = vi.fn(async () => sseResponse(frames)) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		await collect(
			test.client.stream({
				...input(),
				tools: toolChoice === 'none' ? [] : tools,
				toolChoice
			})
		);
		const ended = test.lifecycleObservations.find(
			(observation) => observation.eventType === 'provider_attempt_ended'
		);
		expect(ended).toBeDefined();
		return ended!.payload;
	}

	it('names a tool call outside the advertised surface and the surface size', async () => {
		const payload = await endedPayload(toolCallFrames({ name: 'skill_load' }));
		expect(payload).toMatchObject({
			status: 'success',
			error_class: null,
			rejected_tool_name: 'skill_load',
			advertised_tool_count: 3
		});
	});

	it('keeps an unrepresentable rejected name out of the receipt but still counts it', async () => {
		const payload = await endedPayload(toolCallFrames({ name: 'drop table; --' }));
		expect(payload).toMatchObject({ rejected_tool_name: null, advertised_tool_count: 3 });
	});

	it('names the tool whose assembled arguments are not a JSON object', async () => {
		const truncated = await endedPayload(
			toolCallFrames({ name: 'get_project_overview', arguments: '{"query":"9ta' })
		);
		expect(truncated).toMatchObject({
			rejected_tool_name: 'get_project_overview',
			advertised_tool_count: 3
		});
		const wrongShape = await endedPayload(
			toolCallFrames({ name: 'list_onto_tasks', arguments: '[1,2]' })
		);
		expect(wrongShape).toMatchObject({ rejected_tool_name: 'list_onto_tasks' });
		const wrongType = await endedPayload(
			toolCallFrames({ name: 'list_onto_tasks', arguments: { query: 'x' } })
		);
		expect(wrongType).toMatchObject({ rejected_tool_name: 'list_onto_tasks' });
	});

	it('stays silent for an accepted call, including a provider-repeated advertised name', async () => {
		const accepted = await endedPayload(toolCallFrames({ name: 'get_project_overview' }));
		expect(accepted).not.toHaveProperty('rejected_tool_name');
		expect(accepted).not.toHaveProperty('advertised_tool_count');
		const repeated = await endedPayload(
			toolCallFrames({ name: 'get_project_overviewget_project_overview' })
		);
		expect(repeated).not.toHaveProperty('rejected_tool_name');
	});

	it('stays silent when no tool surface was offered', async () => {
		const payload = await endedPayload(toolCallFrames({ name: 'skill_load' }), 'none');
		expect(payload).not.toHaveProperty('rejected_tool_name');
		expect(payload).not.toHaveProperty('advertised_tool_count');
	});

	it('stays silent for an unrelated provider failure', async () => {
		const fetchImpl = vi.fn(async () =>
			sseResponse([
				toolCallFrames({ name: 'skill_load' })[0]!,
				JSON.stringify({ choices: [{ delta: {}, finish_reason: 'error' }] }),
				'[DONE]'
			])
		) as unknown as typeof fetch;
		const test = harness(fetchImpl);
		const events = await collect(test.client.stream({ ...input(), tools, toolChoice: 'auto' }));
		expect(events.at(-1)).toMatchObject({ type: 'error' });
		const ended = test.lifecycleObservations.find(
			(observation) => observation.eventType === 'provider_attempt_ended'
		);
		expect(ended?.payload).toMatchObject({ status: 'failure' });
		expect(ended?.payload).not.toHaveProperty('rejected_tool_name');
		expect(ended?.payload).not.toHaveProperty('advertised_tool_count');
	});

	it('never carries argument text, only the bounded name', async () => {
		const payload = await endedPayload(
			toolCallFrames({ name: 'skill_load', arguments: '{"secret":"do-not-retain"}' })
		);
		expect(JSON.stringify(payload)).not.toContain('do-not-retain');
		expect(Object.keys(payload).sort()).toEqual(
			[
				'advertised_tool_count',
				'duration_ms',
				'error_class',
				'finish_reason',
				'logical_provider_round',
				'model_requested',
				'model_used',
				'provider',
				'provider_timing',
				'rejected_tool_name',
				'round',
				'route_id',
				'status',
				'usage'
			].sort()
		);
	});
});
