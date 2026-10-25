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
import {
	REVIEWER_FIRST_PROGRESS_TIMEOUT_MS,
	RUNAWAY_REASONING_TOKEN_LIMIT,
	WATCHED_FIRST_PROGRESS_TIMEOUT_MS
} from '../src/workers/agentic-chat/provider/openrouter/watchdog';

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
	/**
	 * These cases pin the 4 s slow-stream abort and the 15 s first-progress abort,
	 * which stay as the backstop under hedging; the hedge itself (a backup request
	 * 2 s into a stall) is covered in agenticChatProviderHedge.test.ts.
	 */
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
			// The pass offers a hedge; declining it isolates the backstop these cases pin.
			const backstopOnly = {
				stream: (clientInput: Parameters<typeof client.stream>[0]) =>
					client.stream({ ...clientInput, slowStreamHedge: undefined }),
				rejectRepeatedInvalidToolResponse: (
					clientInput: Parameters<typeof client.stream>[0]
				) => client.rejectRepeatedInvalidToolResponse(clientInput)
			};
			return streamBufferedProviderPass(input, backstopOnly, capacity, 2_000);
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

// Keys the production observation RPC accepts on a provider attempt receipt
// (persist_agentic_chat_execution_observation allowlist). Any other key makes
// the database reject the whole receipt.
const PROVIDER_RECEIPT_KEYS = new Set([
	'round',
	'logical_provider_round',
	'pass_role',
	'provider_attempt',
	'attempt_kind',
	'route_id',
	'model_requested',
	'model_used',
	'provider',
	'status',
	'duration_ms',
	'provider_timing',
	'finish_reason',
	'error_class',
	'usage',
	'rejected_tool_name',
	'advertised_tool_count',
	'max_output_tokens',
	'reasoning_effort',
	'output_budget_recovery',
	'output_budget'
]);
const LIMIT_CHARS = RUNAWAY_REASONING_TOKEN_LIMIT * 4;
function reasoningFrame(response: ReturnType<typeof controllableResponse>, chars: number) {
	response.frame({ choices: [{ delta: { reasoning: 'r'.repeat(chars) }, finish_reason: null }] });
}
function outputPolicy(canClaim = true) {
	return {
		pressure: vi.fn(),
		claimRecovery: vi.fn(() => canClaim),
		canClaimRecovery: vi.fn(() => canClaim)
	};
}
const listTool = {
	type: 'function' as const,
	function: {
		name: 'list_onto_tasks',
		description: 'List',
		parameters: { type: 'object', properties: { project_id: { type: 'string' } } }
	}
};

describe('runaway reasoning cutoff (audit 2026-10-17 S2)', () => {
	it('cuts a watched pass off past the limit with no output and runs the reasoning-off recovery', async () => {
		vi.useFakeTimers();
		const runaway = controllableResponse();
		const recovery = controllableResponse();
		recovery.text('Recovered answer.');
		recovery.finish();
		const test = harness([runaway.response, recovery.response]);
		const policy = outputPolicy();
		const collecting = collect(
			streamBufferedProviderPass(request(), test.client, test.capacity, 2_000, policy)
		);
		await vi.advanceTimersByTimeAsync(0);
		// Exactly at the limit is not past it.
		for (let index = 0; index < 4; index++) reasoningFrame(runaway, LIMIT_CHARS / 4);
		await vi.advanceTimersByTimeAsync(0);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(test.requests[0]!.signal.aborted).toBe(false);
		reasoningFrame(runaway, 4);
		await vi.advanceTimersByTimeAsync(0);
		const events = await collecting;

		expect(test.requests[0]!.body.reasoning).toEqual({ exclude: false });
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(runaway.cancel).toHaveBeenCalledOnce();
		expect(events).toContainEqual({ type: 'output_budget_recovery', providerAttempt: 2 });
		expect(events.filter((event) => event.type === 'text')).toEqual([
			{ type: 'text', content: 'Recovered answer.' }
		]);
		expect(events.at(-1)?.type).toBe('done');
		expect(test.requests).toHaveLength(2);
		expect(test.requests[1]!.body).toMatchObject({
			reasoning: { enabled: false },
			max_tokens: 12_000
		});
		// The endpoint was healthy: the recovery is not routed away from it.
		expect(test.requests[1]!.body.provider.ignore ?? []).not.toContain('novita');
		expect(policy.claimRecovery).toHaveBeenCalledOnce();
		expect(policy.pressure).toHaveBeenCalled();
		expect(test.capacity.markTemporarilyUnavailable).not.toHaveBeenCalled();

		const ended = test.observations.filter((row) => row.eventType === 'provider_attempt_ended');
		expect(ended[0]!.payload).toMatchObject({
			status: 'failure',
			error_class: 'runaway_reasoning_cutoff',
			finish_reason: null,
			output_budget: {
				kind: 'exhausted',
				limit: 12_000,
				completionTokens: null,
				reasoningTokens: RUNAWAY_REASONING_TOKEN_LIMIT + 1
			}
		});
		for (const key of Object.keys(ended[0]!.payload)) {
			expect(PROVIDER_RECEIPT_KEYS.has(key), key).toBe(true);
		}
		expect(ended[1]!.payload).toMatchObject({
			status: 'success',
			reasoning_effort: 'none',
			output_budget_recovery: true
		});
		expect(test.usage.map((row) => row.status)).toEqual(['failure', 'success']);
		expect(test.usage[0]!.error).toContain('runaway_reasoning_cutoff');
	});

	it('uses a reasoning count the provider reports mid-stream', async () => {
		vi.useFakeTimers();
		const runaway = controllableResponse();
		const recovery = controllableResponse();
		recovery.text('Recovered.');
		recovery.finish();
		const test = harness([runaway.response, recovery.response]);
		const collecting = collect(
			streamBufferedProviderPass(request(), test.client, test.capacity, 2_000, outputPolicy())
		);
		await vi.advanceTimersByTimeAsync(0);
		runaway.frame({
			choices: [{ delta: { reasoning: 'short' }, finish_reason: null }],
			usage: {
				prompt_tokens: 100,
				completion_tokens: RUNAWAY_REASONING_TOKEN_LIMIT + 500,
				total_tokens: RUNAWAY_REASONING_TOKEN_LIMIT + 600,
				completion_tokens_details: { reasoning_tokens: RUNAWAY_REASONING_TOKEN_LIMIT + 500 }
			}
		});
		await vi.advanceTimersByTimeAsync(0);
		expect((await collecting).at(-1)?.type).toBe('done');
		expect(test.requests).toHaveLength(2);
		expect(
			test.observations.find((row) => row.payload.error_class === 'runaway_reasoning_cutoff')
				?.payload.output_budget
		).toMatchObject({ reasoningTokens: RUNAWAY_REASONING_TOKEN_LIMIT + 500 });
	});

	it.each(['text', 'tool call'] as const)(
		'never cuts a pass off once a %s delta has appeared',
		async (first) => {
			vi.useFakeTimers();
			const response = controllableResponse();
			const test = harness([response.response]);
			const input =
				first === 'tool call'
					? request({ tools: [listTool], toolChoice: 'auto' })
					: request();
			const collecting = collect(
				streamBufferedProviderPass(input, test.client, test.capacity, 2_000, outputPolicy())
			);
			await vi.advanceTimersByTimeAsync(0);
			if (first === 'text') response.text('Let me check the project first.');
			else
				response.frame({
					choices: [
						{
							delta: {
								tool_calls: [
									{
										index: 0,
										id: 'kept-call',
										type: 'function',
										function: { name: 'list_onto_tasks', arguments: '' }
									}
								]
							},
							finish_reason: null
						}
					]
				});
			for (let index = 0; index < 8; index++) reasoningFrame(response, LIMIT_CHARS / 4);
			await vi.advanceTimersByTimeAsync(0);
			expect(test.requests[0]!.signal.aborted).toBe(false);
			if (first === 'text') {
				response.text(' Done.');
				response.finish();
			} else {
				response.frame({
					choices: [
						{
							delta: {
								tool_calls: [
									{ index: 0, function: { arguments: '{"project_id":"qa"}' } }
								]
							},
							finish_reason: null
						}
					]
				});
				response.finish('tool_calls');
			}
			const events = await collecting;
			expect(events.at(-1)?.type).toBe('done');
			expect(test.fetchImpl).toHaveBeenCalledOnce();
			expect(
				test.observations.some(
					(row) => row.payload.error_class === 'runaway_reasoning_cutoff'
				)
			).toBe(false);
		}
	);

	it.each(['review', 'other-model', 'direct', 'recovery-already-claimed', 'low-budget'] as const)(
		'does not cut off a %s pass',
		async (kind) => {
			vi.useFakeTimers();
			const model = kind === 'other-model' ? V4 : V41;
			const response = controllableResponse('Novita', model);
			const test = harness([response.response], { model });
			const input = request({
				...(kind === 'review' ? { passRole: 'mutation_review' } : {}),
				...(kind === 'low-budget' ? { budget: { deadlineAtMs: Date.now() + 9_000 } } : {})
			});
			const collecting = collect(
				kind === 'direct'
					? test.client.stream(input)
					: streamBufferedProviderPass(
							input,
							test.client,
							test.capacity,
							2_000,
							outputPolicy(kind !== 'recovery-already-claimed')
						)
			);
			await vi.advanceTimersByTimeAsync(0);
			for (let index = 0; index < 8; index++) reasoningFrame(response, LIMIT_CHARS / 4);
			await vi.advanceTimersByTimeAsync(0);
			expect(test.requests[0]!.signal.aborted).toBe(false);
			response.text('Answer after long thinking.');
			response.finish();
			const events = await collecting;
			expect(events.at(-1)?.type).toBe('done');
			expect(test.fetchImpl).toHaveBeenCalledOnce();
		}
	);

	it('offers the cutoff only while the turn can still claim its recovery', async () => {
		const seen: Array<boolean | undefined> = [];
		const client = {
			async *stream(input: { allowRunawayReasoningCutoff?: boolean }) {
				seen.push(input.allowRunawayReasoningCutoff);
				if (seen.length === 1) {
					yield {
						type: 'error' as const,
						error: 'cut off',
						retryable: true,
						cause: 'output_budget_exhausted' as const
					};
					return;
				}
				yield { type: 'text' as const, content: 'ok' };
				yield { type: 'done' as const, finishedReason: 'stop' };
			}
		};
		const capacity = { markTemporarilyUnavailable: vi.fn() };
		await collect(
			streamBufferedProviderPass(request(), client, capacity, 2_000, outputPolicy())
		);
		// Recovery attempts are never cut off themselves.
		expect(seen).toEqual([true, false]);
		seen.length = 0;
		await collect(
			streamBufferedProviderPass(request(), client, capacity, 2_000, outputPolicy(false))
		);
		expect(seen[0]).toBe(false);
	});
});

describe('watched first-progress deadline (audit 2026-10-17 S9)', () => {
	it('abandons a watched attempt with no delta 15 s after headers and retries once', async () => {
		vi.useFakeTimers();
		const silent = controllableResponse();
		const fast = controllableResponse('Wafer', V4);
		fast.text('Recovered.');
		fast.finish();
		const test = harness([silent.response, fast.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(WATCHED_FIRST_PROGRESS_TIMEOUT_MS - 1);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(test.requests[0]!.signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(2);
		const events = await collecting;
		expect(events).toContainEqual({ type: 'text', content: 'Recovered.' });
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(silent.cancel).toHaveBeenCalledOnce();
		// Same retry path as a slow stream: no capacity cooldown.
		expect(test.capacity.markTemporarilyUnavailable).not.toHaveBeenCalled();
		expect(test.usage[0]).toMatchObject({ status: 'failure', retryable: true });
		expect(test.usage[0]!.error).toContain('no progress within 15000ms');
	});

	it('counts a reasoning delta as first progress', async () => {
		vi.useFakeTimers();
		const thinking = controllableResponse();
		const test = harness([thinking.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(WATCHED_FIRST_PROGRESS_TIMEOUT_MS - 1_000);
		reasoningFrame(thinking, 2_000);
		for (let second = 0; second < 4; second++) {
			await vi.advanceTimersByTimeAsync(1_000);
			reasoningFrame(thinking, 600);
		}
		thinking.text('Thought it through.');
		thinking.finish();
		expect((await collecting).at(-1)?.type).toBe('done');
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(thinking.cancel).not.toHaveBeenCalled();
	});

	it.each(['no retry left', 'other-model'] as const)(
		'keeps waiting on the attempt deadline for a %s pass',
		async (kind) => {
			vi.useFakeTimers();
			const model = kind === 'other-model' ? V4 : V41;
			const silent = controllableResponse('Novita', model);
			const test = harness([silent.response], { model });
			const input = request();
			const collecting = collect(
				kind === 'no retry left' ? test.client.stream(input) : test.stream(input)
			);
			await vi.advanceTimersByTimeAsync(20_000);
			expect(test.fetchImpl).toHaveBeenCalledOnce();
			expect(test.requests[0]!.signal.aborted).toBe(false);
			silent.text('Late but fine.');
			silent.finish();
			expect((await collecting).at(-1)?.type).toBe('done');
		}
	);
});

// Battery 2026-10-17 cedar-02: a gpt-6-luna review on Azure held its attempt for
// the full 45 s reviewer timeout. OpenRouter generation stats for the degraded
// Azure attempts: first token at 5–7.6 s, then 2.8–22.8 tok/s.
describe('reviewer stream watch', () => {
	const LUNA = 'openai/gpt-6-luna';
	const review = (overrides: Partial<AgenticChatTurnProviderRequestV1> = {}) =>
		request({ passRole: 'mutation_review', ...overrides });
	const receiptKeys = new Set([
		...PROVIDER_RECEIPT_KEYS,
		'progress_window_ms',
		'progress_output_bytes',
		'tool_call_truncation'
	]);

	it('abandons a review with no output 15 s after headers and retries the review once', async () => {
		vi.useFakeTimers();
		const silent = controllableResponse('Azure', LUNA);
		const fallback = controllableResponse('InferenceNet', 'z-ai/glm-5.3');
		fallback.text('Approved.');
		fallback.finish();
		const test = harness([silent.response, fallback.response], { model: LUNA });
		const collecting = collect(test.stream(review()));
		await vi.advanceTimersByTimeAsync(REVIEWER_FIRST_PROGRESS_TIMEOUT_MS - 1);
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(test.requests[0]!.signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(2);
		const events = await collecting;

		expect(events).toContainEqual({ type: 'text', content: 'Approved.' });
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(silent.cancel).toHaveBeenCalledOnce();
		// The review request itself is unchanged: reasoning stays excluded.
		expect(test.requests[0]!.body.reasoning).toEqual({ effort: 'low', exclude: true });
		// Same retry path as a slow stream: routed around the endpoint, no cooldown.
		expect(test.requests[1]!.body.provider.ignore).toContain('azure');
		expect(test.capacity.markTemporarilyUnavailable).not.toHaveBeenCalled();
		const ended = test.observations.filter((row) => row.eventType === 'provider_attempt_ended');
		expect(ended[0]!.payload).toMatchObject({
			pass_role: 'mutation_review',
			status: 'failure',
			error_class: 'reviewer_first_progress_stall',
			progress_window_ms: REVIEWER_FIRST_PROGRESS_TIMEOUT_MS,
			progress_output_bytes: 0
		});
		for (const key of Object.keys(ended[0]!.payload)) {
			expect(receiptKeys.has(key), key).toBe(true);
		}
		expect(ended[1]!.payload).toMatchObject({ status: 'success', provider_attempt: 2 });
		expect(test.usage[0]!.error).toContain('reviewer sent no output within 15000ms');
	});

	it('abandons a review that trickles output after its first token and retries once', async () => {
		vi.useFakeTimers();
		const trickle = controllableResponse('Azure', LUNA);
		const fallback = controllableResponse('InferenceNet', 'z-ai/glm-5.3');
		fallback.text('Approved.');
		fallback.finish();
		const test = harness([trickle.response, fallback.response], { model: LUNA });
		const collecting = collect(test.stream(review()));
		await vi.advanceTimersByTimeAsync(6_000);
		// ~3 tok/s: the 21:02 attempt streamed 108 tokens in 39 s.
		for (let second = 0; second < 6 && test.fetchImpl.mock.calls.length === 1; second++) {
			trickle.text('x'.repeat(12));
			await vi.advanceTimersByTimeAsync(1_000);
		}
		const events = await collecting;

		expect(events.filter((event) => event.type === 'text')).toEqual([
			{ type: 'text', content: 'Approved.' }
		]);
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		const stalled = test.observations.find(
			(row) => row.payload.error_class === 'reviewer_slow_stream'
		);
		expect(stalled?.payload).toMatchObject({
			pass_role: 'mutation_review',
			progress_window_ms: 4_000
		});
		expect(test.usage[0]!.error).toContain('Agentic Chat reviewer streamed');
	});

	it.each([
		['first token at the slowest prod first attempt, then 49 tok/s', 8_800, 150],
		['a buffered provider that sends everything at the end', 9_700, 0]
	] as const)('spares %s', async (_case, firstContentAtMs, bytesPerSecond) => {
		vi.useFakeTimers();
		const healthy = controllableResponse('Azure', LUNA);
		const test = harness([healthy.response], { model: LUNA });
		const collecting = collect(test.stream(review()));
		await vi.advanceTimersByTimeAsync(firstContentAtMs);
		healthy.text('{"approve":');
		for (let second = 0; bytesPerSecond > 0 && second < 5; second++) {
			await vi.advanceTimersByTimeAsync(1_000);
			healthy.text('x'.repeat(bytesPerSecond));
		}
		healthy.text(' true}');
		healthy.finish();
		expect((await collecting).at(-1)?.type).toBe('done');
		expect(test.fetchImpl).toHaveBeenCalledOnce();
		expect(healthy.cancel).not.toHaveBeenCalled();
	});

	it('never watches the final review attempt', async () => {
		vi.useFakeTimers();
		const unavailable = new Response('busy', { status: 503 });
		const silent = controllableResponse('Azure', LUNA);
		const test = harness([unavailable, silent.response], { model: LUNA });
		const collecting = collect(test.stream(review()));
		await vi.advanceTimersByTimeAsync(20_000);
		expect(test.fetchImpl).toHaveBeenCalledTimes(2);
		expect(test.requests[1]!.signal.aborted).toBe(false);
		silent.text('Late approval.');
		silent.finish();
		expect((await collecting).at(-1)?.type).toBe('done');
		expect(
			test.observations.some((row) =>
				String(row.payload.error_class ?? '').startsWith('reviewer_')
			)
		).toBe(false);
	});

	it('does not watch a review sent without a retry left', async () => {
		vi.useFakeTimers();
		const silent = controllableResponse('Azure', LUNA);
		const test = harness([silent.response], { model: LUNA });
		const collecting = collect(test.client.stream(review()));
		await vi.advanceTimersByTimeAsync(20_000);
		expect(test.requests[0]!.signal.aborted).toBe(false);
		silent.text('Late approval.');
		silent.finish();
		expect((await collecting).at(-1)?.type).toBe('done');
	});
});
