// apps/worker/tests/agenticChatLlmCallIncidents.test.ts
//
// A model request that stalls or fails is captured in full (`llm_call_incidents`):
// the exact body sent, the response bytes with their timing, the error body, how
// the attempt ended, and, for a stall, how the request finished when left running.
// A healthy request writes nothing, and nothing here holds up the turn.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenticChatOpenRouterClient } from '../src/workers/agentic-chat/provider/openrouter-client';
import type {
	AgenticChatTurnProviderClientEventV1,
	AgenticChatTurnProviderRequestV1
} from '../src/workers/agentic-chat/provider/contracts';
import { streamBufferedProviderPass } from '../src/workers/agentic-chat/provider/provider-pass';
import { AgenticChatPendingEffectsRegistry } from '../src/workers/agentic-chat/effects/pending-effects';
import { HEDGE_SLOW_WINDOW_MS } from '../src/workers/agentic-chat/provider/openrouter/watchdog';
import {
	DrainBudget,
	type LlmCallIncidentPatchV1,
	type LlmCallIncidentRowV1,
	ProviderCallCapture,
	capturedRequestHeaders,
	classifyIncident,
	summarizeSse
} from '../src/workers/agentic-chat/provider/openrouter/call-capture';
import {
	type LlmCallIncidentClient,
	SupabaseLlmCallIncidentSink
} from '../src/workers/agentic-chat/effects/llm-call-incidents';
import {
	minimalErrorBody,
	projectIncidentRequestBody
} from '../src/workers/agentic-chat/provider/openrouter/incident-redaction';

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

const V41 = 'deepseek/deepseek-v4.1-flash';
const encoder = new TextEncoder();
const USER = '10000000-0000-4000-8000-000000000001';
const SESSION = '20000000-0000-4000-8000-000000000002';
const TURN = '30000000-0000-4000-8000-000000000003';

function request(
	overrides: Partial<AgenticChatTurnProviderRequestV1> = {}
): AgenticChatTurnProviderRequestV1 {
	return {
		messages: [{ role: 'user', content: 'Does everything look good in here?' }],
		tools: [],
		toolChoice: 'none',
		userId: USER,
		sessionId: SESSION,
		turnRunId: TURN,
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

/** An SSE response the test writes to frame by frame. */
function controllableResponse(provider: string, generationId = 'gen-test-1') {
	let output!: ReadableStreamDefaultController<Uint8Array>;
	let closed = false;
	let cancelled = false;
	const response = new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				output = controller;
			},
			cancel() {
				closed = true;
				cancelled = true;
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
	const frame = (value: Record<string, unknown>) => {
		if (!closed) {
			output.enqueue(
				encoder.encode(`data: ${JSON.stringify({ id: generationId, ...value })}\n\n`)
			);
		}
	};
	return {
		response,
		get cancelled() {
			return cancelled;
		},
		text(content: string) {
			frame({ model: V41, provider, choices: [{ delta: { content }, finish_reason: null }] });
		},
		reason(reasoning: string) {
			frame({
				model: V41,
				provider,
				choices: [{ delta: { reasoning }, finish_reason: null }]
			});
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
		}
	};
}

function fakeSink() {
	const inserts: LlmCallIncidentRowV1[] = [];
	const updates: Array<{ id: string; patch: LlmCallIncidentPatchV1 }> = [];
	const rows = new Map<string, LlmCallIncidentRowV1>();
	return {
		inserts,
		updates,
		rows,
		sink: {
			insert(row: LlmCallIncidentRowV1) {
				inserts.push(row);
				rows.set(row.id, structuredClone(row));
			},
			update(id: string, patch: LlmCallIncidentPatchV1) {
				updates.push({ id, patch });
				const row = rows.get(id);
				if (row) Object.assign(row, structuredClone(patch));
			}
		}
	};
}

type Dispatch = Response | (() => Promise<Response>);

function harness(
	responses: Dispatch[],
	options: {
		drain?: boolean;
		hedging?: boolean;
		responseHeadersTimeoutMs?: number;
		requestTimeoutMs?: number;
		generation?: (id: string) => Response;
	} = {}
) {
	const requests: Array<{ raw: string; signal: AbortSignal; headers: Record<string, string> }> =
		[];
	const lookups: string[] = [];
	const incidents = fakeSink();
	const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
		if (String(url).includes('/generation?id=')) {
			const id = new URL(String(url)).searchParams.get('id')!;
			lookups.push(id);
			return options.generation?.(id) ?? new Response('{}', { status: 404 });
		}
		requests.push({
			raw: String(init!.body),
			signal: init!.signal as AbortSignal,
			headers: init!.headers as Record<string, string>
		});
		const response = responses.shift();
		if (!response) throw new Error('Unexpected dispatch');
		return typeof response === 'function' ? response() : response;
	});
	const client = new AgenticChatOpenRouterClient(
		{
			pendingEffects: new AgenticChatPendingEffectsRegistry(),
			usage: { observe: () => undefined },
			incidents: incidents.sink
		},
		{
			routes: [
				{
					id: 'openrouter',
					kind: 'openrouter',
					baseUrl: 'https://provider.invalid/api/v1',
					apiKey: 'sk-or-secret-key',
					model: V41,
					providerRouting: { sort: 'throughput' }
				}
			],
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS test',
			fetchImpl,
			requestTimeoutMs: options.requestTimeoutMs ?? 30_000,
			...(options.responseHeadersTimeoutMs
				? { responseHeadersTimeoutMs: options.responseHeadersTimeoutMs }
				: {}),
			...(options.drain === undefined ? {} : { incidentDrain: options.drain }),
			...(options.hedging === undefined ? {} : { slowStreamHedging: options.hedging })
		}
	);
	return {
		client,
		requests,
		lookups,
		incidents,
		pass(input = request()) {
			return streamBufferedProviderPass(
				input,
				client,
				{ markTemporarilyUnavailable: vi.fn() },
				2_000
			);
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
const eventNames = (row: LlmCallIncidentRowV1) =>
	(row.timeline.events as Array<{ event: string }>).map((entry) => entry.event);

describe('LLM call incidents through the OpenRouter client', () => {
	it('writes nothing for a healthy request, and the turn still reads every byte', async () => {
		const ok = controllableResponse('Together');
		const test = harness([ok.response]);
		const collecting = collect(test.client.stream(request()));
		ok.text('Hello ');
		ok.text('there.');
		ok.finish();
		const events = await collecting;
		expect(texts(events)).toEqual(['Hello ', 'there.']);
		expect(events.at(-1)).toMatchObject({ type: 'done' });
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(test.incidents.inserts).toHaveLength(0);
		expect(test.lookups).toHaveLength(0);
	});

	it('captures a 429 with the exact body sent, the error body, and its headers', async () => {
		const test = harness([
			new Response(
				JSON.stringify({
					error: {
						message: 'Provider returned error',
						code: 429,
						metadata: { provider_name: 'DeepInfra', raw: 'rate limited upstream' }
					}
				}),
				{
					status: 429,
					headers: { 'content-type': 'application/json', 'retry-after': '3' }
				}
			)
		]);
		const events = await collect(test.client.stream(request()));
		expect(events.at(-1)).toMatchObject({ type: 'error' });
		await vi.waitFor(() => expect(test.incidents.inserts).toHaveLength(1));
		const row = test.incidents.inserts[0]!;
		expect(row).toMatchObject({
			lane: 'agentic_chat_worker_stream',
			kind: 'error',
			reason: 'http_429',
			http_status: 429,
			user_id: USER,
			session_id: SESSION,
			turn_run_id: TURN,
			pass_role: 'acting',
			logical_provider_round: 3,
			provider_attempt: 1,
			route_id: 'openrouter',
			model_requested: V41,
			eventual: null
		});
		// Byte for byte what went out, with its hash; the key never appears.
		expect(row.request_body).toBe(test.requests[0]!.raw);
		expect(JSON.parse(row.request_body).messages[0].content).toBe(
			'Does everything look good in here?'
		);
		expect(row.request_sha256).toMatch(/^[0-9a-f]{64}$/);
		expect(row.request_headers).toMatchObject({
			Authorization: '[redacted]',
			'X-Title': 'BuildOS test'
		});
		expect(JSON.stringify(row)).not.toContain('sk-or-secret-key');
		expect(row.response_body).toContain('DeepInfra');
		expect(row.response_body).toContain('rate limited upstream');
		expect(row.response_headers).toMatchObject({ 'retry-after': '3' });
		expect(row.outcome).toMatchObject({
			receipt: { status: 'failure' },
			usage_log: { status: 'failure' }
		});
		expect(eventNames(row)).toEqual(['request_sent', 'response_opened', 'attempt_ended']);
	});

	it('leaves a slow stream running after the watch gives up, and records how it ended', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together', 'gen-slow-1');
		const test = harness([slow.response], {
			generation: (id) =>
				new Response(
					JSON.stringify({
						data: {
							id,
							provider_name: 'Together',
							latency: 900,
							generation_time: 31_000
						}
					}),
					{ headers: { 'content-type': 'application/json' } }
				)
		});
		const collecting = collect(test.client.stream(request({ allowSlowStreamRecovery: true })));
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(5_000);
		const events = await collecting;
		expect(events.at(-1)).toMatchObject({ type: 'error', cause: 'slow_stream' });
		// The turn has moved on; the request itself is still open.
		expect(test.requests[0]!.signal.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(300);
		expect(test.incidents.inserts).toHaveLength(1);
		const row = test.incidents.inserts[0]!;
		expect(row).toMatchObject({
			kind: 'stall',
			reason: 'slow_stream',
			generation_id: 'gen-slow-1',
			provider: 'Together',
			eventual: { status: 'running' }
		});
		expect(eventNames(row)).toEqual(
			expect.arrayContaining(['first_byte', 'stall', 'attempt_aborted', 'drain_started'])
		);

		await vi.advanceTimersByTimeAsync(20_000);
		slow.text(' and the rest of a late answer');
		slow.finish();
		await vi.advanceTimersByTimeAsync(0);
		const stored = test.incidents.rows.get(row.id)!;
		expect(stored.eventual).toMatchObject({
			ended_by: 'stream_end',
			completed: true,
			finish_reason: 'stop',
			usage: { completion_tokens: 20 }
		});
		expect(stored.eventual!.total_ms as number).toBeGreaterThanOrEqual(25_000);
		expect(stored.response_body).toContain('late answer');
		expect(test.requests[0]!.signal.aborted).toBe(true);

		// OpenRouter's record, looked up once it exists.
		await vi.advanceTimersByTimeAsync(10_000);
		expect(test.lookups).toEqual(['gen-slow-1']);
		expect(stored.generation_stats).toMatchObject({ generation_time: 31_000 });
	});

	it('takes a response that arrives after the header deadline, and keeps the error body when it fails', async () => {
		vi.useFakeTimers();
		let resolveLate!: (response: Response) => void;
		const late = new Promise<Response>((resolve) => (resolveLate = resolve));
		const test = harness([() => late], { responseHeadersTimeoutMs: 1_000 });
		const events = collect(test.client.stream(request()));
		await vi.advanceTimersByTimeAsync(1_100);
		expect((await events).at(-1)).toMatchObject({ type: 'error', retryable: true });
		await vi.advanceTimersByTimeAsync(0);
		const row = test.incidents.inserts[0]!;
		expect(row).toMatchObject({
			kind: 'stall',
			reason: 'response_headers_timeout',
			http_status: null,
			eventual: { status: 'running' }
		});

		await vi.advanceTimersByTimeAsync(6_000);
		resolveLate(
			new Response(JSON.stringify({ error: { message: 'Upstream overloaded' } }), {
				status: 503,
				headers: { 'content-type': 'application/json' }
			})
		);
		await vi.advanceTimersByTimeAsync(0);
		const stored = test.incidents.rows.get(row.id)!;
		expect(stored.http_status).toBe(503);
		expect(stored.response_body).toContain('Upstream overloaded');
		expect(stored.eventual).toMatchObject({ ended_by: 'response_error', http_status: 503 });
		expect(stored.eventual!.total_ms as number).toBeGreaterThanOrEqual(7_000);
	});

	it('ends the drain when the request left running fails before any response', async () => {
		vi.useFakeTimers();
		let rejectLate!: (error: Error) => void;
		const late = new Promise<Response>((_resolve, reject) => (rejectLate = reject));
		const test = harness([() => late], { responseHeadersTimeoutMs: 1_000 });
		const events = collect(test.client.stream(request()));
		await vi.advanceTimersByTimeAsync(1_100);
		expect((await events).at(-1)).toMatchObject({ type: 'error' });
		await vi.advanceTimersByTimeAsync(0);
		const row = test.incidents.inserts[0]!;
		rejectLate(new TypeError('fetch failed: other side closed'));
		await vi.advanceTimersByTimeAsync(0);
		expect(test.incidents.rows.get(row.id)!.eventual).toMatchObject({
			ended_by: 'request_error',
			completed: false
		});
		expect(eventNames(test.incidents.rows.get(row.id)!)).toContain('request_failed');
	});

	it('keeps no email, calendar or web content and no signed URL token', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together', 'gen-mail-1');
		const test = harness([slow.response]);
		const collecting = collect(
			test.client.stream(
				request({
					allowSlowStreamRecovery: true,
					messages: [
						{
							role: 'user',
							content: [
								{ type: 'text', text: 'What did the lawyer say?' },
								{
									type: 'image_url',
									image_url: {
										url: 'https://storage.invalid/object/sign/a/b.png?token=SIGNED-SECRET',
										detail: 'auto'
									}
								}
							]
						},
						{
							role: 'assistant',
							content: '',
							tool_calls: [
								{
									id: 'call_mail',
									type: 'function',
									function: {
										name: 'get_email_message',
										arguments: '{"id":"m-1"}'
									}
								},
								{
									id: 'call_task',
									type: 'function',
									function: { name: 'get_onto_task_details', arguments: '{}' }
								}
							]
						},
						{
							role: 'tool',
							tool_call_id: 'call_mail',
							content: JSON.stringify({
								message: {
									id: 'm-1',
									subject: 'Acquisition terms',
									body: 'The acquisition price is 4.2 million.'
								}
							})
						},
						{
							role: 'tool',
							tool_call_id: 'call_task',
							content: JSON.stringify({ task: { title: 'Call the lawyer back' } })
						}
					] as never
				})
			)
		);
		await vi.advanceTimersByTimeAsync(0);
		slow.text('The acquisition price is 4.2 million');
		await vi.advanceTimersByTimeAsync(5_000);
		await collecting;
		await vi.advanceTimersByTimeAsync(300);
		const row = test.incidents.inserts[0]!;
		expect(row.kind).toBe('stall');
		const stored = JSON.stringify(row);
		expect(stored).not.toContain('acquisition price');
		expect(stored).not.toContain('Acquisition terms');
		expect(stored).not.toContain('SIGNED-SECRET');
		// Workspace results and the user's own words stay as sent.
		expect(row.request_body).toContain('Call the lawyer back');
		expect(row.request_body).toContain('What did the lawyer say?');
		expect(row.request_body).toContain('content_redacted');
		expect(row.response_body).toBeNull();
		expect(row.outcome).toMatchObject({
			request_projection: {
				pass_through_tool_call_ids: ['call_mail'],
				signed_urls_stripped: 1,
				reply_withheld: true
			},
			captured_stream: { content_chars: 36 }
		});
		// The real bytes are still identified by their hash.
		expect(row.request_sha256).not.toBe('');
		slow.text(' more about the acquisition price');
		slow.finish();
		await vi.advanceTimersByTimeAsync(0);
		expect(JSON.stringify(test.incidents.rows.get(row.id))).not.toContain('acquisition price');
	});

	it('ends a turn on time when a failed response body stalls, instead of leaving it running', async () => {
		vi.useFakeTimers();
		const test = harness(
			[
				new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
					status: 500,
					headers: { 'content-type': 'application/json' }
				})
			],
			{ requestTimeoutMs: 2_000 }
		);
		let settled = false;
		const collecting = collect(test.client.stream(request())).finally(() => (settled = true));
		await vi.advanceTimersByTimeAsync(2_100);
		expect(settled).toBe(true);
		expect((await collecting).at(-1)).toMatchObject({ type: 'error' });
		expect(test.requests[0]!.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(300);
		const row = test.incidents.inserts[0]!;
		expect(row).toMatchObject({ kind: 'stall', reason: 'request_timeout', eventual: null });
		expect(row.timeline.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: 'drain_skipped', why: 'nothing_to_record' })
			])
		);
	});

	it('records a runaway-reasoning cutoff without leaving it running', async () => {
		vi.useFakeTimers();
		const thinking = controllableResponse('Together', 'gen-runaway');
		const test = harness([thinking.response]);
		const collecting = collect(
			test.client.stream(
				request({ allowSlowStreamRecovery: true, allowRunawayReasoningCutoff: true })
			)
		);
		await vi.advanceTimersByTimeAsync(0);
		thinking.reason('x'.repeat(40_000));
		const events = await collecting;
		expect(events.at(-1)).toMatchObject({ type: 'error', cause: 'output_budget_exhausted' });
		expect(test.requests[0]!.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(300);
		expect(test.incidents.inserts[0]).toMatchObject({
			kind: 'stall',
			reason: 'runaway_reasoning_cutoff',
			eventual: null
		});
	});

	it('ends a cancelled request at once and records nothing', async () => {
		const ok = controllableResponse('Together');
		const test = harness([ok.response]);
		const controller = new AbortController();
		const stream = test.client.stream(request({ signal: controller.signal }));
		ok.text('Hel');
		const first = await stream.next();
		expect(first.value).toMatchObject({ type: 'text' });
		controller.abort(new Error('user stop'));
		await expect(collect({ [Symbol.asyncIterator]: () => stream })).rejects.toThrow();
		expect(test.requests[0]!.signal.aborted).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(test.incidents.inserts).toHaveLength(0);
		expect(ok.cancelled).toBe(true);
	});

	it('does not leave the request running when draining is off', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('BaseTen');
		const test = harness([slow.response], { drain: false });
		const collecting = collect(test.client.stream(request({ allowSlowStreamRecovery: true })));
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(5_000);
		await collecting;
		expect(test.requests[0]!.signal.aborted).toBe(true);
		await vi.advanceTimersByTimeAsync(300);
		expect(test.incidents.inserts[0]).toMatchObject({
			kind: 'stall',
			reason: 'slow_stream',
			eventual: null
		});
	});

	it('records the stalled primary of a hedge, drains it, and leaves the winning backup alone', async () => {
		vi.useFakeTimers();
		const slow = controllableResponse('Together', 'gen-primary');
		const backup = controllableResponse('BaseTen', 'gen-backup');
		const test = harness([slow.response, backup.response]);
		const collecting = collect(test.pass());
		await vi.advanceTimersByTimeAsync(0);
		slow.text('x');
		await vi.advanceTimersByTimeAsync(HEDGE_SLOW_WINDOW_MS + 500);
		expect(test.requests).toHaveLength(2);
		backup.text('From the backup.');
		backup.finish();
		const events = await collecting;
		expect(texts(events).join('')).toBe('From the backup.');
		await vi.advanceTimersByTimeAsync(300);
		expect(test.incidents.inserts).toHaveLength(1);
		const row = test.incidents.inserts[0]!;
		expect(row).toMatchObject({
			kind: 'stall',
			reason: 'hedge_slow_stream',
			provider_attempt: 1,
			provider: 'Together',
			eventual: { status: 'running' },
			outcome: { receipt: { status: 'aborted', error_class: 'hedge_lost' } }
		});
		// The loser keeps running in the background until it finishes.
		expect(test.requests[0]!.signal.aborted).toBe(false);
		slow.text(' late');
		slow.finish();
		await vi.advanceTimersByTimeAsync(0);
		expect(test.incidents.rows.get(row.id)!.eventual).toMatchObject({
			ended_by: 'stream_end',
			completed: true
		});
	});
});

function capture(
	overrides: {
		drain?: boolean;
		budget?: DrainBudget;
		drainAllowed?: boolean;
		limits?: ConstructorParameters<typeof ProviderCallCapture>[0]['limits'];
		fetchImpl?: typeof fetch;
	} = {}
) {
	const incidents = fakeSink();
	const instance = new ProviderCallCapture(
		{
			sink: incidents.sink,
			lane: 'agentic_chat_worker_stream',
			drain: overrides.drain ?? true,
			fetchImpl: overrides.fetchImpl ?? (vi.fn() as unknown as typeof fetch),
			drainBudget: overrides.budget ?? new DrainBudget(3, 30),
			...(overrides.limits ? { limits: overrides.limits } : {})
		},
		{
			userId: USER,
			sessionId: SESSION,
			turnRunId: TURN,
			projectId: null,
			usageLogId: null,
			passRole: 'acting',
			logicalProviderRound: 1,
			providerAttempt: 1,
			routeId: 'openrouter',
			routeKind: 'openrouter',
			baseUrl: 'https://provider.invalid/api/v1',
			modelRequested: V41,
			drainAllowed: overrides.drainAllowed ?? true,
			context: {}
		},
		'sk-or-secret-key',
		'{"model":"deepseek/deepseek-v4.1-flash"}',
		{}
	);
	return { instance, incidents };
}

describe('ProviderCallCapture', () => {
	it('keeps a stall even when the request is then cancelled, without leaving it running', async () => {
		const { instance, incidents } = capture();
		instance.markStall('hedge_slow_stream', { elapsed_ms: 2_000 });
		instance.onAttemptAbort(new Error('user stop'), false, true);
		expect(instance.signal.aborted).toBe(true);
		instance.end({ status: 'aborted', error_class: 'aborted' });
		instance.release();
		await vi.waitFor(() => expect(incidents.inserts).toHaveLength(1));
		expect(incidents.inserts[0]).toMatchObject({
			kind: 'stall',
			reason: 'hedge_slow_stream',
			eventual: null
		});
	});

	it('ends the request at once when the drain budget is spent or the request is budgeted', () => {
		const spent = capture({ budget: new DrainBudget(0, 30) });
		spent.instance.onAttemptAbort(new Error('timeout'), true, false);
		expect(spent.instance.signal.aborted).toBe(true);

		const workflow = capture({ drainAllowed: false });
		workflow.instance.onAttemptAbort(new Error('timeout'), true, false);
		expect(workflow.instance.signal.aborted).toBe(true);
	});

	it('bounds a drain by its deadline and the hourly budget', async () => {
		vi.useFakeTimers();
		const budget = new DrainBudget(3, 1);
		const { instance, incidents } = capture({ budget, limits: { drainMs: 5_000 } });
		const tee = instance.tee(
			new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), {
				headers: { 'content-type': 'text/event-stream' }
			})
		);
		void tee.body!.cancel();
		instance.onAttemptAbort(new Error('timeout'), true, true);
		expect(instance.signal.aborted).toBe(false);
		instance.end({ status: 'failure', error_class: 'provider_timeout' });
		instance.release();
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(instance.signal.aborted).toBe(true);
		expect(incidents.rows.get(instance.id)!.eventual).toMatchObject({
			ended_by: 'deadline',
			completed: false
		});
		// One drain an hour: the next stall ends at once.
		expect(budget.tryAcquire(Date.now())).toBe(false);
	});

	it('does not leave running a request whose response already arrived in full', async () => {
		const budget = new DrainBudget(3, 30);
		const { instance, incidents } = capture({ budget });
		const response = instance.tee(
			new Response('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', {
				headers: { 'content-type': 'text/event-stream' }
			})
		);
		await response.text();
		await new Promise((resolve) => setTimeout(resolve, 0));
		instance.markStall('hedge_slow_stream');
		instance.onAttemptAbort(new Error('timeout'), true, true);
		instance.end({ status: 'failure', error_class: 'provider_timeout' });
		instance.release();
		await vi.waitFor(() => expect(incidents.inserts).toHaveLength(1));
		expect(incidents.inserts[0]!.eventual).toBeNull();
		expect(incidents.inserts[0]!.timeline.events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ event: 'drain_skipped', why: 'stream_already_ended' })
			])
		);
		// The slot was never taken.
		expect([1, 2, 3].every(() => budget.tryAcquire(Date.now()))).toBe(true);
	});

	it('stores at most the response bound, and counts the rest', async () => {
		const { instance, incidents } = capture({ limits: { responseBytes: 10 } });
		const response = instance.tee(
			new Response('data: 0123456789abcdef\n\n', {
				headers: { 'content-type': 'text/event-stream' }
			})
		);
		await response.text();
		instance.end({ status: 'failure', error_class: 'provider_permanent_error' });
		instance.release();
		await vi.waitFor(() => expect(incidents.inserts).toHaveLength(1));
		expect(incidents.inserts[0]).toMatchObject({
			response_body: 'data: 0123',
			response_truncated: true
		});
	});

	it('looks up the generation again when OpenRouter has not recorded it yet', async () => {
		vi.useFakeTimers();
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(new Response('{}', { status: 404 }))
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ data: { id: 'gen-9', cancelled: true } }), {
					headers: { 'content-type': 'application/json' }
				})
			);
		const { instance, incidents } = capture({ fetchImpl });
		instance.end({ status: 'failure', error_class: 'provider_permanent_error' });
		instance.release({ generationId: 'gen-9' });
		await vi.advanceTimersByTimeAsync(300);
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(String(fetchImpl.mock.calls[0]![0])).toBe(
			'https://provider.invalid/api/v1/generation?id=gen-9'
		);
		expect(incidents.rows.get(instance.id)!.generation_stats).toEqual({
			id: 'gen-9',
			cancelled: true
		});
	});
});

describe('incident rules', () => {
	it('keeps stalls and failures, and skips cancels and healthy calls', () => {
		const stall = { reason: 'slow_stream' };
		expect(classifyIncident({ status: 'success', error_class: null }, null, 200)).toBeNull();
		expect(classifyIncident({ status: 'success' }, stall, 200)).toEqual({
			kind: 'stall',
			reason: 'slow_stream'
		});
		expect(
			classifyIncident({ status: 'success', rejected_tool_name: 'made_up_tool' }, null, 200)
		).toEqual({ kind: 'error', reason: 'tool_call_rejected' });
		expect(
			classifyIncident({ status: 'aborted', error_class: 'aborted' }, null, 200)
		).toBeNull();
		expect(
			classifyIncident({ status: 'aborted', error_class: 'hedge_lost' }, null, 200)
		).toBeNull();
		expect(
			classifyIncident(
				{ status: 'failure', error_class: 'provider_consumer_closed' },
				null,
				200
			)
		).toBeNull();
		expect(
			classifyIncident(
				{ status: 'failure', error_class: 'provider_retryable_error' },
				null,
				502
			)
		).toEqual({ kind: 'error', reason: 'http_502' });
		expect(
			classifyIncident(
				{
					status: 'failure',
					error_class: 'provider_permanent_error',
					finish_reason: 'error'
				},
				null,
				200
			)
		).toEqual({ kind: 'error', reason: 'provider_finish_reason_error' });
		expect(
			classifyIncident(
				{ status: 'failure', error_class: 'output_budget_exhausted' },
				null,
				200
			)
		).toEqual({ kind: 'error', reason: 'output_budget_exhausted' });
	});

	it('redacts every request header it did not write itself', () => {
		expect(
			capturedRequestHeaders({
				Authorization: 'Bearer sk-or-secret',
				'Content-Type': 'application/json',
				'X-Title': 'BuildOS',
				'api-key': 'azure-secret'
			})
		).toEqual({
			Authorization: '[redacted]',
			'Content-Type': 'application/json',
			'X-Title': 'BuildOS',
			'api-key': '[redacted]'
		});
	});

	it('sums a raw SSE capture', () => {
		const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
		const raw =
			frame({
				id: 'gen-1',
				model: V41,
				provider: 'Together',
				choices: [{ delta: { reasoning: 'thinking' } }]
			}) +
			frame({
				id: 'gen-1',
				choices: [
					{ delta: { tool_calls: [{ index: 0, function: { name: 'get_project' } }] } }
				]
			}) +
			frame({
				id: 'gen-1',
				choices: [{ delta: { content: 'Hi' }, finish_reason: 'tool_calls' }],
				usage: { completion_tokens: 12 }
			}) +
			'data: [DONE]\n\n';
		expect(summarizeSse(raw)).toEqual({
			generation_id: 'gen-1',
			model: V41,
			provider: 'Together',
			frames: 3,
			done: true,
			finish_reason: 'tool_calls',
			native_finish_reason: null,
			usage: { completion_tokens: 12 },
			error: null,
			content_chars: 2,
			reasoning_chars: 8,
			tool_calls: ['get_project']
		});
	});
});

describe('stored request projection', () => {
	const call = (id: string, name: string) => ({
		id,
		type: 'function',
		function: { name, arguments: '{}' }
	});

	it('keeps a workspace-only body byte for byte', () => {
		const raw = JSON.stringify({
			model: V41,
			messages: [
				{
					role: 'assistant',
					content: '',
					tool_calls: [call('c1', 'get_project_overview')]
				},
				{ role: 'tool', tool_call_id: 'c1', content: '{"project":{"name":"Cadre"}}' }
			]
		});
		expect(projectIncidentRequestBody(raw)).toEqual({
			body: raw,
			passThroughToolCallIds: [],
			signedUrlsStripped: 0,
			reasoningRemoved: 0,
			unparsed: false
		});
	});

	it('treats a result it cannot name as read on the user`s behalf, and drops replayed reasoning', () => {
		const stored = projectIncidentRequestBody(
			JSON.stringify({
				messages: [
					{
						role: 'assistant',
						content: '',
						reasoning: 'The email says the deal closes Friday.',
						tool_calls: [call('c1', 'web_visit')]
					},
					{ role: 'tool', tool_call_id: 'c1', content: 'Page text: deal closes Friday' },
					{ role: 'tool', tool_call_id: 'orphan', content: 'Inbox: deal closes Friday' }
				]
			})
		);
		expect(stored.passThroughToolCallIds).toEqual(['c1', 'orphan']);
		expect(stored.reasoningRemoved).toBe(1);
		expect(stored.body).not.toContain('Friday');
		expect(JSON.parse(stored.body).messages[1].content).toContain('"content_redacted":true');
	});

	it('keeps nothing of a body that is not JSON', () => {
		expect(projectIncidentRequestBody('not json: secret')).toMatchObject({
			body: '{}',
			unparsed: true
		});
	});

	it('keeps only the code, message and provider of an error beside a projected request', () => {
		expect(
			JSON.parse(
				minimalErrorBody(
					JSON.stringify({
						error: {
							code: 403,
							message: 'Input was flagged',
							metadata: {
								provider_name: 'OpenAI',
								flagged_input: 'deal closes Friday'
							}
						}
					})
				)!
			)
		).toEqual({
			error: { code: 403, message: 'Input was flagged', provider_name: 'OpenAI' },
			redacted: true
		});
	});
});

describe('SupabaseLlmCallIncidentSink', () => {
	function client(
		log: string[],
		options: { failInsert?: boolean; slowInsertMs?: number; hangInsert?: boolean } = {}
	) {
		return {
			from: () => ({
				insert: (row: LlmCallIncidentRowV1) => ({
					abortSignal: async (signal: AbortSignal) => {
						if (options.hangInsert) {
							await new Promise((resolve) =>
								signal.addEventListener('abort', resolve, { once: true })
							);
							log.push(`insert ${row.id} aborted`);
							return { error: { code: '', message: 'AbortError' } };
						}
						if (options.slowInsertMs) {
							await new Promise((resolve) =>
								setTimeout(resolve, options.slowInsertMs)
							);
						}
						log.push(`insert ${row.id}`);
						return {
							error: options.failInsert
								? { code: '23503', message: 'Failing row contains (secret prompt)' }
								: null
						};
					}
				}),
				update: (patch: Record<string, unknown>) => ({
					eq: (_column: string, id: string) => ({
						abortSignal: async () => {
							log.push(`update ${id} ${Object.keys(patch).sort().join(',')}`);
							return { error: null };
						}
					})
				})
			})
		} as unknown as LlmCallIncidentClient;
	}
	const row = { id: 'incident-1', request_body: 'x'.repeat(100) } as LlmCallIncidentRowV1;

	it('writes an update only after its row', async () => {
		const log: string[] = [];
		const sink = new SupabaseLlmCallIncidentSink(client(log, { slowInsertMs: 20 }));
		sink.insert(row);
		sink.update('incident-1', { eventual: { ended_by: 'stream_end' } });
		await sink.flush();
		expect(log).toEqual(['insert incident-1', 'update incident-1 eventual,updated_at']);
	});

	it('logs only the error code of a failed write, never the row', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const sink = new SupabaseLlmCallIncidentSink(client([], { failInsert: true }));
		sink.insert(row);
		await sink.flush();
		expect(warn).toHaveBeenCalledWith('[Agentic Chat] LLM call incident write failed', {
			id: 'incident-1',
			code: '23503'
		});
		expect(JSON.stringify(warn.mock.calls)).not.toContain('secret prompt');
	});

	it('cancels a write at its deadline before the next write for the row starts', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const log: string[] = [];
		const sink = new SupabaseLlmCallIncidentSink(client(log, { hangInsert: true }), {
			timeoutMs: 20
		});
		sink.insert(row);
		sink.update('incident-1', { eventual: { ended_by: 'deadline' } });
		await sink.flush();
		expect(log).toEqual(['insert incident-1 aborted', 'update incident-1 eventual,updated_at']);
		expect(warn).toHaveBeenCalledWith('[Agentic Chat] LLM call incident write failed', {
			id: 'incident-1',
			code: 'timeout'
		});
	});

	it('caps new rows per hour and skips the updates of a dropped row', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const log: string[] = [];
		let now = 0;
		const sink = new SupabaseLlmCallIncidentSink(client(log), {
			maxInsertsPerHour: 1,
			now: () => now
		});
		sink.insert(row);
		sink.insert({ ...row, id: 'incident-2' });
		sink.update('incident-2', { eventual: { ended_by: 'deadline' } });
		await sink.flush();
		now = 3_600_001;
		sink.insert({ ...row, id: 'incident-3' });
		await sink.flush();
		expect(log).toEqual(['insert incident-1', 'insert incident-3']);
	});

	it('drops a write past its memory bound instead of queuing it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const log: string[] = [];
		const sink = new SupabaseLlmCallIncidentSink(client(log, { slowInsertMs: 10 }), {
			maxPendingBytes: 400
		});
		sink.insert(row);
		sink.insert({ ...row, id: 'incident-2' });
		await sink.flush();
		expect(log).toEqual(['insert incident-1']);
	});
});
