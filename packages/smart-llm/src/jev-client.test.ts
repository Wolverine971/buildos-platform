// packages/smart-llm/src/jev-client.test.ts
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	JEV_DECISIONS_ENDPOINT,
	JEV_DEFAULT_MODEL,
	JevClient,
	parseJevAnswers,
	type JevQuestionSet
} from './jev-client';
import type { UsageLogParams, UsageLogger } from './usage-logger';

type SmokeFixture = {
	request: { state: unknown; questions: JevQuestionSet };
	response: Record<string, unknown>;
};

const liveSmoke = JSON.parse(
	readFileSync(
		new URL('./fixtures/jev-decisions-live-smoke-2026-09-18.json', import.meta.url),
		'utf8'
	)
) as SmokeFixture;
const repoChoiceSmoke = JSON.parse(
	readFileSync(
		new URL(
			'../../../docs/research/jev-braindump-orchestration-2026-09-18/smoke.json',
			import.meta.url
		),
		'utf8'
	)
) as SmokeFixture;

const QUESTIONS = liveSmoke.request.questions;
const STATE = liveSmoke.request.state;

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function usageRecorder() {
	const calls: UsageLogParams[] = [];
	const usage: UsageLogger = {
		logUsageToDatabase: vi.fn(async (params: UsageLogParams) => {
			calls.push(params);
		})
	};
	return { usage, calls };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('JevClient request', () => {
	it('posts the pinned model, questions and no-fallback provider settings', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse(liveSmoke.response));
		const client = new JevClient({
			apiKey: 'test-key',
			fetchImpl,
			title: 'BuildOS Freshness Radar'
		});

		const result = await client.decide({ state: STATE, questions: QUESTIONS });

		expect(result.ok).toBe(true);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(JEV_DECISIONS_ENDPOINT);
		expect(init.method).toBe('POST');
		expect(init.redirect).toBe('error');
		expect(init.headers).toMatchObject({
			Authorization: 'Bearer test-key',
			'Content-Type': 'application/json',
			'HTTP-Referer': 'https://build-os.com',
			'X-OpenRouter-Title': 'BuildOS Freshness Radar'
		});
		const body = JSON.parse(String(init.body));
		expect(body).toEqual({
			model: JEV_DEFAULT_MODEL,
			state: STATE,
			questions: QUESTIONS,
			provider: { allow_fallbacks: false, data_collection: 'deny' }
		});
		expect(result.receipt.requestBytes).toBe(
			new TextEncoder().encode(String(init.body)).byteLength
		);
		expect(result.receipt.questionCount).toBe(4);
	});
});

describe('parseJevAnswers', () => {
	it('parses the live Noul, Choice and Score answers', () => {
		const parsed = parseJevAnswers(QUESTIONS, liveSmoke.response);
		expect(parsed).toEqual({
			ok: true,
			answers: {
				status_news: { type: 'noul', noul: 0.96 },
				stale_0: { type: 'noul', noul: 0.97 },
				change_0: {
					type: 'choice',
					choice: 'mark_done',
					probabilities: {
						mark_done: 1,
						mark_in_progress: 0,
						mark_blocked: 0,
						reschedule_due: 0,
						cancel_or_drop: 0,
						rewrite_details: 0,
						no_change_needed: 0,
						unclear: 0
					},
					confidence: 1
				},
				// The live legend is dropped; the 0-based level probabilities remain.
				track_0: {
					type: 'score',
					score: 1.13,
					confidence: 0.74,
					probabilities: { '0': 0.07, '1': 0.74, '2': 0.19, '3': 0 }
				}
			}
		});
	});

	it('parses the repository Choice smoke fixture', () => {
		const parsed = parseJevAnswers(repoChoiceSmoke.request.questions, repoChoiceSmoke.response);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) {
			expect(parsed.answers.next_action).toMatchObject({
				type: 'choice',
				choice: 'search_projects',
				confidence: 1
			});
		}
	});

	it('rejects a non-object body or missing answers', () => {
		expect(parseJevAnswers(QUESTIONS, null)).toEqual({
			ok: false,
			error: 'jev_invalid_response'
		});
		expect(parseJevAnswers(QUESTIONS, { answers: [] })).toEqual({
			ok: false,
			error: 'jev_invalid_response'
		});
	});

	it('rejects a missing or extra answer', () => {
		const missing = clone(liveSmoke.response) as { answers: Record<string, unknown> };
		delete missing.answers.track_0;
		expect(parseJevAnswers(QUESTIONS, missing)).toEqual({ ok: false, error: 'jev_answer_set' });

		const extra = clone(liveSmoke.response) as { answers: Record<string, unknown> };
		extra.answers.surprise = { type: 'noul', noul: 0.5 };
		expect(parseJevAnswers(QUESTIONS, extra)).toEqual({ ok: false, error: 'jev_answer_set' });
	});

	it.each([
		['noul above 1', (a: any) => (a.stale_0.noul = 1.2)],
		['noul not a number', (a: any) => (a.stale_0.noul = '0.9')],
		['wrong answer type', (a: any) => (a.stale_0.type = 'choice')],
		['choice outside criteria', (a: any) => (a.change_0.choice = 'delete_it')],
		['choice probability below 0', (a: any) => (a.change_0.probabilities.mark_done = -0.1)],
		[
			'choice probability missing an option',
			(a: any) => delete a.change_0.probabilities.unclear
		],
		['choice confidence above 1', (a: any) => (a.change_0.confidence = 1.5)],
		['score above the top level', (a: any) => (a.track_0.score = 3.2)],
		['score below 0', (a: any) => (a.track_0.score = -0.1)],
		['score probability out of range', (a: any) => (a.track_0.probabilities['1'] = 1.74)],
		[
			'score probability keyed by label',
			(a: any) => {
				a.track_0.probabilities = { off: 0.1, risk: 0.7, on: 0.2, done: 0 };
			}
		],
		['score confidence missing', (a: any) => delete a.track_0.confidence]
	])('rejects %s', (_label, mutate) => {
		const body = clone(liveSmoke.response) as { answers: Record<string, unknown> };
		mutate(body.answers);
		expect(parseJevAnswers(QUESTIONS, body)).toEqual({
			ok: false,
			error: 'jev_invalid_answer'
		});
	});
});

describe('JevClient question validation', () => {
	const fetchImpl = vi.fn(async () => jsonResponse(liveSmoke.response));
	const client = new JevClient({ apiKey: 'k', fetchImpl });

	it.each([
		['an empty question set', {}],
		[
			'more than 255 choice options',
			{
				pick: {
					type: 'choice',
					instructions: 'Pick one.',
					criteria: Object.fromEntries(
						Array.from({ length: 256 }, (_, i) => [`o${i}`, null])
					)
				}
			}
		],
		[
			'a single choice option',
			{ pick: { type: 'choice', instructions: 'Pick.', criteria: { a: null } } }
		],
		['one score level', { rate: { type: 'score', instructions: 'Rate.', criteria: ['only'] } }],
		[
			'eleven score levels',
			{
				rate: {
					type: 'score',
					instructions: 'Rate.',
					criteria: Array.from({ length: 11 }, (_, i) => `level ${i}`)
				}
			}
		],
		['an unknown question type', { odd: { type: 'rank', instructions: 'Rank.' } }],
		['empty instructions', { q: { type: 'noul', instructions: { question: ' ' } } }]
	])('rejects %s before any request', async (_label, questions) => {
		fetchImpl.mockClear();
		const result = await client.decide({ state: {}, questions: questions as JevQuestionSet });
		expect(result).toMatchObject({ ok: false, error: 'jev_invalid_question' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('accepts exactly 255 options and 2..10 score levels', async () => {
		const questions: JevQuestionSet = {
			pick: {
				type: 'choice',
				instructions: 'Pick one.',
				criteria: Object.fromEntries(Array.from({ length: 255 }, (_, i) => [`o${i}`, null]))
			},
			two: { type: 'score', instructions: 'Rate.', criteria: ['low', 'high'] },
			ten: {
				type: 'score',
				instructions: 'Rate.',
				criteria: Array.from({ length: 10 }, (_, i) => `level ${i}`)
			}
		};
		fetchImpl.mockClear();
		const result = await client.decide({ state: {}, questions });
		// Reaches the network; the canned response does not match these questions.
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ ok: false, error: 'jev_answer_set' });
	});
});

describe('JevClient limits and failures', () => {
	it('refuses a request over maxRequestBytes without calling the network', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse(liveSmoke.response));
		const client = new JevClient({ apiKey: 'k', fetchImpl, maxRequestBytes: 1_000 });
		const result = await client.decide({
			state: { new_information: 'x'.repeat(2_000) },
			questions: QUESTIONS
		});
		expect(result).toMatchObject({ ok: false, error: 'jev_input_limit' });
		expect(result.receipt.requestBytes).toBeGreaterThan(1_000);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('times out a hung request', async () => {
		const fetchImpl = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				})
		);
		const client = new JevClient({ apiKey: 'k', fetchImpl: fetchImpl as typeof fetch });
		const result = await client.decide(
			{ state: STATE, questions: QUESTIONS },
			{ timeoutMs: 25 }
		);
		expect(result).toMatchObject({ ok: false, error: 'jev_timeout' });
		expect(result.receipt.attempts).toBe(1);
	});

	it('reports a caller abort, before and during the request', async () => {
		const fetchImpl = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
				})
		);
		const client = new JevClient({ apiKey: 'k', fetchImpl: fetchImpl as typeof fetch });

		const preAborted = new AbortController();
		preAborted.abort();
		const before = await client.decide(
			{ state: STATE, questions: QUESTIONS },
			{ signal: preAborted.signal }
		);
		expect(before).toMatchObject({ ok: false, error: 'jev_aborted' });
		expect(fetchImpl).not.toHaveBeenCalled();

		const midFlight = new AbortController();
		const pending = client.decide(
			{ state: STATE, questions: QUESTIONS },
			{ signal: midFlight.signal }
		);
		setTimeout(() => midFlight.abort(), 5);
		expect(await pending).toMatchObject({ ok: false, error: 'jev_aborted' });
	});

	it('retries a 429 exactly once after jitter', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({ error: 'rate limited' }, 429))
			.mockResolvedValueOnce(jsonResponse(liveSmoke.response));
		const client = new JevClient({ apiKey: 'k', fetchImpl });
		const started = Date.now();
		const result = await client.decide({ state: STATE, questions: QUESTIONS });
		expect(result.ok).toBe(true);
		expect(result.receipt.attempts).toBe(2);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(Date.now() - started).toBeGreaterThanOrEqual(390);
	});

	it('stops after the single retry and reports the HTTP class', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0);
		const fetchImpl = vi.fn(async () => jsonResponse({ error: 'overloaded' }, 503));
		const client = new JevClient({ apiKey: 'k', fetchImpl });
		const result = await client.decide({ state: STATE, questions: QUESTIONS });
		expect(result).toMatchObject({ ok: false, error: 'jev_http_5xx' });
		expect(result.receipt.attempts).toBe(2);
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('does not retry a 4xx, a 429 with retryOnce off, or a 429 without deadline budget', async () => {
		const badRequest = vi.fn(async () => jsonResponse({ error: 'bad' }, 400));
		const a = await new JevClient({ apiKey: 'k', fetchImpl: badRequest }).decide({
			state: STATE,
			questions: QUESTIONS
		});
		expect(a).toMatchObject({ ok: false, error: 'jev_http_4xx' });
		expect(badRequest).toHaveBeenCalledTimes(1);

		const limited = vi.fn(async () => jsonResponse({ error: 'rate' }, 429));
		const b = await new JevClient({ apiKey: 'k', fetchImpl: limited, retryOnce: false }).decide(
			{
				state: STATE,
				questions: QUESTIONS
			}
		);
		expect(b).toMatchObject({ ok: false, error: 'jev_http_429' });
		expect(limited).toHaveBeenCalledTimes(1);

		limited.mockClear();
		const c = await new JevClient({ apiKey: 'k', fetchImpl: limited }).decide(
			{ state: STATE, questions: QUESTIONS },
			{ timeoutMs: 300 }
		);
		expect(c).toMatchObject({ ok: false, error: 'jev_http_429' });
		expect(limited).toHaveBeenCalledTimes(1);
	});

	it('never throws: network errors, bad JSON and non-object bodies fail closed', async () => {
		const thrower = vi.fn(() => {
			throw new TypeError('socket hang up');
		});
		expect(
			await new JevClient({
				apiKey: 'k',
				fetchImpl: thrower as unknown as typeof fetch
			}).decide({
				state: STATE,
				questions: QUESTIONS
			})
		).toMatchObject({ ok: false, error: 'jev_request_failed' });

		const badJson = vi.fn(async () => new Response('not json', { status: 200 }));
		expect(
			await new JevClient({ apiKey: 'k', fetchImpl: badJson }).decide({
				state: STATE,
				questions: QUESTIONS
			})
		).toMatchObject({ ok: false, error: 'jev_invalid_response' });

		const arrayBody = vi.fn(async () => jsonResponse([1, 2, 3]));
		expect(
			await new JevClient({ apiKey: 'k', fetchImpl: arrayBody }).decide({
				state: STATE,
				questions: QUESTIONS
			})
		).toMatchObject({ ok: false, error: 'jev_invalid_response' });
	});
});

describe('JevClient receipt and usage logging', () => {
	it('fills the receipt and logs one TypeSafe usage row on success', async () => {
		const { usage, calls } = usageRecorder();
		const fetchImpl = vi.fn(async () => jsonResponse(liveSmoke.response));
		const client = new JevClient({ apiKey: 'k', fetchImpl, usage });
		const result = await client.decide(
			{ state: STATE, questions: QUESTIONS },
			{
				usage: {
					operationType: 'freshness_radar_decisions',
					userId: '00000000-0000-4000-8000-000000000001',
					projectId: '00000000-0000-4000-8000-000000000002',
					chatSessionId: '00000000-0000-4000-8000-000000000003',
					metadata: { scanId: 'scan-1', request: 'R1' }
				}
			}
		);
		expect(result.ok).toBe(true);
		expect(result.receipt).toMatchObject({
			modelRequested: 'typesafe/jev-1.13',
			modelUsed: 'typesafe/jev-1.13-20260917',
			requestId: 'gen-dec-REDACTED',
			inputTokens: 1366,
			outputTokens: 143,
			costUsd: 0.000057372,
			attempts: 1,
			questionCount: 4
		});
		if (result.ok) expect(result.rawResponse).toEqual(liveSmoke.response);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			operationType: 'freshness_radar_decisions',
			provider: 'TypeSafe',
			userId: '00000000-0000-4000-8000-000000000001',
			projectId: '00000000-0000-4000-8000-000000000002',
			chatSessionId: '00000000-0000-4000-8000-000000000003',
			modelRequested: 'typesafe/jev-1.13',
			modelUsed: 'typesafe/jev-1.13-20260917',
			promptTokens: 1366,
			completionTokens: 143,
			totalTokens: 1509,
			totalCost: 0.000057372,
			inputCost: 0.000057372,
			outputCost: 0,
			openrouterUsageCost: 0.000057372,
			openrouterRequestId: 'gen-dec-REDACTED',
			status: 'success',
			streaming: false,
			metadata: {
				scanId: 'scan-1',
				request: 'R1',
				jev: { questionCount: 4, attempts: 1, estimatedUsage: false }
			}
		});
	});

	it('logs a billed but invalid response as invalid_response and returns the failure', async () => {
		const { usage, calls } = usageRecorder();
		const body = clone(liveSmoke.response) as { answers: Record<string, any> };
		body.answers.track_0.score = 9;
		const client = new JevClient({
			apiKey: 'k',
			fetchImpl: vi.fn(async () => jsonResponse(body)),
			usage
		});
		const result = await client.decide(
			{ state: STATE, questions: QUESTIONS },
			{ usage: { operationType: 'freshness_radar_decisions', userId: 'u' } }
		);
		expect(result).toMatchObject({ ok: false, error: 'jev_invalid_answer' });
		expect(result.receipt.costUsd).toBe(0.000057372);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			status: 'invalid_response',
			errorMessage: 'jev_invalid_answer'
		});
	});

	it('does not log without a usage context, and a failing logger never changes the decision', async () => {
		const { usage, calls } = usageRecorder();
		const fetchImpl = vi.fn(async () => jsonResponse(liveSmoke.response));
		await new JevClient({ apiKey: 'k', fetchImpl, usage }).decide({
			state: STATE,
			questions: QUESTIONS
		});
		expect(calls).toHaveLength(0);

		const broken: UsageLogger = {
			logUsageToDatabase: vi.fn(async () => {
				throw new Error('db down');
			})
		};
		const result = await new JevClient({ apiKey: 'k', fetchImpl, usage: broken }).decide(
			{ state: STATE, questions: QUESTIONS },
			{ usage: { operationType: 'freshness_radar_decisions', userId: 'u' } }
		);
		expect(result.ok).toBe(true);
		expect(broken.logUsageToDatabase).toHaveBeenCalledTimes(1);
	});
});
