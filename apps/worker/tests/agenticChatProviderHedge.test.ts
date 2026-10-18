// apps/worker/tests/agenticChatProviderHedge.test.ts
//
// Backup requests (hedging) for stalled acting streams: the atomic buffer starts
// its single retry early, on another endpoint, while the first request still
// runs, and keeps whichever finishes cleanly first.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenticChatOpenRouterClient } from '../src/workers/agentic-chat/provider/openrouter-client';
import type {
	AgenticChatLiveTextPreviewUpdateV1,
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import { streamBufferedProviderPass } from '../src/workers/agentic-chat/provider/provider-pass';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/effects/pending-effects';
import {
	HEDGE_FIRST_PROGRESS_MS,
	HEDGE_SLOW_WINDOW_MS
} from '../src/workers/agentic-chat/provider/openrouter/watchdog';
import type { AgenticChatProviderUsageObservationV1 } from '../src/workers/agentic-chat/provider/openrouter-client';

afterEach(() => vi.useRealTimers());
const V41 = 'deepseek/deepseek-v4.1-flash';
const encoder = new TextEncoder();

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: 'Does everything look good in here?' }],
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
		providerRound: 'synthesis',
		logicalProviderRound: 3,
		passRole: 'acting',
		signal: new AbortController().signal,
		...overrides
	};
}

function controllableResponse(provider: string) {
	let output!: ReadableStreamDefaultController<Uint8Array>;
	let closed = false;
	const response = new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				output = controller;
			},
			cancel() {
				closed = true;
			}
		}),
		{
			headers: {
				'content-type': 'text/event-stream',
				'x-openrouter-provider': provider,
				'x-openrouter-model': V41
			}
		}
	);
	const frame = (value: unknown) => {
		if (!closed) output.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
	};
	return {
		response,
		text(content: string) {
			frame({ model: V41, provider, choices: [{ delta: { content }, finish_reason: null }] });
		},
		finish() {
			if (closed) return;
			frame({
				choices: [{ delta: {}, finish_reason: 'stop' }],
				usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
			});
			output.enqueue(encoder.encode('data: [DONE]\n\n'));
			output.close();
			closed = true;
		},
		fail() {
			if (closed) return;
			frame({ choices: [{ delta: {}, finish_reason: 'error' }] });
			output.enqueue(encoder.encode('data: [DONE]\n\n'));
			output.close();
			closed = true;
		}
	};
}

function harness(
	responses: Array<Response | (() => Promise<Response>)>,
	options: { hedging?: boolean; preview?: boolean } = {}
) {
	const requests: Array<{ body: Record<string, any>; signal: AbortSignal }> = [];
	const usage: AgenticChatProviderUsageObservationV1[] = [];
	const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
		requests.push({
			body: JSON.parse(String(init!.body)),
			signal: init!.signal as AbortSignal
		});
		const response = responses.shift();
		if (!response) throw new Error('Unexpected third dispatch');
		return typeof response === 'function' ? response() : response;
	});
	const openRouter = new AgenticChatOpenRouterClient(
		{
			pendingEffects: new AgenticChatPendingEffectsRegistry(),
			usage: {
				observe(observation) {
					usage.push(observation);
					return undefined;
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
					model: V41,
					providerRouting: { sort: 'throughput', ignore: ['azure'] }
				}
			],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS test',
			fetchImpl,
			requestTimeoutMs: 30_000,
			...(options.hedging === undefined ? {} : { slowStreamHedging: options.hedging })
		}
	);
	const previews: AgenticChatLiveTextPreviewUpdateV1[] = [];
	const client = options.preview
		? {
				stream: (input: Parameters<typeof openRouter.stream>[0]) =>
					openRouter.stream(input),
				livePreview: {
					publish: (update: AgenticChatLiveTextPreviewUpdateV1) => previews.push(update)
				}
			}
		: openRouter;
	const capacity = { markTemporarilyUnavailable: vi.fn() };
	return {
		requests,
		usage,
		previews,
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

const texts = (events: AgenticChatTurnProviderClientEventV1[]) =>
	events.flatMap((event) => (event.type === 'text' ? [event.content] : []));

describe('provider hedging for stalled acting streams', () => {
	it('starts a backup 2 s into a stall without ending the first request, and keeps the faster one', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([slow.response, backup.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		// The backup is out; the first request is still alive.
		expect(test.requests).toHaveLength(2);
		expect(test.requests[0]!.signal.aborted).toBe(false);
		// It routes around the stalled endpoint only.
		expect(test.requests[1]!.body.provider.ignore).toContain('together');
		expect(test.requests[1]!.body.model).toBe(V41);
		backup.text('From the backup.');
		backup.finish();
		const events = await collecting;
		expect(texts(events)).toEqual(['From the backup.']);
		expect(events.at(-1)).toMatchObject({ type: 'done' });
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(test.requests).toHaveLength(2);
		// The loser's usage row names the hedge.
		await vi.advanceTimersByTimeAsync(0);
		expect(test.usage.find((row) => row.providerAttempt === 1)).toMatchObject({
			status: 'aborted',
			error: expect.stringContaining('hedge')
		});
	});

	it('keeps the first request when it recovers and finishes before the backup', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([slow.response, backup.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('First ');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		expect(test.requests).toHaveLength(2);
		slow.text('answer.');
		slow.finish();
		const events = await collecting;
		expect(texts(events)).toEqual(['First ', 'answer.']);
		expect(test.requests[1]!.signal.aborted).toBe(true);
	});

	it('never starts a backup for a healthy stream', async () => {
		vi.useFakeTimers();
		const healthy = controllableResponse('BaseTen');
		const test = harness([healthy.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		for (let i = 0; i < 60; i += 1) {
			healthy.text('a healthy stream writes about two hundred and fifty tokens a second. ');
			await vi.advanceTimersByTimeAsync(100);
		}
		healthy.finish();
		await collecting;
		expect(test.requests).toHaveLength(1);
	});

	it('starts a backup after 8 s of silence instead of waiting for the 15 s stall abort', async () => {
		vi.useFakeTimers();
		const silent = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([silent.response, backup.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(HEDGE_FIRST_PROGRESS_MS - 600);
		expect(test.requests).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(test.requests).toHaveLength(2);
		expect(test.requests[0]!.signal.aborted).toBe(false);
		backup.text('Answered.');
		backup.finish();
		expect(texts(await collecting)).toEqual(['Answered.']);
	});

	it('uses the backup when the first request is ended by the 4 s stall window', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([slow.response, backup.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(4_500);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		expect(test.requests[1]!.signal.aborted).toBe(false);
		backup.text('Still here.');
		backup.finish();
		expect(texts(await collecting)).toEqual(['Still here.']);
		expect(test.requests).toHaveLength(2);
	});

	it('surfaces the backup failure when both requests fail, without a third request', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([slow.response, backup.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		backup.fail();
		await vi.advanceTimersByTimeAsync(0);
		slow.fail();
		const events = await collecting;
		expect(events.at(-1)).toMatchObject({ type: 'error' });
		expect(test.requests).toHaveLength(2);
	});

	it("keeps today's behavior when hedging is off", async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const retry = controllableResponse('BaseTen');
		const test = harness([slow.response, retry.response], { hedging: false });
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		expect(test.requests).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(test.requests).toHaveLength(2);
		expect(test.requests[0]!.signal.aborted).toBe(true);
		retry.text('Retried.');
		retry.finish();
		expect(texts(await collecting)).toEqual(['Retried.']);
	});

	it('does not hedge the retry that follows an ordinary failure', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('BaseTen');
		const test = harness([new Response('busy', { status: 503 }), slow.response]);
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		expect(test.requests).toHaveLength(2);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 1_000);
		expect(test.requests).toHaveLength(2);
		slow.text(' finished slowly.');
		slow.finish();
		expect(texts(await collecting)).toEqual(['x', ' finished slowly.']);
	});

	it('ends an in-flight first attempt when the turn is cancelled', async () => {
		const seen: AbortSignal[] = [];
		const client = {
			stream: async function* (input: { signal: AbortSignal }) {
				seen.push(input.signal);
				await new Promise((_resolve, reject) =>
					input.signal.addEventListener('abort', () => reject(input.signal.reason), {
						once: true
					})
				);
				yield {
					type: 'done',
					finishedReason: 'stop'
				} as AgenticChatTurnProviderClientEventV1;
			}
		};
		const turn = new AbortController();
		const collecting = collect(
			streamBufferedProviderPass(
				request({ signal: turn.signal }),
				client as never,
				{ markTemporarilyUnavailable: vi.fn() },
				2_000
			)
		).catch((error: unknown) => error);
		await Promise.resolve();
		expect(seen).toHaveLength(1);
		expect(seen[0]).not.toBe(turn.signal);
		turn.abort(new Error('user stop'));
		expect(seen[0]!.aborted).toBe(true);
		expect(await collecting).toMatchObject({ message: 'user stop' });
	});

	it("holds the backup preview until it wins, then retracts the first request's text", async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together');
		const backup = controllableResponse('BaseTen');
		const test = harness([slow.response, backup.response], { preview: true });
		const collecting = collect(test.stream());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('Slow start');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		expect(test.requests).toHaveLength(2);
		const firstKey = test.previews[0]!.passKey;
		backup.text('Backup answer.');
		await vi.advanceTimersByTimeAsync(300);
		// Nothing from the backup is shown while the first request may still win.
		expect(test.previews.every((update) => update.passKey === firstKey)).toBe(true);
		backup.finish();
		await collecting;
		const backupUpdates = test.previews.filter((update) => update.passKey !== firstKey);
		expect(backupUpdates.at(-1)).toMatchObject({ state: 'streaming', text: 'Backup answer.' });
		expect(test.previews).toContainEqual(
			expect.objectContaining({ passKey: firstKey, state: 'discard' })
		);
	});
});
