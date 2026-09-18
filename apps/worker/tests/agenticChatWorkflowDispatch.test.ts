// apps/worker/tests/agenticChatWorkflowDispatch.test.ts
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
	AgenticChatOpenRouterClient,
	type AgenticChatOpenAiCompatibleRouteV1
} from '../src/workers/agentic-chat/provider/openrouter-client';
import {
	AgenticChatProviderDispatchDeniedError,
	type AgenticChatProviderDispatchGateV1,
	type AgenticChatProviderDispatchReceiptV1,
	type AgenticChatTurnProviderClientEventV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/pendingEffects';
import {
	AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS,
	AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION
} from '@buildos/shared-types';
import { DEEPSEEK_V4_FLASH_MODEL, MODEL_CATALOG } from '@buildos/smart-llm';
import {
	AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1,
	AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1,
	AGENTIC_CHAT_WORKFLOW_PRIMARY_MODEL_V1,
	AgenticChatWorkflowDispatchMeter,
	buildAgenticChatWorkflowRoutesV1,
	computeAgenticChatWorkflowActualMicroUsdV1
} from '../src/workers/agentic-chat/workflow/workflow-dispatch';
import { WorkflowStoreFake } from './helpers/workflowStoreFake';

/**
 * Tasker 87 slice B, provider boundary: the dispatch hook in the real OpenRouter
 * client, the cost adapter behind it, and the per-request `length` relabel.
 */

const PRICED = 'deepseek/deepseek-v4.1-flash';
const PRICING = AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[PRICED]!;

function route(
	overrides: Partial<AgenticChatOpenAiCompatibleRouteV1> = {}
): AgenticChatOpenAiCompatibleRouteV1 {
	return {
		id: 'openrouter',
		kind: 'openrouter',
		baseUrl: 'https://openrouter.example/api/v1',
		apiKey: 'provider-secret',
		model: PRICED,
		fallbackModels: [],
		...overrides
	};
}

function input(overrides: Record<string, unknown> = {}) {
	return {
		messages: [
			{ role: 'system', content: 'System prompt' },
			{ role: 'user', content: 'Current request' }
		] as const,
		tools: [],
		toolChoice: 'none' as const,
		userId: '10000000-0000-4000-8000-000000000001',
		sessionId: '20000000-0000-4000-8000-000000000002',
		turnRunId: '30000000-0000-4000-8000-000000000003',
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		contextType: 'project',
		entityId: 'project-1',
		projectId: 'project-1',
		queueJobId: '40000000-0000-4000-8000-000000000004',
		processingToken: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		providerRound: 'initial' as const,
		logicalProviderRound: 1,
		passRole: 'acting' as const,
		signal: new AbortController().signal,
		...overrides
	};
}

function sse(
	completionTokens: number,
	options: { finishReason?: string; cost?: number | null; status?: number; text?: string } = {}
): Response {
	const frames = [
		JSON.stringify({
			id: 'gen-1',
			model: PRICED,
			choices: [{ delta: { content: options.text ?? 'ok' } }]
		}),
		JSON.stringify({
			id: 'gen-1',
			model: PRICED,
			choices: [{ delta: {}, finish_reason: options.finishReason ?? 'stop' }],
			usage: {
				prompt_tokens: 1_000,
				completion_tokens: completionTokens,
				total_tokens: 1_000 + completionTokens,
				...(options.cost === null ? {} : { cost: options.cost ?? 0.0011 })
			}
		}),
		'[DONE]'
	];
	return new Response(frames.map((frame) => `data: ${frame}\n\n`).join(''), {
		status: 200,
		headers: { 'content-type': 'text/event-stream', 'x-request-id': 'req-1' }
	});
}

function client(fetchImpl: typeof fetch, routes = [route()], maxTokens?: number) {
	return new AgenticChatOpenRouterClient(
		{
			usage: { observe: vi.fn(async () => undefined) },
			pendingEffects: new AgenticChatPendingEffectsRegistry()
		},
		{
			routes,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Agentic Chat Worker',
			fetchImpl,
			requestTimeoutMs: 10_000,
			responseHeadersTimeoutMs: 1_000,
			...(maxTokens === undefined ? {} : { maxTokens })
		}
	);
}

async function collect(stream: AsyncIterable<AgenticChatTurnProviderClientEventV1>) {
	const events: AgenticChatTurnProviderClientEventV1[] = [];
	for await (const event of stream) events.push(event);
	return events;
}

function recordingGate(): AgenticChatProviderDispatchGateV1 & {
	requests: unknown[];
	receipts: AgenticChatProviderDispatchReceiptV1[];
} {
	const requests: unknown[] = [];
	const receipts: AgenticChatProviderDispatchReceiptV1[] = [];
	return {
		providerMaxPrice: { prompt: 0.3, completion: 1.2, request: 0 },
		requests,
		receipts,
		async admit(request) {
			requests.push(request);
			return { settle: (receipt) => void receipts.push(receipt) };
		}
	};
}

function bodyOf(fetchImpl: ReturnType<typeof vi.fn>, call = 0) {
	return JSON.parse(
		(fetchImpl.mock.calls[call] as unknown as [string, RequestInit])[1].body as string
	);
}

/** A meter over a store fake whose planner step is claimed by the current generation. */
async function claimedMeter(configure?: (store: WorkflowStoreFake) => void) {
	const store = new WorkflowStoreFake({ nowMs: Date.now() });
	store.seedAcceptedContext();
	configure?.(store);
	const stepAttemptId = randomUUID();
	await store.claimStep(store.fence, { stepKey: 'planner', stepAttemptId, planHash: null });
	const meter = new AgenticChatWorkflowDispatchMeter(store, store.fence, {
		settleRetryDelayMs: 1
	});
	const gate = meter.forStepAttempt({
		stepKey: 'planner',
		stepAttemptId,
		firstKind: 'planner',
		boundaryAtMs: () => Date.now() + 120_000
	});
	return { store, meter, gate, stepAttemptId };
}

describe('per-request length relabel', () => {
	it('labels a response that reached a smaller per-request ceiling as truncated', async () => {
		const fetchImpl = vi.fn(async () => sse(800));
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch).stream(input({ maxOutputTokens: 800 }))
		);
		expect(bodyOf(fetchImpl).max_tokens).toBe(800);
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'length'
		});
	});

	it('leaves a response under the per-request ceiling untouched', async () => {
		const fetchImpl = vi.fn(async () => sse(799));
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch).stream(input({ maxOutputTokens: 800 }))
		);
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'stop'
		});
	});

	it('keeps the ordinary cap at the client maximum when no per-request ceiling is sent', async () => {
		const under = vi.fn(async () => sse(800));
		const ordinary = await collect(
			client(under as unknown as typeof fetch, [route()], 1_200).stream(input())
		);
		expect(bodyOf(under).max_tokens).toBe(1_200);
		expect(ordinary.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'stop'
		});

		const capped = vi.fn(async () => sse(1_200));
		const atCap = await collect(
			client(capped as unknown as typeof fetch, [route()], 1_200).stream(input())
		);
		expect(atCap.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'length'
		});
	});

	it('uses the client maximum when a per-request ceiling is larger', async () => {
		const fetchImpl = vi.fn(async () => sse(1_200));
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch, [route()], 1_200).stream(
				input({ maxOutputTokens: 4_000 })
			)
		);
		expect(bodyOf(fetchImpl).max_tokens).toBe(1_200);
		expect(events.find((event) => event.type === 'done')).toMatchObject({
			finishedReason: 'length'
		});
	});
});

describe('physical dispatch hook in the provider client', () => {
	it('sends no max_price and calls no gate on the ordinary path', async () => {
		const fetchImpl = vi.fn(async () => sse(10));
		await collect(client(fetchImpl as unknown as typeof fetch).stream(input()));
		expect(bodyOf(fetchImpl).provider?.max_price).toBeUndefined();
	});

	it('admits the exact serialized request and sends the admitted max_price', async () => {
		const fetchImpl = vi.fn(async () => sse(10));
		const gate = recordingGate();
		await collect(
			client(fetchImpl as unknown as typeof fetch).stream(
				input({ dispatchGate: gate, maxOutputTokens: 900 })
			)
		);
		const sent = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
			.body as string;
		expect(gate.requests).toEqual([
			{
				routeId: 'openrouter',
				routeKind: 'openrouter',
				model: PRICED,
				fallbackModels: [],
				serializedRequestBytes: Buffer.byteLength(sent, 'utf8'),
				maxOutputTokens: 900
			}
		]);
		expect(JSON.parse(sent).provider.max_price).toEqual({
			prompt: 0.3,
			completion: 1.2,
			request: 0
		});
		expect(gate.receipts).toEqual([
			{
				kind: 'stream_ended',
				httpStatus: 200,
				// The provider generation id, which OpenRouter reconciliation keys on.
				requestId: 'gen-1',
				usage: expect.objectContaining({
					promptTokens: 1_000,
					completionTokens: 10,
					costUsd: 0.0011
				})
			}
		]);
	});

	it('stops at a denial: nothing is sent, no route fallback, cause dispatch_denied', async () => {
		const fetchImpl = vi.fn(async () => sse(10));
		const gate: AgenticChatProviderDispatchGateV1 = {
			providerMaxPrice: { prompt: 0.3, completion: 1.2, request: 0 },
			admit: vi.fn(async () => {
				throw new AgenticChatProviderDispatchDeniedError(
					'budget_exhausted',
					'over the cap'
				);
			})
		};
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch, [
				route(),
				route({ id: 'secondary', baseUrl: 'https://secondary.example/api/v1' })
			]).stream(input({ dispatchGate: gate }))
		);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(gate.admit).toHaveBeenCalledTimes(1);
		expect(events.at(-1)).toMatchObject({ type: 'error', cause: 'dispatch_denied' });
	});

	it('admits a route fallback as a second physical request and settles each once', async () => {
		let calls = 0;
		const fetchImpl = vi.fn(async () => {
			calls += 1;
			return calls === 1
				? new Response(JSON.stringify({ error: { message: 'unavailable' } }), {
						status: 503,
						headers: { 'content-type': 'application/json', 'x-request-id': 'req-503' }
					})
				: sse(10);
		});
		const gate = recordingGate();
		await collect(
			client(fetchImpl as unknown as typeof fetch, [
				route(),
				route({ id: 'secondary', baseUrl: 'https://secondary.example/api/v1' })
			]).stream(input({ dispatchGate: gate }))
		);
		expect(gate.requests.map((request: any) => request.routeId)).toEqual([
			'openrouter',
			'secondary'
		]);
		expect(gate.receipts.map((receipt) => [receipt.kind, receipt.httpStatus])).toEqual([
			['provider_error_response', 503],
			['stream_ended', 200]
		]);
	});

	it('reports no provider receipt when the response never arrives', async () => {
		const fetchImpl = vi.fn(
			(_url: string, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) =>
					init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), {
						once: true
					})
				)
		);
		const gate = recordingGate();
		await collect(
			client(fetchImpl as unknown as typeof fetch).stream(input({ dispatchGate: gate }))
		);
		expect(gate.receipts).toEqual([
			{ kind: 'no_provider_receipt', httpStatus: null, requestId: null, usage: null }
		]);
	});
});

describe('AgenticChatWorkflowDispatchMeter', () => {
	it('reserves, begins, and settles a successful request at the provider-reported cost', async () => {
		const { store, meter, gate } = await claimedMeter();
		const permit = await gate.admit(
			{
				routeId: 'openrouter',
				routeKind: 'openrouter',
				model: PRICED,
				fallbackModels: [],
				serializedRequestBytes: 4_000,
				maxOutputTokens: 900
			},
			new AbortController().signal
		);
		const [row] = [...store.dispatches.values()];
		expect(row).toMatchObject({
			state: 'dispatching',
			kind: 'planner',
			physicalAttempt: 1,
			reservedMicroUsd: 2_588
		});
		permit.settle({
			kind: 'stream_ended',
			httpStatus: 200,
			requestId: 'req-1',
			usage: {
				promptTokens: 1_000,
				completionTokens: 100,
				totalTokens: 1_100,
				reasoningTokens: null,
				cachedPromptTokens: null,
				costUsd: 0.00042,
				modelUsed: PRICED
			}
		});
		// A second settle from the same permit is a no-op.
		permit.settle({
			kind: 'no_provider_receipt',
			httpStatus: null,
			requestId: null,
			usage: null
		});
		expect(await meter.drain(1_000)).toBe(true);
		expect(row).toMatchObject({
			state: 'settled',
			actualMicroUsd: 420,
			providerRequestId: 'req-1'
		});
		expect(store.calls.filter((call) => call.op === 'settleDispatch')).toHaveLength(1);
		expect(meter.ledger.map((entry) => entry.event)).toEqual([
			'reserved',
			'dispatching',
			'settled'
		]);
	});

	it('fails closed without a pricing snapshot for every model, before any reservation', async () => {
		const { store, meter, gate } = await claimedMeter();
		const fetchImpl = vi.fn(async () => sse(10));
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch, [
				route({ fallbackModels: ['provider/unpriced'] })
			]).stream(input({ dispatchGate: gate, maxOutputTokens: 900 }))
		);
		expect(fetchImpl).not.toHaveBeenCalled();
		expect(store.dispatches.size).toBe(0);
		expect(gate.lastDenial?.code).toBe('pricing_unavailable');
		expect(meter.ledger).toEqual([
			expect.objectContaining({ event: 'denied', detail: 'pricing_unavailable' })
		]);
		expect(events.at(-1)).toMatchObject({ type: 'error', cause: 'dispatch_denied' });
	});

	it('refuses an oversized request or output ceiling before reserving', async () => {
		const { store, gate } = await claimedMeter();
		const signal = new AbortController().signal;
		const base = {
			routeId: 'openrouter',
			routeKind: 'openrouter' as const,
			model: PRICED,
			fallbackModels: []
		};
		await expect(
			gate.admit({ ...base, serializedRequestBytes: 131_073, maxOutputTokens: 900 }, signal)
		).rejects.toMatchObject({
			code: 'request_too_large'
		});
		expect(store.dispatches.size).toBe(0);
	});

	it('refuses when too little time remains to preserve finalization', async () => {
		const store = new WorkflowStoreFake({ nowMs: Date.now() });
		store.seedAcceptedContext();
		const stepAttemptId = randomUUID();
		await store.claimStep(store.fence, { stepKey: 'planner', stepAttemptId, planHash: null });
		const gate = new AgenticChatWorkflowDispatchMeter(store, store.fence).forStepAttempt({
			stepKey: 'planner',
			stepAttemptId,
			firstKind: 'planner',
			boundaryAtMs: () => Date.now() + 4_000
		});
		await expect(
			gate.admit(
				{
					routeId: 'openrouter',
					routeKind: 'openrouter',
					model: PRICED,
					fallbackModels: [],
					serializedRequestBytes: 4_000,
					maxOutputTokens: 900
				},
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'deadline_expired' });
		expect(store.dispatches.size).toBe(0);
	});

	it('caps one step attempt at two physical requests', async () => {
		const { store, gate } = await claimedMeter();
		const request = {
			routeId: 'openrouter',
			routeKind: 'openrouter' as const,
			model: PRICED,
			fallbackModels: [],
			serializedRequestBytes: 4_000,
			maxOutputTokens: 900
		};
		const signal = new AbortController().signal;
		(await gate.admit(request, signal)).settle({
			kind: 'provider_error_response',
			httpStatus: 503,
			requestId: null,
			usage: null
		});
		(await gate.admit(request, signal)).settle({
			kind: 'provider_error_response',
			httpStatus: 503,
			requestId: null,
			usage: null
		});
		await expect(gate.admit(request, signal)).rejects.toMatchObject({ code: 'dispatch_limit' });
		expect([...store.dispatches.values()].map((row) => row.kind)).toEqual([
			'planner',
			'provider_fallback'
		]);
	});

	it('replays a lost reservation response by dispatch id and creates one row', async () => {
		const { store, gate } = await claimedMeter((fake) =>
			fake.inject('reserveDispatch', 'lose_response')
		);
		await gate.admit(
			{
				routeId: 'openrouter',
				routeKind: 'openrouter',
				model: PRICED,
				fallbackModels: [],
				serializedRequestBytes: 4_000,
				maxOutputTokens: 900
			},
			new AbortController().signal
		);
		expect(store.dispatches.size).toBe(1);
		expect([...store.dispatches.values()][0]!.state).toBe('dispatching');
	});

	it('returns an unused reservation when the start is refused', async () => {
		const { store, gate, meter } = await claimedMeter();
		store.before = (op) => {
			if (op === 'beginDispatch') store.run.deadlineAtMs = store.nowMs - 1;
		};
		await expect(
			gate.admit(
				{
					routeId: 'openrouter',
					routeKind: 'openrouter',
					model: PRICED,
					fallbackModels: [],
					serializedRequestBytes: 4_000,
					maxOutputTokens: 900
				},
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'deadline_expired' });
		await meter.drain(1_000);
		expect([...store.dispatches.values()][0]).toMatchObject({
			state: 'released',
			actualMicroUsd: null
		});
		expect(store.exposureMicroUsd()).toBe(0);
	});

	it('leaves the row dispatching (held exposure) when every settlement attempt fails', async () => {
		const { store, gate, meter } = await claimedMeter((fake) =>
			fake.inject('settleDispatch', 'fail_before', undefined, 3)
		);
		const permit = await gate.admit(
			{
				routeId: 'openrouter',
				routeKind: 'openrouter',
				model: PRICED,
				fallbackModels: [],
				serializedRequestBytes: 4_000,
				maxOutputTokens: 900
			},
			new AbortController().signal
		);
		permit.settle({
			kind: 'provider_error_response',
			httpStatus: 500,
			requestId: null,
			usage: null
		});
		await meter.drain(1_000);
		const [row] = [...store.dispatches.values()];
		expect(row!.state).toBe('dispatching');
		expect(store.exposureMicroUsd()).toBe(row!.reservedMicroUsd);
		expect(meter.ledger.at(-1)).toMatchObject({ event: 'settlement_unavailable' });
		// Recovery then holds it as uncertain instead of releasing it.
		await store.recoverTurn(store.fence, {
			failureClass: 'timeout_post_start',
			errorMessage: null
		});
		expect(row!.state).toBe('uncertain');
	});
});

describe('computeAgenticChatWorkflowActualMicroUsdV1', () => {
	const usage = (costUsd: number | null) => ({
		promptTokens: 2_000,
		completionTokens: 400,
		totalTokens: 2_400,
		reasoningTokens: null,
		cachedPromptTokens: null,
		costUsd,
		modelUsed: PRICED
	});

	it.each([
		[0.0011, 1_100],
		[0.30000000000000004, 300_000],
		[0.0000001, 1],
		[0, 0]
	])('rounds provider cost %s up to %s micro-USD without binary noise', (cost, micro) => {
		expect(computeAgenticChatWorkflowActualMicroUsdV1(usage(cost), PRICING)).toBe(micro);
	});

	it('prices actual tokens at the admitted rates when the provider reports no cost', () => {
		// 2000 * 0.30 + 400 * 1.20 = 1080 micro-USD.
		expect(computeAgenticChatWorkflowActualMicroUsdV1(usage(null), PRICING)).toBe(1_080);
	});
});

describe('workflow provider fallback (DeepSeek V4 Flash)', () => {
	const FALLBACK = DEEPSEEK_V4_FLASH_MODEL;

	it('prices the fallback from the model catalog, within every frozen admitted maximum', () => {
		expect(AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1).toEqual([FALLBACK]);
		const snapshot = AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[FALLBACK]!;
		const catalog = MODEL_CATALOG[FALLBACK]!;
		expect(Number(snapshot.promptUsdPerMillion)).toBe(catalog.cost);
		expect(Number(snapshot.completionUsdPerMillion)).toBe(catalog.outputCost);
		for (const [model, priced] of Object.entries(AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1)) {
			expect(priced.model).toBe(model);
			expect(AGENTIC_CHAT_WORKFLOW_ADMITTED_MODELS).toContain(model);
			expect(Number(priced.promptUsdPerMillion)).toBeLessThanOrEqual(
				AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION.prompt
			);
			expect(Number(priced.completionUsdPerMillion)).toBeLessThanOrEqual(
				AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION.completion
			);
			expect(Number(priced.cacheReadUsdPerMillion)).toBeLessThanOrEqual(
				AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION.cacheRead
			);
			expect(priced).toMatchObject({ requestUsd: '0', source: 'openrouter_models_api' });
		}
	});

	it('sends the priced fallback inside one metered request under the admitted max_price', async () => {
		const { store, meter, gate } = await claimedMeter();
		const fetchImpl = vi.fn(async () => sse(10));
		// The configured route's own fallbacks are replaced by the priced workflow list.
		const routes = buildAgenticChatWorkflowRoutesV1([
			route({ model: 'provider/unpriced', fallbackModels: ['provider/also-unpriced'] })
		]);
		const events = await collect(
			client(fetchImpl as unknown as typeof fetch, routes).stream(
				input({ dispatchGate: gate, maxOutputTokens: 900 })
			)
		);
		expect(events.at(-1)).toMatchObject({ type: 'done' });
		const body = bodyOf(fetchImpl);
		expect(body.model).toBe(AGENTIC_CHAT_WORKFLOW_PRIMARY_MODEL_V1);
		expect(body.models).toEqual([FALLBACK]);
		expect(body.provider.max_price).toEqual({ prompt: 0.3, completion: 1.2, request: 0 });
		expect(await meter.drain(1_000)).toBe(true);
		// One HTTP request is one physical dispatch, priced by the model it leads with.
		expect([...store.dispatches.values()]).toEqual([
			expect.objectContaining({
				state: 'settled',
				physicalAttempt: 1,
				actualMicroUsd: 1_100,
				pricing: AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[PRICED]
			})
		]);
	});

	it('reserves under the fallback snapshot when it leads, and never undercharges a missing cost', async () => {
		const { store, meter, gate } = await claimedMeter();
		const permit = await gate.admit(
			{
				routeId: 'openrouter-workflow',
				routeKind: 'openrouter',
				// Route health promoted the fallback; the provider may still serve the primary.
				model: FALLBACK,
				fallbackModels: [PRICED],
				serializedRequestBytes: 4_000,
				maxOutputTokens: 900
			},
			new AbortController().signal
		);
		permit.settle({
			kind: 'stream_ended',
			httpStatus: 200,
			requestId: 'gen-2',
			usage: {
				promptTokens: 1_000,
				completionTokens: 100,
				totalTokens: 1_100,
				reasoningTokens: null,
				cachedPromptTokens: null,
				costUsd: null,
				modelUsed: PRICED
			}
		});
		expect(await meter.drain(1_000)).toBe(true);
		const [row] = [...store.dispatches.values()];
		expect(row).toMatchObject({
			state: 'settled',
			pricing: AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[FALLBACK],
			// 1000 * 0.30 + 100 * 1.20 at the primary's higher rate, not 1000 * 0.098 + 100 * 0.196.
			actualMicroUsd: 420
		});
	});

	it('still refuses the workflow route and any request that names an unpriced model', async () => {
		expect(() =>
			buildAgenticChatWorkflowRoutesV1([route()], {
				[PRICED]: AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1[PRICED]!
			})
		).toThrow(`Workflow models lack frozen pricing snapshots: ${FALLBACK}`);
		const { store, gate } = await claimedMeter();
		await expect(
			gate.admit(
				{
					routeId: 'openrouter-workflow',
					routeKind: 'openrouter',
					model: PRICED,
					fallbackModels: [FALLBACK, 'provider/unpriced'],
					serializedRequestBytes: 4_000,
					maxOutputTokens: 900
				},
				new AbortController().signal
			)
		).rejects.toMatchObject({ code: 'pricing_unavailable' });
		expect(store.dispatches.size).toBe(0);
	});
});
