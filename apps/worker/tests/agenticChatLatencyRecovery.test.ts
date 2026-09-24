// apps/worker/tests/agenticChatLatencyRecovery.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AgenticChatOpenRouterClient,
	type AgenticChatProviderUsageObservationV1
} from '../src/workers/agentic-chat/provider/openrouter-client';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import { streamBufferedProviderPass } from '../src/workers/agentic-chat/provider/provider-pass';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/effects/pending-effects';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/effects/execution-observation';

afterEach(() => vi.useRealTimers());
const V41 = 'deepseek/deepseek-v4.1-flash';
const V4 = 'deepseek/deepseek-v4-flash';
const encoder = new TextEncoder();
function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: 'Read the project status.' }],
		tools: [],
		toolChoice: 'none',
		userId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: '30000000-0000-4000-8000-000000000003',
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		contextType: 'project',
		entityId: null,
		projectId: null,
		queueJobId: '40000000-0000-4000-8000-000000000004',
		processingToken: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		providerRound: 'initial',
		logicalProviderRound: 1,
		passRole: 'acting',
		signal: new AbortController().signal,
		...overrides
	};
}
function controllableResponse(provider = 'Novita', model = V41) {
	let output!: ReadableStreamDefaultController<Uint8Array>;
	const cancel = vi.fn();
	const response = new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				output = controller;
			},
			cancel
		}),
		{
			headers: {
				'content-type': 'text/event-stream',
				'x-openrouter-provider': provider,
				'x-openrouter-model': model
			}
		}
	);
	const frame = (value: unknown) =>
		output.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
	return {
		response,
		cancel,
		frame,
		text(content: string) {
			frame({ model, provider, choices: [{ delta: { content }, finish_reason: null }] });
		},
		finish(reason = 'stop') {
			frame({
				choices: [{ delta: {}, finish_reason: reason }],
				usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
			});
			output.enqueue(encoder.encode('data: [DONE]\n\n'));
			output.close();
		}
	};
}
function harness(
	responses: Array<Response | (() => Promise<Response>)>,
	options: { holdUsage?: boolean; model?: string; timeoutMs?: number } = {}
) {
	const requests: Array<{ body: Record<string, any>; signal: AbortSignal }> = [];
	const usage: AgenticChatProviderUsageObservationV1[] = [];
	const observations: AgenticChatExecutionObservationInputV1[] = [];
	const pendingEffects = new AgenticChatPendingEffectsRegistry();
	const settleUsage: Array<() => void> = [];
	const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
		requests.push({
			body: JSON.parse(String(init!.body)),
			signal: init!.signal as AbortSignal
		});
		const response = responses.shift();
		if (!response) throw new Error('Unexpected third dispatch');
		return typeof response === 'function' ? response() : response;
	});
	const client = new AgenticChatOpenRouterClient(
		{
			pendingEffects,
			usage: {
				observe(observation) {
					usage.push(observation);
					if (options.holdUsage)
						return new Promise<void>((resolve) => settleUsage.push(resolve));
					return undefined;
				}
			},
			executionObservations: {
				async observe(observation) {
					observations.push(observation);
				}
			}
		},
		{
			routes: [
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: 'https://provider.invalid/api/v1',
					apiKey: 'fake',
					model: options.model ?? V41,
					fallbackModels: [V4],
					providerRouting: { sort: 'throughput', ignore: ['modal'] }
				}
			],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS test',
			fetchImpl,
			requestTimeoutMs: options.timeoutMs ?? 30_000
		}
	);
	const capacity = { markTemporarilyUnavailable: vi.fn() };
	return {
		client,
		capacity,
		fetchImpl,
		requests,
		usage,
		observations,
		pendingEffects,
		settleUsage,
		stream(input = request()) {
			return streamBufferedProviderPass(input, client, capacity, 2_000);
		}
	};
}
async function collect(stream: AsyncIterable<AgenticChatTurnProviderClientEventV1>) {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

describe('buffered slow-provider recovery', () => {
	it('lets the final retry open after five seconds without changing the first progress cutoff', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const fallback = controllableResponse('Wafer', V4);
		fallback.text('Recovered after a slower connection.');
		fallback.finish();
		const test = harness([
			slow.response,
			() => new Promise((resolve) => setTimeout(() => resolve(fallback.response), 6_500))
		]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(4_001);
		expect(test.requests).toHaveLength(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(5_001);
		expect(test.requests[1]!.signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1_500);
		expect(await collecting).toContainEqual({
			type: 'text',
			content: 'Recovered after a slower connection.'
		});
		expect(test.requests).toHaveLength(2);
	});

	it('caps the final retry at ten seconds and never creates a third attempt', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const test = harness([slow.response, () => new Promise(() => {})]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(14_001);
		const events = await collecting;
		expect(events).toContainEqual(
			expect.objectContaining({
				type: 'error',
				error: 'Agentic Chat provider request timed out after 10000ms'
			})
		);
		expect(test.requests).toHaveLength(2);
		expect(test.requests.every((r) => r.signal.aborted)).toBe(true);
	});

	it('clamps the extended retry header deadline to the turn finalization reserve', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const test = harness([slow.response, () => new Promise(() => {})]);
		const collecting = collect(
			test.stream(request({ budget: { deadlineAtMs: Date.now() + 15_000 } }))
		);
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(10_001);
		expect(await collecting).toContainEqual(
			expect.objectContaining({
				type: 'error',
				error: 'Agentic Chat provider request timed out after 6000ms'
			})
		);
		expect(test.requests).toHaveLength(2);
	});

	it.each([V4, `${V4}-20260910`, `${V41}-unrelated`])(
		'does not apply the V4.1 progress policy to %s',
		async (model) => {
			vi.useFakeTimers();
			const response = controllableResponse('Wafer', model);
			const test = harness([response.response]);
			const collecting = collect(test.stream());
			await vi.advanceTimersByTimeAsync(0);
			response.text('x');
			await vi.advanceTimersByTimeAsync(4_001);
			expect(test.requests).toHaveLength(1);
			expect(test.requests[0]!.signal.aborted).toBe(false);
			response.finish();
			await collecting;
		}
	);

	it.each(['header', 'body'] as const)(
		'applies the same progress policy to a dated V4.1 model reported in the %s',
		async (reportedAt) => {
			vi.useFakeTimers();
			const slow = controllableResponse('Venice', `${V41}-20260910`);
			if (reportedAt === 'body') slow.response.headers.delete('x-openrouter-model');
			const fast = controllableResponse('Wafer', V4);
			fast.text('Recovered.');
			fast.finish();
			const test = harness([slow.response, fast.response]);
			const collecting = collect(test.stream());
			await vi.advanceTimersByTimeAsync(0);
			slow.text('x');
			await vi.advanceTimersByTimeAsync(4_001);
			const attempts = test.requests.length;
			if (attempts === 1) slow.finish();
			await collecting;
			expect(attempts).toBe(2);
			expect(test.requests[0]!.signal.aborted).toBe(true);
		}
	);

	it('discards a slow partial tool call, aborts transport, changes route, and accounts both attempts before drain', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const fast = controllableResponse('Venice', V4);
		fast.frame({
			model: V4,
			provider: 'Venice',
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id: 'good-call',
								type: 'function',
								function: {
									name: 'list_onto_tasks',
									arguments: '{"project_id":"qa"}'
								}
							}
						]
					},
					finish_reason: null
				}
			]
		});
		fast.finish('tool_calls');
		const test = harness([slow.response, fast.response], { holdUsage: true });
		const input = request({
			tools: [
				{
					type: 'function',
					function: {
						name: 'list_onto_tasks',
						description: 'List',
						parameters: {
							type: 'object',
							properties: { project_id: { type: 'string' } }
						}
					}
				}
			],
			toolChoice: 'auto'
		});
		const collecting = collect(test.stream(input));
		await vi.advanceTimersByTimeAsync(0);
		slow.frame({
			choices: [
				{
					delta: {
						tool_calls: [
							{
								index: 0,
								id: 'discarded-call',
								type: 'function',
								function: { name: 'list_onto_tasks', arguments: '{' }
							}
						]
					}
				}
			]
		});
		// Tiny argument deltas have large SSE envelopes; envelopes must not count as progress.
		for (let index = 0; index < 39; index++) {
			await vi.advanceTimersByTimeAsync(100);
			slow.frame({
				choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ' ' } }] } }]
			});
		}
		expect(test.fetchImpl).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(100);
		const events = await collecting;
		expect(JSON.stringify(events)).not.toContain('discarded-call');
		expect(JSON.stringify(events)).toContain('good-call');
		expect(events.filter((event) => event.type === 'done')).toHaveLength(1);
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(slow.cancel).toHaveBeenCalledOnce();
		expect(test.requests[1]!.body.model).toBe(V4);
		expect(test.requests[1]!.body.provider.ignore).toEqual(['modal', 'novita']);
		expect(test.capacity.markTemporarilyUnavailable).not.toHaveBeenCalled();
		expect(test.usage.map((row) => [row.providerAttempt, row.status])).toEqual([
			[1, 'failure'],
			[2, 'success']
		]);
		expect(new Set(test.usage.map((row) => row.usageLogId)).size).toBe(2);
		expect(
			test.observations.some(
				(row) =>
					row.payload.error_class === 'provider_slow_stream' &&
					row.payload.progress_output_bytes === 40
			)
		).toBe(true);
		let drained = false;
		const drain = test.pendingEffects.drain(input.turnRunId, 1_000).then((result) => {
			drained = result;
		});
		await vi.advanceTimersByTimeAsync(0);
		expect(drained).toBe(false);
		test.settleUsage.forEach((resolve) => resolve());
		await drain;
		expect(drained).toBe(true);
	});

	it('allows a long healthy stream and stops its watcher after completion', async () => {
		vi.useFakeTimers();
		const response = controllableResponse();
		const test = harness([response.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		for (let second = 0; second < 9; second++) {
			response.text('x'.repeat(500));
			await vi.advanceTimersByTimeAsync(1_000);
		}
		response.finish();
		const events = await collecting;
		expect(events.at(-1)?.type).toBe('done');
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(test.requests[0]!.signal.aborted).toBe(false);
	});

	it.each([86, 155, 95])(
		'recovers a sustained slow stream at %s output bytes/s',
		async (bytesPerSecond) => {
			// Approximate output rates from the retained 21.6/38.8/23.8 tok/s misses.
			// This checks the local byte heuristic, not a tokenizer or live latency claim.
			vi.useFakeTimers();
			const slow = controllableResponse();
			const fast = controllableResponse('Venice', V4);
			fast.text('Completed');
			fast.finish();
			const test = harness([slow.response, fast.response]);
			const collecting = collect(test.stream());
			await vi.advanceTimersByTimeAsync(0);
			for (let second = 0; second < 4; second++) {
				slow.text('x'.repeat(bytesPerSecond));
				await vi.advanceTimersByTimeAsync(1_000);
			}
			expect(await collecting).toContainEqual({ type: 'text', content: 'Completed' });
			expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		}
	);

	it('recovers a mid-stream slowdown after an initially fast window', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const fast = controllableResponse('Venice', V4);
		fast.text('Complete');
		fast.finish();
		const test = harness([slow.response, fast.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x'.repeat(3_000));
		await vi.advanceTimersByTimeAsync(4_000);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(4_000);
		expect(await collecting).toContainEqual({ type: 'text', content: 'Complete' });
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('keeps cancellation terminal and never dispatches a recovery after user stop', async () => {
		vi.useFakeTimers();
		const response = controllableResponse();
		const test = harness([response.response]);
		const abort = new AbortController();
		const collecting = collect(test.stream(request({ signal: abort.signal })));
		const rejected = expect(collecting).rejects.toThrow('User stopped');
		await vi.advanceTimersByTimeAsync(1_000);
		abort.abort(new Error('User stopped'));
		await rejected;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(test.usage[0]?.status).toBe('aborted');
		expect(response.cancel).toHaveBeenCalledOnce();
	});

	it.each(['review', 'other-model', 'direct', 'low-budget', 'completed-frame'] as const)(
		'does not apply speculative recovery to %s',
		async (kind) => {
			vi.useFakeTimers();
			const model = kind === 'other-model' ? V4 : V41;
			const response = controllableResponse('Novita', model);
			const test = harness([response.response], { model });
			const input = request({
				...(kind === 'review' ? { passRole: 'mutation_review' } : {}),
				...(kind === 'low-budget' ? { budget: { deadlineAtMs: Date.now() + 12_000 } } : {})
			});
			const collecting = collect(
				kind === 'direct' ? test.client.stream(input) : test.stream(input)
			);
			await vi.advanceTimersByTimeAsync(0);
			if (kind === 'completed-frame')
				response.frame({
					choices: [{ delta: { content: 'Done' }, finish_reason: 'stop' }]
				});
			await vi.advanceTimersByTimeAsync(kind === 'low-budget' ? 6_000 : 7_000);
			response.finish();
			expect((await collecting).at(-1)?.type).toBe('done');
			expect(test.fetchImpl).toHaveBeenCalledOnce();
		}
	);

	it('spends only the existing retry and reports a failed final attempt without a third call', async () => {
		vi.useFakeTimers();
		const first = controllableResponse();
		const second = controllableResponse('Venice', V41);
		// Both attempts start output and then stall. Silence before the first
		// output byte is hidden reasoning, not slowness (see the test below).
		first.text('x');
		second.text('x');
		const test = harness([first.response, second.response], { timeoutMs: 10_000 });
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(14_001);
		const events = await collecting;
		expect(events.at(-1)).toMatchObject({ type: 'error', retryable: true });
		expect(events.some((event) => event.type === 'done')).toBe(false);
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.usage.map((row) => row.status)).toEqual(['failure', 'failure']);
	});

	it('does not judge a stream slow before its first output byte (hidden reasoning)', async () => {
		// 2026-09-22 book loop: reasoning is requested with `exclude: true`, so a
		// thinking model streams nothing until its first text or tool call. The
		// watchdog used to abort every such attempt as "slow".
		vi.useFakeTimers();
		const thinking = controllableResponse();
		const test = harness([thinking.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(8_000);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(thinking.cancel).not.toHaveBeenCalled();
		thinking.text('Done thinking.');
		thinking.finish();
		const events = await collecting;
		expect(events).toContainEqual({ type: 'text', content: 'Done thinking.' });
		expect(events.at(-1)?.type).toBe('done');
		expect(test.fetchImpl).toHaveBeenCalledOnce();
	});

	it('judges the first window from the first output byte, not from stream open', async () => {
		// Tasker 101: the first byte arrived late and the 4 s check counted the
		// silent prompt-processing time as a slow stream.
		vi.useFakeTimers();
		const late = controllableResponse();
		const test = harness([late.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(3_500);
		late.text('x'.repeat(300));
		for (let second = 0; second < 4; second++) {
			await vi.advanceTimersByTimeAsync(1_000);
			late.text('x'.repeat(400));
		}
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(late.cancel).not.toHaveBeenCalled();
		late.finish();
		expect((await collecting).at(-1)?.type).toBe('done');
	});

	it('counts streamed reasoning as progress after a line of narration', async () => {
		// Gate 2026-09-24 case 2 rep 1: 139 bytes of narration, then 487 hidden
		// reasoning tokens, aborted at 4.3 s as "insufficient progress".
		vi.useFakeTimers();
		const thinking = controllableResponse();
		const test = harness([thinking.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		thinking.text("I'll create the five tasks exactly as specified.");
		for (let second = 0; second < 9; second++) {
			await vi.advanceTimersByTimeAsync(1_000);
			thinking.frame({
				choices: [{ delta: { reasoning: 'r'.repeat(600) }, finish_reason: null }]
			});
		}
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(thinking.cancel).not.toHaveBeenCalled();
		thinking.text('Created.');
		thinking.finish();
		const events = await collecting;
		expect(JSON.stringify(events)).not.toContain('rrrr');
		expect(events.at(-1)?.type).toBe('done');
	});

	it('asks only a watched attempt to stream its reasoning', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse();
		const fast = controllableResponse('Wafer', V4);
		fast.text('Recovered.');
		fast.finish();
		const test = harness([slow.response, fast.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(4_001);
		await collecting;
		// The final retry has no slow-stream recovery left, so nothing reads it.
		expect(test.requests.map((r) => r.body.reasoning)).toEqual([
			{ exclude: false },
			{ exclude: true }
		]);
	});
});
