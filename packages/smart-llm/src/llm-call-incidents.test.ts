// packages/smart-llm/src/llm-call-incidents.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	classifyCall,
	IncidentBudget,
	incidentStorageFor,
	SmartLlmIncidentRecorder,
	type IncidentWriteClient
} from './llm-call-incidents';
import { OpenRouterClient, type OpenRouterCallObservation } from './openrouter-client';
import { LLMRequestTimeoutError } from './errors';

const USER = '11111111-2222-4333-8444-555555555555';

function fakeClient() {
	const inserts: Array<Record<string, unknown>> = [];
	const updates: Array<{ id: string; values: Record<string, unknown> }> = [];
	const client: IncidentWriteClient = {
		from: () => ({
			insert: (row) => ({
				abortSignal: async () => {
					inserts.push(row);
					return { error: null };
				}
			}),
			update: (values) => ({
				eq: (_column, id) => ({
					abortSignal: async () => {
						updates.push({ id, values });
						return { error: null };
					}
				})
			})
		})
	};
	return { client, inserts, updates };
}

function observation(
	overrides: Partial<OpenRouterCallObservation> = {}
): OpenRouterCallObservation {
	return {
		requestBody: JSON.stringify({
			model: 'm',
			messages: [{ role: 'user', content: 'Brief me.' }]
		}),
		requestHeaders: { Authorization: '[redacted]' },
		startedAt: Date.parse('2026-10-18T12:00:00Z'),
		openedMs: 900,
		endedMs: 1_200,
		httpStatus: 200,
		responseHeaders: { 'content-type': 'application/json' },
		responseText: null,
		outcome: 'ok',
		errorName: null,
		timeoutMs: 60_000,
		response: null,
		eventual: null,
		...overrides
	};
}

const completion = (content: string, finish = 'stop') => ({
	id: 'gen-1',
	model: 'deepseek/deepseek-v4.1-flash',
	provider: 'Together',
	choices: [{ message: { role: 'assistant', content }, finish_reason: finish }],
	usage: { prompt_tokens: 100, completion_tokens: 4000, total_tokens: 4100 }
});

const flush = async () => {
	for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

afterEach(() => vi.useRealTimers());

describe('incident classification', () => {
	it('records failures and empty replies, not healthy or cancelled calls', () => {
		expect(classifyCall(observation({ outcome: 'cancelled' }))).toBeNull();
		expect(classifyCall(observation({ outcome: 'timeout' }))).toEqual({
			kind: 'stall',
			reason: 'timeout'
		});
		expect(classifyCall(observation({ outcome: 'http_error', httpStatus: 429 }))).toEqual({
			kind: 'error',
			reason: 'http_429'
		});
		const ok = completion('{"brief":"ok"}') as never;
		expect(classifyCall(observation({ response: ok }))).toBeNull();
		expect(classifyCall(observation({ response: completion('', 'length') as never }))).toEqual({
			kind: 'error',
			reason: 'empty_reply_length'
		});
		expect(classifyCall(observation({ response: { choices: [] } as never }))).toEqual({
			kind: 'error',
			reason: 'empty_choices'
		});
	});

	it('stores content only for jobs that read BuildOS records alone', () => {
		expect(incidentStorageFor('daily_brief_project_brief')).toBe('full');
		expect(incidentStorageFor('project_loop_drift')).toBe('full');
		expect(incidentStorageFor('consolidation_merge_write')).toBe('full');
		expect(incidentStorageFor('calendar_analysis_part1')).toBe('metadata');
		expect(incidentStorageFor('table_ai_fill')).toBe('metadata');
		expect(incidentStorageFor('agent_run_deep_research_synthesis')).toBe('metadata');
		expect(incidentStorageFor('chat_title_generation')).toBe('metadata');
		expect(incidentStorageFor('other')).toBe('metadata');
		expect(incidentStorageFor('')).toBe('metadata');
		// Chat transcripts are kept only on rows that cascade with the chat.
		expect(incidentStorageFor('profile_signal_extraction')).toBe('metadata');
		expect(incidentStorageFor('chat_checkpoint_thinking_log', USER)).toBe('full');
	});
});

describe('incident recorder', () => {
	const context = {
		operationType: 'daily_brief_project_brief',
		userId: USER,
		projectId: 'not-a-uuid',
		role: 'attempt' as const,
		attempt: 2,
		modelRequested: 'deepseek/deepseek-v4.1-flash'
	};

	it('writes an empty reply with its prompt and reply for a workspace job', async () => {
		const { client, inserts } = fakeClient();
		const recorder = new SmartLlmIncidentRecorder({ client, budget: new IncidentBudget() });
		const body = completion('', 'length');
		recorder
			.observerFor(context)
			.onEnd(observation({ response: body as never, responseText: JSON.stringify(body) }));
		expect(inserts).toHaveLength(0); // never on the caller's path
		await vi.waitFor(() => expect(inserts).toHaveLength(1));
		const row = inserts[0]!;
		expect(row).toMatchObject({
			lane: 'daily_brief_project_brief',
			kind: 'error',
			reason: 'empty_reply_length',
			user_id: USER,
			project_id: null,
			pass_role: 'attempt',
			provider_attempt: 2,
			model_used: 'deepseek/deepseek-v4.1-flash',
			provider: 'Together',
			generation_id: 'gen-1',
			eventual: null
		});
		expect(String(row.request_body)).toContain('Brief me.');
		expect(String(row.request_sha256)).toMatch(/^[0-9a-f]{64}$/);
		expect(String(row.response_body)).toContain('"finish_reason":"length"');
	});

	it('keeps only metadata for a job that can carry outside content', async () => {
		const { client, inserts } = fakeClient();
		const recorder = new SmartLlmIncidentRecorder({ client, budget: new IncidentBudget() });
		recorder.observerFor({ ...context, operationType: 'calendar_analysis_part1' }).onEnd(
			observation({
				outcome: 'http_error',
				httpStatus: 400,
				responseText: JSON.stringify({
					error: {
						code: 400,
						message: 'Bad request',
						metadata: { raw: 'Meeting with Dana' }
					}
				})
			})
		);
		await vi.waitFor(() => expect(inserts).toHaveLength(1));
		const row = inserts[0]!;
		expect(row.request_body).toBe('{}');
		expect(String(row.response_body)).toContain('Bad request');
		expect(String(row.response_body)).not.toContain('Dana');
		expect(row.outcome).toMatchObject({ storage: 'metadata', request_stored: false });
	});

	it('caps inserts per hour', async () => {
		const { client, inserts } = fakeClient();
		const recorder = new SmartLlmIncidentRecorder({ client, budget: new IncidentBudget() });
		const observer = recorder.observerFor(context);
		for (let i = 0; i < 205; i += 1) observer.onEnd(observation({ outcome: 'timeout' }));
		await vi.waitFor(() => expect(inserts).toHaveLength(200));
		await flush();
		expect(inserts).toHaveLength(200);
	});
});

describe('client observer', () => {
	const createClient = (fetchImpl: typeof fetch) =>
		new OpenRouterClient({
			apiKey: 'test',
			apiUrl: 'https://example.test/v1/chat/completions',
			httpReferer: 'https://build-os.com',
			appName: 'test',
			fetchImpl
		});

	it('reports a healthy call once with its exact body', async () => {
		const onEnd = vi.fn();
		const client = createClient(
			vi.fn().mockResolvedValue(new Response(JSON.stringify(completion('hi')))) as never
		);
		await client.callOpenRouter({
			model: 'm',
			messages: [{ role: 'user', content: 'Hello' }],
			observe: { onEnd }
		});
		expect(onEnd).toHaveBeenCalledTimes(1);
		const seen = onEnd.mock.calls[0]![0] as OpenRouterCallObservation;
		expect(seen.outcome).toBe('ok');
		expect(JSON.parse(seen.requestBody).messages[0].content).toBe('Hello');
		expect(seen.requestHeaders.Authorization).toBe('[redacted]');
		expect(seen.responseText).toContain('"hi"');
	});

	it('leaves a timed-out request running when a drain slot is granted, and reports how it ended', async () => {
		vi.useFakeTimers();
		let finish: (response: Response) => void = () => undefined;
		const fetchImpl = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((resolve, reject) => {
					finish = resolve;
					init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				})
		);
		const release = vi.fn();
		const onEnd = vi.fn();
		const client = createClient(fetchImpl as never);
		const call = client.callOpenRouter({
			model: 'm',
			messages: [{ role: 'user', content: 'Slow one' }],
			timeoutMs: 1_000,
			observe: { onEnd, acquireDrain: () => release, drainMs: 60_000 }
		});
		const settled = call.catch((error) => error);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(await settled).toBeInstanceOf(LLMRequestTimeoutError);
		const seen = onEnd.mock.calls[0]![0] as OpenRouterCallObservation;
		expect(seen.outcome).toBe('timeout');
		expect(seen.eventual).not.toBeNull();

		await vi.advanceTimersByTimeAsync(9_000);
		finish(new Response(JSON.stringify(completion('late answer'))));
		const ended = await seen.eventual!;
		expect(ended).toMatchObject({ endedBy: 'stream_end', httpStatus: 200 });
		expect(ended.totalMs).toBeGreaterThanOrEqual(10_000);
		expect(ended.responseText).toContain('late answer');
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('aborts a timed-out request when no drain slot is granted', async () => {
		vi.useFakeTimers();
		let aborted = false;
		const fetchImpl = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => {
						aborted = true;
						reject(init.signal?.reason);
					});
				})
		);
		const onEnd = vi.fn();
		const client = createClient(fetchImpl as never);
		const settled = client
			.callOpenRouter({
				model: 'm',
				messages: [{ role: 'user', content: 'x' }],
				timeoutMs: 500,
				observe: { onEnd, acquireDrain: () => null }
			})
			.catch((error) => error);
		await vi.advanceTimersByTimeAsync(500);
		expect(await settled).toBeInstanceOf(LLMRequestTimeoutError);
		expect(aborted).toBe(true);
		expect((onEnd.mock.calls[0]![0] as OpenRouterCallObservation).eventual).toBeNull();
	});

	it('records the drained ending on the incident row', async () => {
		vi.useFakeTimers();
		let finish: (response: Response) => void = () => undefined;
		const fetchImpl = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					finish = resolve;
				})
		);
		const { client: db, inserts, updates } = fakeClient();
		const recorder = new SmartLlmIncidentRecorder({
			client: db,
			drain: true,
			budget: new IncidentBudget()
		});
		const client = createClient(fetchImpl as never);
		const settled = client
			.callOpenRouter({
				model: 'm',
				messages: [{ role: 'user', content: 'Plan my week' }],
				timeoutMs: 1_000,
				observe: recorder.observerFor({
					operationType: 'project_loop_brief',
					role: 'attempt',
					attempt: 1,
					modelRequested: 'm'
				})
			})
			.catch((error) => error);
		await vi.advanceTimersByTimeAsync(1_000);
		await settled;
		// The write hashes with real async crypto, so poll instead of assuming a tick.
		await vi.waitFor(() => expect(inserts).toHaveLength(1));
		expect(inserts[0]).toMatchObject({
			kind: 'stall',
			reason: 'timeout',
			eventual: { status: 'running' }
		});

		await vi.advanceTimersByTimeAsync(20_000);
		finish(new Response(JSON.stringify(completion('Done.'))));
		await vi.advanceTimersByTimeAsync(10);
		await vi.waitFor(() => expect(updates).toHaveLength(1));
		expect(updates[0]!.values).toMatchObject({
			eventual: { ended_by: 'stream_end', completed: true, finish_reason: 'stop' },
			provider: 'Together'
		});
		expect(String(updates[0]!.values.response_body)).toContain('Done.');
	});

	it("counts a caller's own AbortSignal.timeout as a stall", async () => {
		const onEnd = vi.fn();
		const signal = AbortSignal.abort(new DOMException('timed out', 'TimeoutError'));
		const client = createClient(
			vi.fn((_url: string, init: RequestInit) => Promise.reject(init.signal?.reason)) as never
		);
		await expect(
			client.callOpenRouter({
				model: 'm',
				messages: [{ role: 'user', content: 'x' }],
				signal,
				observe: { onEnd }
			})
		).rejects.toMatchObject({ name: 'LLMRequestCancelledError' });
		expect((onEnd.mock.calls[0]![0] as OpenRouterCallObservation).outcome).toBe('timeout');
	});

	it('stops a drained request when the job is cancelled', async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		let transportAborted = false;
		const fetchImpl = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => {
						transportAborted = true;
						reject(init.signal?.reason);
					});
				})
		);
		const release = vi.fn();
		const onEnd = vi.fn();
		const client = createClient(fetchImpl as never);
		const settled = client
			.callOpenRouter({
				model: 'm',
				messages: [{ role: 'user', content: 'x' }],
				timeoutMs: 500,
				signal: controller.signal,
				observe: { onEnd, acquireDrain: () => release, drainMs: 60_000 }
			})
			.catch((error) => error);
		await vi.advanceTimersByTimeAsync(500);
		expect(await settled).toBeInstanceOf(LLMRequestTimeoutError);
		expect(transportAborted).toBe(false);
		controller.abort(new Error('job cancelled'));
		const ended = await (onEnd.mock.calls[0]![0] as OpenRouterCallObservation).eventual!;
		expect(transportAborted).toBe(true);
		expect(ended.endedBy).toBe('cancelled');
		expect(release).toHaveBeenCalledTimes(1);
	});
});
