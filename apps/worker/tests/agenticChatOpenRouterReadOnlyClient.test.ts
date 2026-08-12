// apps/worker/tests/agenticChatOpenRouterReadOnlyClient.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatLlmUsageObserver,
	AgenticChatOpenRouterReadOnlyClient,
	type AgenticChatOpenAiCompatibleRouteV1,
	type AgenticChatProviderUsageObservationV1
} from '../src/workers/agentic-chat/openRouterReadOnlyClient';
import type { AgenticChatReadOnlyProviderClientEventV1 } from '../src/workers/agentic-chat/readOnlyProvider';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';

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

function harness(fetchImpl: typeof fetch, routes = [route()]) {
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
	const client = new AgenticChatOpenRouterReadOnlyClient(
		{ usage, executionObservations },
		{
			routes,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 10_000
		}
	);
	return { client, usage, observations, executionObservations, lifecycleObservations };
}

async function collect(
	stream: AsyncIterable<AgenticChatReadOnlyProviderClientEventV1>
): Promise<AgenticChatReadOnlyProviderClientEventV1[]> {
	const events: AgenticChatReadOnlyProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe('AgenticChatOpenRouterReadOnlyClient', () => {
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
				status: 'success',
				attemptedRouteIds: ['openrouter'],
				routeId: 'openrouter',
				modelRequested: 'provider/primary',
				modelUsed: 'provider/resolved',
				provider: 'Resolved Provider',
				requestId: 'request-1',
				promptTokens: 8,
				completionTokens: 2,
				totalTokens: 10,
				estimated: false,
				providerCost: 0.001,
				error: null
			})
		]);
		expect(test.lifecycleObservations).toEqual([
			expect.objectContaining({
				phase: 'provider',
				eventType: 'provider_attempt_started',
				payload: {
					round: 'initial',
					route_id: 'openrouter',
					model_requested: 'provider/primary'
				}
			}),
			expect.objectContaining({
				phase: 'provider',
				eventType: 'provider_attempt_ended',
				payload: expect.objectContaining({
					round: 'initial',
					route_id: 'openrouter',
					status: 'success',
					finish_reason: 'stop',
					usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
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
		const client = new AgenticChatOpenRouterReadOnlyClient(
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

	it('bounds route configuration and the SSE buffer before any provider use', async () => {
		expect(
			() =>
				new AgenticChatOpenRouterReadOnlyClient(
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
				new AgenticChatOpenRouterReadOnlyClient(
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
				new AgenticChatOpenRouterReadOnlyClient(
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
				new AgenticChatOpenRouterReadOnlyClient(
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
		const test = new AgenticChatOpenRouterReadOnlyClient(
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
		const client = new AgenticChatOpenRouterReadOnlyClient(
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

	it('maps observations into the durable shared usage logger contract', async () => {
		const logger = { logUsageToDatabase: vi.fn(async () => undefined) };
		const observer = new AgenticChatLlmUsageObserver(logger);

		await observer.observe({
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
			attemptedRouteIds: ['openrouter', 'direct'],
			routeId: 'direct',
			modelRequested: 'direct/requested',
			modelUsed: 'direct/resolved',
			provider: 'Direct Provider',
			requestId: 'request-1',
			promptTokens: 10,
			completionTokens: 4,
			totalTokens: 14,
			estimated: true,
			providerCost: 0.002,
			retryable: true,
			error: 'rate limited'
		});

		expect(logger.logUsageToDatabase).toHaveBeenCalledWith({
			userId: USER_ID,
			operationType: 'agentic_chat_worker_stream',
			modelRequested: 'direct/requested',
			modelUsed: 'direct/resolved',
			provider: 'Direct Provider',
			promptTokens: 10,
			completionTokens: 4,
			totalTokens: 14,
			inputCost: 0,
			outputCost: 0,
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
			metadata: {
				contextType: 'project',
				entityId: 'project-1',
				routeId: 'direct',
				attemptedRouteIds: ['openrouter', 'direct'],
				estimatedUsage: true,
				retryable: true,
				providerStatus: 'failure'
			}
		});
	});
});
