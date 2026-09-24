// packages/smart-llm/src/jev-client.ts
//
// Generic client for the TypeSafe Jev decision model on OpenRouter's alpha
// decisions route. Frozen interface: docs/architecture/jev-freshness-radar-v1-plan.md §3.
//
// Answer shapes (verified live 2026-09-18, fixture
// fixtures/jev-decisions-live-smoke-2026-09-18.json):
//   noul   { type:'noul', noul }
//   choice { type:'choice', choice, probabilities: {<option>: p}, confidence }
//   score  { type:'score', score, legend: {'0': criterion, ...},
//            probabilities: {'0': p, ..., '<n-1>': p}, confidence }
// A Score is the probability-weighted mean of 0-based level indexes, so it lies
// in [0, levels - 1]. The legend echoes the criteria and is not returned in the
// parsed answer (it stays in rawResponse).
//
// decide() never throws. Every failure is a fail-closed result with a receipt.

import { OPENROUTER_PRIVATE_PROVIDER } from './openrouter-request';
import type { UsageLogger } from './usage-logger';

export const JEV_DECISIONS_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';
export const JEV_DEFAULT_MODEL = 'typesafe/jev-1.13';
/** Provider object for every Jev decisions body: one pinned endpoint, private policy. */
export const JEV_PROVIDER_POLICY = Object.freeze({
	allow_fallbacks: false as const,
	...OPENROUTER_PRIVATE_PROVIDER
});

export type JevInstructions = string | { question: string; rules?: readonly string[] };
export type JevNoulQuestion = { type: 'noul'; instructions: JevInstructions };
/** <=255 options */
export type JevChoiceQuestion<O extends string = string> = {
	type: 'choice';
	instructions: JevInstructions;
	criteria: Readonly<Record<O, string | null>>;
};
/** 2..10 levels, low -> high */
export type JevScoreQuestion = {
	type: 'score';
	instructions: JevInstructions;
	criteria: readonly string[];
};
export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;
export type JevQuestionSet = Readonly<Record<string, JevQuestion>>;
export type JevNoulAnswer = { type: 'noul'; noul: number };
export type JevChoiceAnswer<O extends string = string> = {
	type: 'choice';
	choice: O;
	probabilities: Readonly<Record<O, number>>;
	confidence: number;
};
export type JevScoreAnswer = {
	type: 'score';
	score: number;
	confidence: number;
	probabilities: Readonly<Record<string, number>>;
};
export type JevAnswerFor<Q> = Q extends JevNoulQuestion
	? JevNoulAnswer
	: Q extends JevChoiceQuestion<infer O>
		? JevChoiceAnswer<O>
		: JevScoreAnswer;
export type JevAnswers<Qs extends JevQuestionSet> = {
	readonly [K in keyof Qs]: JevAnswerFor<Qs[K]>;
};
export type JevErrorCode =
	| 'jev_invalid_question'
	| 'jev_input_limit'
	| 'jev_timeout'
	| 'jev_aborted'
	| 'jev_http_429'
	| 'jev_http_4xx'
	| 'jev_http_5xx'
	| 'jev_invalid_response'
	| 'jev_answer_set'
	| 'jev_invalid_answer'
	| 'jev_request_failed';
export type JevDecisionReceipt = {
	modelRequested: string;
	modelUsed: string | null;
	requestId: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	costUsd: number | null;
	durationMs: number;
	requestBytes: number;
	questionCount: number;
	attempts: number;
	/** A hedge request was sent because the first was slow or failed fast. */
	hedged?: boolean;
};
export type JevDecisionResult<Qs extends JevQuestionSet> =
	/** raw kept for ledger and backtest cache */
	| { ok: true; answers: JevAnswers<Qs>; receipt: JevDecisionReceipt; rawResponse: unknown }
	| { ok: false; error: JevErrorCode; receipt: JevDecisionReceipt };
export type JevUsageContext = {
	operationType: string;
	userId?: string;
	projectId?: string;
	chatSessionId?: string;
	metadata?: Record<string, unknown>;
};
export interface JevClientOptions {
	apiKey: string;
	endpoint?: string;
	model?: string;
	fetchImpl?: typeof fetch;
	/** Whole decide() deadline, including the optional retry. Default 5000. */
	timeoutMs?: number;
	/** Serialized request limit. Default 96_000 bytes. */
	maxRequestBytes?: number;
	/** Retry once on 429/5xx after 400–800 ms of jitter. Default true. */
	retryOnce?: boolean;
	/**
	 * Tail-latency hedge: if no answer after this many ms, send the same request again and take
	 * the first answer (the other is aborted). A request that fails fast is hedged at once.
	 * Jev latency is bimodal and slow calls are independent (about 26% land in a 2-3 s lane;
	 * docs/research/jev-global-context-2026-09-23), so one hedge rescues most of them.
	 * Off by default. Pair with retryOnce: false.
	 */
	hedgeAfterMs?: number;
	title?: string;
	usage?: UsageLogger;
}
/** Never throws; fail-closed result. */
export interface JevDecider {
	decide<Qs extends JevQuestionSet>(
		req: { state: unknown; questions: Qs },
		opts?: { signal?: AbortSignal; timeoutMs?: number; usage?: JevUsageContext }
	): Promise<JevDecisionResult<Qs>>;
}

export const JEV_DEFAULT_TIMEOUT_MS = 5_000;
export const JEV_DEFAULT_MAX_REQUEST_BYTES = 96_000;
export const JEV_MAX_CHOICE_OPTIONS = 255;
export const JEV_MIN_CHOICE_OPTIONS = 2;
export const JEV_MIN_SCORE_LEVELS = 2;
export const JEV_MAX_SCORE_LEVELS = 10;

const RETRY_JITTER_MIN_MS = 400;
const RETRY_JITTER_SPAN_MS = 400;
/** Do not start a retry that could not finish meaningfully before the deadline. */
const MIN_RETRY_BUDGET_MS = 250;
const USAGE_LOG_TIMEOUT_MS = 5_000;

type JevParseError = 'jev_invalid_response' | 'jev_answer_set' | 'jev_invalid_answer';
type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: null;
}

function isUnitInterval(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function nonnegativeOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sameKeySet(actual: readonly string[], expected: readonly string[]): boolean {
	if (actual.length !== expected.length) return false;
	const expectedSet = new Set(expected);
	return actual.every((key) => expectedSet.has(key));
}

function validInstructions(value: unknown): boolean {
	if (typeof value === 'string') return value.trim().length > 0;
	const record = asRecord(value);
	if (!record || typeof record.question !== 'string' || !record.question.trim()) return false;
	if (record.rules === undefined) return true;
	return Array.isArray(record.rules) && record.rules.every((rule) => typeof rule === 'string');
}

/** Structural validation of a question set before any network call. */
export function validateJevQuestions(questions: unknown): boolean {
	const record = asRecord(questions);
	if (!record) return false;
	const entries = Object.entries(record);
	if (entries.length === 0) return false;
	for (const [name, question] of entries) {
		const q = asRecord(question);
		if (!name.trim() || !q || !validInstructions(q.instructions)) return false;
		if (q.type === 'noul') continue;
		if (q.type === 'choice') {
			const criteria = asRecord(q.criteria);
			if (!criteria) return false;
			const options = Object.entries(criteria);
			if (
				options.length < JEV_MIN_CHOICE_OPTIONS ||
				options.length > JEV_MAX_CHOICE_OPTIONS
			) {
				return false;
			}
			if (
				options.some(
					([option, description]) =>
						!option.trim() || (description !== null && typeof description !== 'string')
				)
			) {
				return false;
			}
			continue;
		}
		if (q.type === 'score') {
			if (!Array.isArray(q.criteria)) return false;
			const levels = q.criteria.length;
			if (levels < JEV_MIN_SCORE_LEVELS || levels > JEV_MAX_SCORE_LEVELS) return false;
			if (q.criteria.some((level) => typeof level !== 'string' || !level.trim()))
				return false;
			continue;
		}
		return false;
	}
	return true;
}

function parseProbabilities(
	value: unknown,
	expectedKeys: readonly string[]
): Record<string, number> | null {
	const record = asRecord(value);
	if (!record || !sameKeySet(Object.keys(record), expectedKeys)) return null;
	const probabilities: Record<string, number> = {};
	for (const key of expectedKeys) {
		const probability = record[key];
		if (!isUnitInterval(probability)) return null;
		probabilities[key] = probability;
	}
	return probabilities;
}

function parseAnswer(question: JevQuestion, value: unknown): UnknownRecord | null {
	const answer = asRecord(value);
	if (!answer || answer.type !== question.type) return null;
	if (question.type === 'noul') {
		return isUnitInterval(answer.noul) ? { type: 'noul', noul: answer.noul } : null;
	}
	if (question.type === 'choice') {
		const options = Object.keys(question.criteria);
		if (typeof answer.choice !== 'string' || !options.includes(answer.choice)) return null;
		if (!isUnitInterval(answer.confidence)) return null;
		const probabilities = parseProbabilities(answer.probabilities, options);
		if (!probabilities) return null;
		return {
			type: 'choice',
			choice: answer.choice,
			probabilities,
			confidence: answer.confidence
		};
	}
	const levels = question.criteria.length;
	const score = answer.score;
	if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > levels - 1) {
		return null;
	}
	if (!isUnitInterval(answer.confidence)) return null;
	const levelKeys = Array.from({ length: levels }, (_, index) => String(index));
	const probabilities = parseProbabilities(answer.probabilities, levelKeys);
	if (!probabilities) return null;
	return { type: 'score', score, confidence: answer.confidence, probabilities };
}

/**
 * Validate a decisions response body against the question set. The answer set
 * must match the question names exactly; every probability must lie in [0, 1];
 * a Choice must pick a listed option and cover every option; a Score must lie in
 * [0, levels - 1] with one probability per 0-based level.
 */
export function parseJevAnswers<Qs extends JevQuestionSet>(
	questions: Qs,
	body: unknown
): { ok: true; answers: JevAnswers<Qs> } | { ok: false; error: JevParseError } {
	const record = asRecord(body);
	const answers = record ? asRecord(record.answers) : null;
	if (!answers) return { ok: false, error: 'jev_invalid_response' };
	const names = Object.keys(questions);
	if (!sameKeySet(Object.keys(answers), names)) return { ok: false, error: 'jev_answer_set' };
	const parsed: Record<string, UnknownRecord> = {};
	for (const name of names) {
		const answer = parseAnswer(questions[name] as JevQuestion, answers[name]);
		if (!answer) return { ok: false, error: 'jev_invalid_answer' };
		parsed[name] = answer;
	}
	return { ok: true, answers: parsed as unknown as JevAnswers<Qs> };
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal.removeEventListener('abort', done);
			resolve();
		}
		signal.addEventListener('abort', done, { once: true });
	});
}

function httpErrorCode(status: number): JevErrorCode {
	if (status === 429) return 'jev_http_429';
	if (status >= 500) return 'jev_http_5xx';
	return 'jev_http_4xx';
}

export class JevClient implements JevDecider {
	private readonly endpoint: string;
	private readonly model: string;
	private readonly timeoutMs: number;
	private readonly maxRequestBytes: number;
	private readonly retryOnce: boolean;

	constructor(private readonly options: JevClientOptions) {
		this.endpoint = options.endpoint ?? JEV_DECISIONS_ENDPOINT;
		this.model = options.model ?? JEV_DEFAULT_MODEL;
		this.timeoutMs = options.timeoutMs ?? JEV_DEFAULT_TIMEOUT_MS;
		this.maxRequestBytes = options.maxRequestBytes ?? JEV_DEFAULT_MAX_REQUEST_BYTES;
		this.retryOnce = options.retryOnce ?? true;
	}

	decide = async <Qs extends JevQuestionSet>(
		req: { state: unknown; questions: Qs },
		opts: { signal?: AbortSignal; timeoutMs?: number; usage?: JevUsageContext } = {}
	): Promise<JevDecisionResult<Qs>> => {
		const started = Date.now();
		const receipt: JevDecisionReceipt = {
			modelRequested: this.model,
			modelUsed: null,
			requestId: null,
			inputTokens: null,
			outputTokens: null,
			costUsd: null,
			durationMs: 0,
			requestBytes: 0,
			questionCount: 0,
			attempts: 0
		};
		const fail = (error: JevErrorCode): JevDecisionResult<Qs> => {
			receipt.durationMs = Date.now() - started;
			return { ok: false, error, receipt };
		};

		try {
			if (opts.signal?.aborted) return fail('jev_aborted');
			if (!validateJevQuestions(req?.questions)) return fail('jev_invalid_question');
			receipt.questionCount = Object.keys(req.questions).length;

			let serialized: string;
			try {
				serialized = JSON.stringify({
					model: this.model,
					state: req.state ?? {},
					questions: req.questions,
					provider: JEV_PROVIDER_POLICY
				});
			} catch {
				return fail('jev_invalid_question');
			}
			receipt.requestBytes = new TextEncoder().encode(serialized).byteLength;
			if (receipt.requestBytes > this.maxRequestBytes) return fail('jev_input_limit');

			const outcome = await this.sendHedged(serialized, receipt, started, opts);
			if (!outcome.ok) return fail(outcome.error);

			const body = outcome.body;
			const bodyRecord = asRecord(body);
			if (bodyRecord) {
				const usage = asRecord(bodyRecord.usage);
				receipt.inputTokens = nonnegativeOrNull(usage?.input_tokens);
				receipt.outputTokens = nonnegativeOrNull(usage?.output_tokens);
				receipt.costUsd = nonnegativeOrNull(usage?.cost);
				receipt.modelUsed = typeof bodyRecord.model === 'string' ? bodyRecord.model : null;
				receipt.requestId = typeof bodyRecord.id === 'string' ? bodyRecord.id : null;
			}
			const parsed = parseJevAnswers(req.questions, body);
			receipt.durationMs = Date.now() - started;
			// A body was returned, so the call was billed: log it either way.
			this.logUsage(receipt, started, opts.usage, parsed.ok ? null : parsed.error);
			if (!parsed.ok) return { ok: false, error: parsed.error, receipt };
			return { ok: true, answers: parsed.answers, receipt, rawResponse: body };
		} catch {
			return fail('jev_request_failed');
		}
	};

	/** One request, or two racing ones when `hedgeAfterMs` is set; the first success wins. */
	private sendHedged(
		serialized: string,
		receipt: JevDecisionReceipt,
		started: number,
		opts: { signal?: AbortSignal; timeoutMs?: number }
	): Promise<{ ok: true; body: unknown } | { ok: false; error: JevErrorCode }> {
		const hedgeAfterMs = this.options.hedgeAfterMs;
		if (!hedgeAfterMs || hedgeAfterMs <= 0)
			return this.send(serialized, receipt, started, opts);
		const deadline = started + (opts.timeoutMs ?? this.timeoutMs);
		type Outcome = Awaited<ReturnType<JevClient['send']>>;
		return new Promise<Outcome>((resolve) => {
			const lanes: AbortController[] = [];
			let pending = 0;
			let settled = false;
			let hedgeTimer: ReturnType<typeof setTimeout> | undefined;
			const finish = (outcome: Outcome) => {
				if (settled) return;
				settled = true;
				clearTimeout(hedgeTimer);
				receipt.attempts = lanes.length;
				for (const lane of lanes) lane.abort();
				resolve(outcome);
			};
			const canHedge = () =>
				lanes.length === 1 &&
				!opts.signal?.aborted &&
				deadline - Date.now() > MIN_RETRY_BUDGET_MS;
			const launch = () => {
				const lane = new AbortController();
				lanes.push(lane);
				if (lanes.length > 1) receipt.hedged = true;
				pending += 1;
				const signal = opts.signal
					? AbortSignal.any([opts.signal, lane.signal])
					: lane.signal;
				this.send(serialized, { ...receipt }, started, { ...opts, signal }).then(
					(outcome) => {
						pending -= 1;
						if (outcome.ok) return finish(outcome);
						// A fast retryable failure starts the hedge now instead of waiting.
						if (outcome.error !== 'jev_http_4xx' && canHedge()) {
							clearTimeout(hedgeTimer);
							return launch();
						}
						if (pending === 0) finish(outcome);
					},
					() => {
						pending -= 1;
						if (pending === 0) finish({ ok: false, error: 'jev_request_failed' });
					}
				);
			};
			launch();
			hedgeTimer = setTimeout(() => {
				if (!settled && canHedge()) launch();
			}, hedgeAfterMs);
		});
	}

	private async send(
		serialized: string,
		receipt: JevDecisionReceipt,
		started: number,
		opts: { signal?: AbortSignal; timeoutMs?: number }
	): Promise<{ ok: true; body: unknown } | { ok: false; error: JevErrorCode }> {
		const deadline = started + (opts.timeoutMs ?? this.timeoutMs);
		const controller = new AbortController();
		const onParentAbort = () => controller.abort();
		opts.signal?.addEventListener('abort', onParentAbort, { once: true });
		let timedOut = false;
		const timer = setTimeout(
			() => {
				timedOut = true;
				controller.abort();
			},
			Math.max(0, deadline - Date.now())
		);
		const abortedError = (): JevErrorCode | null =>
			opts.signal?.aborted ? 'jev_aborted' : timedOut ? 'jev_timeout' : null;

		try {
			const maxAttempts = this.retryOnce ? 2 : 1;
			let lastError: JevErrorCode = 'jev_request_failed';
			for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
				if (attempt > 1) {
					const jitter =
						RETRY_JITTER_MIN_MS + Math.floor(Math.random() * RETRY_JITTER_SPAN_MS);
					if (deadline - Date.now() < jitter + MIN_RETRY_BUDGET_MS)
						return { ok: false, error: lastError };
					await sleep(jitter, controller.signal);
					const aborted = abortedError();
					if (aborted) return { ok: false, error: aborted };
				}
				receipt.attempts = attempt;
				let response: Response;
				try {
					response = await (this.options.fetchImpl ?? fetch)(this.endpoint, {
						method: 'POST',
						signal: controller.signal,
						redirect: 'error',
						headers: {
							Authorization: `Bearer ${this.options.apiKey}`,
							'Content-Type': 'application/json',
							'HTTP-Referer': 'https://build-os.com',
							'X-OpenRouter-Title': this.options.title ?? 'BuildOS Decisions'
						},
						body: serialized
					});
				} catch {
					return { ok: false, error: abortedError() ?? 'jev_request_failed' };
				}
				if (!response.ok) {
					lastError = httpErrorCode(response.status);
					// Release the connection; the error body is never surfaced.
					try {
						await response.body?.cancel();
					} catch {
						/* ignore */
					}
					if (lastError === 'jev_http_4xx') return { ok: false, error: lastError };
					continue;
				}
				try {
					return { ok: true, body: await response.json() };
				} catch {
					return { ok: false, error: abortedError() ?? 'jev_invalid_response' };
				}
			}
			return { ok: false, error: lastError };
		} finally {
			clearTimeout(timer);
			opts.signal?.removeEventListener('abort', onParentAbort);
		}
	}

	private logUsage(
		receipt: JevDecisionReceipt,
		started: number,
		context: JevUsageContext | undefined,
		error: JevParseError | null
	): void {
		const usage = this.options.usage;
		if (!usage || !context) return;
		const inputTokens = receipt.inputTokens ?? 0;
		const outputTokens = receipt.outputTokens ?? 0;
		const cost = receipt.costUsd ?? 0;
		try {
			usage
				.logUsageToDatabase(
					{
						userId: context.userId,
						operationType: context.operationType,
						modelRequested: receipt.modelRequested,
						modelUsed: receipt.modelUsed ?? receipt.modelRequested,
						provider: 'TypeSafe',
						promptTokens: inputTokens,
						completionTokens: outputTokens,
						totalTokens: inputTokens + outputTokens,
						inputCost: cost,
						outputCost: 0,
						totalCost: cost,
						openrouterUsageCost: receipt.costUsd ?? undefined,
						openrouterRequestId: receipt.requestId ?? undefined,
						responseTimeMs: receipt.durationMs,
						requestStartedAt: new Date(started),
						requestCompletedAt: new Date(started + receipt.durationMs),
						status: error ? 'invalid_response' : 'success',
						errorMessage: error ?? undefined,
						streaming: false,
						projectId: context.projectId,
						chatSessionId: context.chatSessionId,
						metadata: {
							...(context.metadata ?? {}),
							jev: {
								questionCount: receipt.questionCount,
								requestBytes: receipt.requestBytes,
								attempts: receipt.attempts,
								hedged: receipt.hedged === true,
								estimatedUsage: receipt.inputTokens === null
							}
						}
					},
					AbortSignal.timeout(USAGE_LOG_TIMEOUT_MS)
				)
				.catch(() => undefined);
		} catch {
			/* Usage accounting never changes a decision. */
		}
	}
}
