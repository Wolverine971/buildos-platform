// apps/worker/src/workers/agentic-chat/provider/openrouter/call-capture.ts
//
// Full record of a model request that stalls or fails (DJ, 2026-10-18), kept so
// it can be studied later: the exact body we sent, the model and provider, every
// response byte with its arrival time, the error body, how the attempt ended,
// and, for a stall, how the request finished when left running in the
// background. Rows land in `llm_call_incidents` (migration 20261018150000).
//
// Off the turn's path by construction. The recorder reads its own branch of
// the response stream, nothing here is awaited by the turn, and a healthy call
// is dropped from memory when it ends, without a write.
import { createHash, randomUUID } from 'node:crypto';
import type { JsonObject } from '@buildos/shared-types';
import {
	AgenticChatFirstProgressStallError,
	AgenticChatProviderHedgeLostError,
	AgenticChatSlowStreamError
} from './errors';
import {
	type StoredIncidentRequestV1,
	minimalErrorBody,
	projectIncidentRequestBody
} from './incident-redaction';
import { readBoundedResponseText } from './retry';
import { AgenticChatReviewerStallError } from './watchdog';

export const LLM_CALL_INCIDENT_LIMITS = Object.freeze({
	/** Response bytes kept per call; the rest are only counted. */
	responseBytes: 1_048_576,
	/** Byte-arrival samples per call; past this the last sample keeps moving. */
	samples: 2_000,
	events: 200,
	/** A stalled request left running is ended this long after it stalled. */
	drainMs: 120_000,
	maxConcurrentDrains: 3,
	maxDrainsPerHour: 30,
	/** OpenRouter's generation record lags the stream; look it up after this. */
	generationStatsDelayMs: 10_000,
	generationStatsRetryMs: 30_000,
	generationStatsTimeoutMs: 10_000,
	/** How long the recorder may take to see the last bytes before the row is written. */
	recorderSettleMs: 250,
	/** Under the table's 4 MiB check. */
	requestBytes: 4_000_000,
	errorBodyBytes: 64 * 1024
});

type Limits = { -readonly [Key in keyof typeof LLM_CALL_INCIDENT_LIMITS]: number };

export type LlmCallIncidentRowV1 = {
	id: string;
	lane: string;
	user_id: string | null;
	session_id: string | null;
	turn_run_id: string | null;
	project_id: string | null;
	usage_log_id: string | null;
	kind: 'stall' | 'error';
	reason: string;
	pass_role: string | null;
	logical_provider_round: number | null;
	provider_attempt: number | null;
	route_id: string | null;
	model_requested: string;
	model_used: string | null;
	provider: string | null;
	http_status: number | null;
	generation_id: string | null;
	started_at: string;
	ended_at: string | null;
	duration_ms: number | null;
	request_body: string;
	request_sha256: string;
	request_headers: JsonObject;
	response_headers: JsonObject | null;
	response_body: string | null;
	response_truncated: boolean;
	timeline: JsonObject;
	outcome: JsonObject;
	eventual: JsonObject | null;
	generation_stats: JsonObject | null;
};

export type LlmCallIncidentPatchV1 = Partial<Omit<LlmCallIncidentRowV1, 'id'>>;

/** Fire-and-forget writes; an update always follows its own row's insert. */
export type LlmCallIncidentSinkV1 = {
	insert(row: LlmCallIncidentRowV1): void;
	update(id: string, patch: LlmCallIncidentPatchV1): void;
};

export type CallCaptureSettings = {
	sink: LlmCallIncidentSinkV1;
	/** `llm_call_incidents.lane`; the usage log's operation type. */
	lane: string;
	/** AGENTIC_CHAT_PROVIDER_INCIDENT_DRAIN: leave a stalled request running to see how it ends. */
	drain: boolean;
	fetchImpl: typeof fetch;
	drainBudget?: DrainBudget;
	now?: () => number;
	limits?: Partial<Limits>;
};

export type CallCaptureIdentity = {
	userId: string | null;
	sessionId: string | null;
	turnRunId: string | null;
	projectId: string | null;
	usageLogId: string | null;
	passRole: string | null;
	logicalProviderRound: number | null;
	providerAttempt: number | null;
	routeId: string;
	routeKind: 'openrouter' | 'openai_compatible';
	baseUrl: string;
	modelRequested: string;
	/** A budgeted workflow request is never left running past its attempt. */
	drainAllowed: boolean;
	/** What the request body cannot show: hedge backup, budget recovery, deadlines. */
	context: JsonObject;
};

/** What the client knew about the stream when the attempt ended. */
export type CallCaptureSnapshot = {
	generationId?: string | null;
	modelUsed?: string | null;
	provider?: string | null;
	stream?: JsonObject;
};

/** Bounds how many stalled requests run on in the background, per process. */
export class DrainBudget {
	private running = 0;
	private readonly startedAt: number[] = [];

	constructor(
		private readonly maxConcurrent: number,
		private readonly maxPerHour: number
	) {}

	tryAcquire(nowMs: number): boolean {
		while (this.startedAt.length && this.startedAt[0]! <= nowMs - 3_600_000) {
			this.startedAt.shift();
		}
		if (this.running >= this.maxConcurrent || this.startedAt.length >= this.maxPerHour) {
			return false;
		}
		this.running += 1;
		this.startedAt.push(nowMs);
		return true;
	}

	release(): void {
		this.running = Math.max(0, this.running - 1);
	}
}

export const PROCESS_DRAIN_BUDGET = new DrainBudget(
	LLM_CALL_INCIDENT_LIMITS.maxConcurrentDrains,
	LLM_CALL_INCIDENT_LIMITS.maxDrainsPerHour
);

type Incident = { kind: 'stall' | 'error'; reason: string };
type Stall = JsonObject & { reason: string; at_ms: number };

// Values here are ours to send; anything else (a custom route header) may be a credential.
const SAFE_REQUEST_HEADERS = new Set([
	'content-type',
	'accept',
	'http-referer',
	'x-title',
	'x-openrouter-metadata'
]);

export function capturedRequestHeaders(headers: Readonly<Record<string, string>>): JsonObject {
	return Object.fromEntries(
		Object.entries(headers).map(([name, value]) => [
			name,
			SAFE_REQUEST_HEADERS.has(name.toLowerCase()) ? value : '[redacted]'
		])
	);
}

/**
 * Which ended attempts are kept, from the attempt receipt the client already
 * writes. A stall marked during the attempt wins, whatever the attempt's end.
 */
export function classifyIncident(
	receipt: JsonObject,
	stall: { reason: string } | null,
	httpStatus: number | null
): Incident | null {
	if (stall) return { kind: 'stall', reason: stall.reason };
	const errorClass = typeof receipt.error_class === 'string' ? receipt.error_class : null;
	if (receipt.status === 'success') {
		// The model named a tool it was not offered, or wrote arguments that are not JSON.
		return 'rejected_tool_name' in receipt
			? { kind: 'error', reason: 'tool_call_rejected' }
			: null;
	}
	// A cancel, a lost hedge of a healthy request, or the consumer closing early.
	if (receipt.status === 'aborted' || errorClass === 'provider_consumer_closed') return null;
	if (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)) {
		return { kind: 'error', reason: `http_${httpStatus}` };
	}
	if (receipt.finish_reason === 'error') {
		return { kind: 'error', reason: 'provider_finish_reason_error' };
	}
	return { kind: 'error', reason: errorClass ?? 'provider_failure' };
}

function stallReasonOf(error: AgenticChatSlowStreamError): string {
	if (error instanceof AgenticChatReviewerStallError) return error.errorClass;
	if (error instanceof AgenticChatFirstProgressStallError) return 'first_progress_stall';
	return 'slow_stream';
}

function errorName(value: unknown): string {
	if (value instanceof AgenticChatProviderHedgeLostError) return 'hedge_lost';
	if (value instanceof Error) return value.name || 'Error';
	return typeof value;
}

/** No lone surrogate halves: a cut emoji makes Postgres reject the whole row (22P02). */
function wellFormed(value: string): string {
	return (value as unknown as { toWellFormed?: () => string }).toWellFormed?.() ?? value;
}

function shortError(value: unknown): string {
	const text = value instanceof Error ? value.message : String(value);
	return wellFormed(text.slice(0, 300));
}

function text(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** JSON with NUL and lone surrogates removed from every string (jsonb rejects both). */
function jsonSafe<T>(value: T): T {
	return JSON.parse(
		JSON.stringify(value ?? null, (_key, entry) =>
			typeof entry === 'string' ? wellFormed(entry.replaceAll('\u0000', '')) : entry
		)
	) as T;
}

/** Text column safe: no NUL, no lone surrogate. */
function textSafe(value: string): string {
	return wellFormed(value.replaceAll('\u0000', ''));
}

/** Totals of a raw SSE capture: id, model, provider, finish, usage, and sizes. */
export function summarizeSse(raw: string): JsonObject {
	let generationId: string | null = null;
	let model: string | null = null;
	let provider: string | null = null;
	let finishReason: string | null = null;
	let nativeFinishReason: string | null = null;
	let usage: unknown = null;
	let error: unknown = null;
	let frames = 0;
	let done = false;
	let contentChars = 0;
	let reasoningChars = 0;
	const toolCalls = new Map<number, string>();
	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed.startsWith('data:')) continue;
		const data = trimmed.slice(5).trim();
		if (data === '[DONE]') {
			done = true;
			continue;
		}
		let chunk: Record<string, unknown>;
		try {
			chunk = JSON.parse(data) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (!chunk || typeof chunk !== 'object') continue;
		frames += 1;
		generationId ??= text(chunk.id);
		model = text(chunk.model) ?? model;
		provider = text(chunk.provider) ?? provider;
		if (chunk.error) error = chunk.error;
		if (chunk.usage) usage = chunk.usage;
		const choices = Array.isArray(chunk.choices) ? chunk.choices : [];
		for (const choice of choices as Record<string, unknown>[]) {
			const delta = (choice?.delta ?? {}) as Record<string, unknown>;
			if (typeof delta.content === 'string') contentChars += delta.content.length;
			if (typeof delta.reasoning === 'string') reasoningChars += delta.reasoning.length;
			if (Array.isArray(delta.tool_calls)) {
				for (const call of delta.tool_calls as Record<string, unknown>[]) {
					const index = typeof call?.index === 'number' ? call.index : toolCalls.size;
					const name = text((call?.function as Record<string, unknown>)?.name);
					if (name) toolCalls.set(index, (toolCalls.get(index) ?? '') + name);
				}
			}
			finishReason = text(choice?.finish_reason) ?? finishReason;
			nativeFinishReason = text(choice?.native_finish_reason) ?? nativeFinishReason;
		}
	}
	return jsonSafe({
		generation_id: generationId,
		model,
		provider,
		frames,
		done,
		finish_reason: finishReason,
		native_finish_reason: nativeFinishReason,
		usage: (usage ?? null) as JsonObject | null,
		error: (error ?? null) as JsonObject | null,
		content_chars: contentChars,
		reasoning_chars: reasoningChars,
		tool_calls: [...toolCalls.entries()].sort(([a], [b]) => a - b).map(([, name]) => name)
	});
}

/** OpenRouter's record of one generation; free, and it lags the stream by seconds. */
export async function fetchGenerationStats(
	fetchImpl: typeof fetch,
	baseUrl: string,
	apiKey: string,
	generationId: string,
	timeoutMs: number
): Promise<
	| { kind: 'found'; data: JsonObject }
	| { kind: 'not_yet' }
	| { kind: 'failed'; status: number | null }
> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	timer.unref?.();
	try {
		const response = await fetchImpl(
			`${baseUrl.replace(/\/+$/, '')}/generation?id=${encodeURIComponent(generationId)}`,
			{ headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal }
		);
		if (!response.ok) {
			void response.body?.cancel().catch(() => undefined);
			return response.status === 404
				? { kind: 'not_yet' }
				: { kind: 'failed', status: response.status };
		}
		const body = (await response.json()) as { data?: unknown };
		return body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
			? { kind: 'found', data: jsonSafe(body.data as JsonObject) }
			: { kind: 'failed', status: response.status };
	} catch {
		return { kind: 'failed', status: null };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * One physical request. Created before it is sent, told what happens to it,
 * and released when its attempt ends; only an incident is written.
 */
export class ProviderCallCapture {
	readonly id = randomUUID();
	private readonly transport = new AbortController();
	private readonly limits: Limits;
	private readonly now: () => number;
	private readonly startedAtMs: number;
	private readonly events: JsonObject[] = [];
	private readonly samples: [number, number][] = [];
	private readonly chunks: Uint8Array[] = [];
	private storedBytes = 0;
	private totalBytes = 0;
	private truncated = false;
	private httpStatus: number | null = null;
	private responseHeaders: JsonObject | null = null;
	private errorBody: string | null = null;
	private stall: Stall | null = null;
	private drainRequested = false;
	private draining = false;
	private drainDone = false;
	private drainTimer: ReturnType<typeof setTimeout> | undefined;
	private recorder: ReadableStreamDefaultReader<Uint8Array> | null = null;
	private recorderClosed = false;
	/** The recorded stream ended (or failed) on its own. */
	private recorderEnded = false;
	private stored: StoredIncidentRequestV1 | null = null;
	private recorderSettled: Promise<void> = Promise.resolve();
	private receipt: JsonObject | null = null;
	private accountOutcome: JsonObject | null = null;
	private snapshot: CallCaptureSnapshot = {};
	private endedAtMs: number | null = null;
	private released = false;
	private rowWritten = false;
	private statsScheduled = false;
	private eventual: JsonObject | null = null;

	constructor(
		private readonly settings: CallCaptureSettings,
		private readonly identity: CallCaptureIdentity,
		private readonly apiKey: string,
		private readonly requestBody: string,
		private readonly requestHeaders: JsonObject
	) {
		this.limits = { ...LLM_CALL_INCIDENT_LIMITS, ...(settings.limits ?? {}) };
		this.now = settings.now ?? Date.now;
		this.startedAtMs = this.now();
		this.event('request_sent', { request_bytes: Buffer.byteLength(requestBody, 'utf8') });
	}

	/** The fetch's own signal: aborted with the attempt, unless the request is left running. */
	get signal(): AbortSignal {
		return this.transport.signal;
	}

	/** The attempt's signal fired. A stall of ours leaves the request running; anything else ends it. */
	onAttemptAbort(reason: unknown, timedOut: boolean, responseOpened: boolean): void {
		if (reason instanceof AgenticChatSlowStreamError) {
			this.markStall(stallReasonOf(reason), {
				window_ms: reason.windowMs,
				output_bytes: reason.outputBytes
			});
		} else if (timedOut) {
			this.markStall(responseOpened ? 'request_timeout' : 'response_headers_timeout');
		}
		this.event('attempt_aborted', {
			reason: errorName(reason),
			...(timedOut ? { timed_out: true } : {})
		});
		// Ours: a deadline, a watch, or a stalled request that lost its hedge. A cancel is not.
		const ours =
			timedOut ||
			reason instanceof AgenticChatSlowStreamError ||
			this.drainRequested ||
			(reason instanceof AgenticChatProviderHedgeLostError && this.stall !== null);
		if (ours && this.stall && this.settings.drain) {
			if (!this.identity.drainAllowed) {
				this.event('drain_skipped', { why: 'budgeted_request' });
			} else if (this.recorderEnded) {
				// The response already arrived in full; there is nothing left to wait for.
				this.event('drain_skipped', { why: 'stream_already_ended' });
			} else if (responseOpened && !this.recorder) {
				// An error body being read: nothing records it, and its read must end now.
				this.event('drain_skipped', { why: 'nothing_to_record' });
			} else if ((this.settings.drainBudget ?? PROCESS_DRAIN_BUDGET).tryAcquire(this.now())) {
				this.draining = true;
				this.event('drain_started');
				this.drainTimer = setTimeout(
					() => this.finishDrain('deadline'),
					this.limits.drainMs
				);
				this.drainTimer.unref?.();
				return;
			} else {
				this.event('drain_skipped', { why: 'drain_budget' });
			}
		}
		this.transport.abort(reason);
	}

	observeResponse(response: Response): void {
		this.httpStatus = response.status;
		const headers: JsonObject = {};
		response.headers.forEach((value, name) => {
			if (name.toLowerCase() !== 'set-cookie') headers[name] = value;
		});
		this.responseHeaders = headers;
		this.event('response_opened', { status: response.status });
	}

	recordErrorBody(body: string): void {
		this.errorBody = body;
	}

	/** Splits the response stream: the turn reads one branch, the recorder the other. */
	tee(response: Response): Response {
		if (!response.body) return response;
		const [consumer, recorded] = response.body.tee();
		this.record(recorded);
		return new Response(consumer, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}

	/** A response that arrived after its attempt gave up; taken only while draining. */
	adoptLateResponse(response: Response): boolean {
		if (!this.draining || this.drainDone) return false;
		this.observeResponse(response);
		if (!response.ok || !response.body) {
			void readBoundedResponseText(response, this.limits.errorBodyBytes).then(
				(body) => {
					this.errorBody = body;
					this.finishDrain('response_error');
				},
				() => this.finishDrain('response_error')
			);
			return true;
		}
		this.record(response.body);
		return true;
	}

	/** The request left running after its header deadline failed before any response. */
	adoptLateFailure(error: unknown): void {
		if (!this.draining || this.drainDone || this.httpStatus !== null) return;
		this.event('request_failed', { error: shortError(error) });
		this.finishDrain('request_error');
	}

	/** The request looked stalled. `drain` marks an abort the client is about to make itself. */
	markStall(reason: string, detail: JsonObject = {}, options: { drain?: boolean } = {}): void {
		if (options.drain) this.drainRequested = true;
		this.event('stall', { reason, ...detail });
		if (!this.stall) this.stall = { reason, at_ms: this.at(), ...detail };
	}

	mark(event: string, detail: JsonObject = {}): void {
		this.event(event, detail);
	}

	/** The `provider_attempt_ended` receipt payload, as the client writes it. */
	end(receipt: JsonObject): void {
		if (this.receipt) return;
		this.receipt = receipt;
		this.endedAtMs = this.now();
		this.event('attempt_ended', {
			status: typeof receipt.status === 'string' ? receipt.status : null,
			error_class: typeof receipt.error_class === 'string' ? receipt.error_class : null
		});
	}

	/** The usage-log outcome: status, error message, retryable. */
	noteOutcome(outcome: JsonObject): void {
		this.accountOutcome ??= outcome;
	}

	/** The attempt is over. Writes the incident, if it is one, off the caller's path. */
	release(snapshot: CallCaptureSnapshot = {}): void {
		if (this.released) return;
		this.released = true;
		this.snapshot = snapshot;
		const incident = this.receipt
			? classifyIncident(this.receipt, this.stall, this.httpStatus)
			: null;
		if (!incident) {
			// Draining implies a stall, which is always an incident.
			this.closeRecorder();
			return;
		}
		void this.finalize(incident).catch(() => undefined);
	}

	private async finalize(incident: Incident): Promise<void> {
		// Off the caller's tick: the row (hashing, projection, serialization) is built later.
		await new Promise<void>((resolve) => setImmediate(resolve));
		if (!this.draining) {
			await settleWithin(this.recorderSettled, this.limits.recorderSettleMs);
			this.closeRecorder();
		}
		this.rowWritten = true;
		this.settings.sink.insert(this.row(incident));
		if (!this.draining || this.drainDone) this.scheduleGenerationStats();
	}

	private record(stream: ReadableStream<Uint8Array>): void {
		const reader = stream.getReader();
		this.recorder = reader;
		this.recorderSettled = (async () => {
			let endedBy = 'stream_end';
			try {
				for (;;) {
					const chunk = await reader.read();
					if (chunk.done) break;
					this.onBytes(chunk.value);
				}
				if (!this.recorderClosed) this.event('stream_end', { bytes: this.totalBytes });
			} catch (error) {
				endedBy = 'stream_error';
				if (!this.recorderClosed) {
					this.event('stream_error', {
						error: shortError(error),
						bytes: this.totalBytes
					});
				}
			}
			this.recorderEnded = true;
			if (this.draining) this.finishDrain(endedBy);
		})();
	}

	private onBytes(value: Uint8Array): void {
		const at = this.at();
		if (this.totalBytes === 0) this.event('first_byte');
		this.totalBytes += value.byteLength;
		const room = this.limits.responseBytes - this.storedBytes;
		if (value.byteLength <= room) {
			this.chunks.push(value);
			this.storedBytes += value.byteLength;
		} else {
			if (room > 0) {
				this.chunks.push(value.subarray(0, room));
				this.storedBytes += room;
			}
			this.truncated = true;
		}
		if (this.samples.length < this.limits.samples) this.samples.push([at, this.totalBytes]);
		else this.samples[this.samples.length - 1] = [at, this.totalBytes];
	}

	private closeRecorder(): void {
		if (this.recorderClosed) return;
		this.recorderClosed = true;
		void this.recorder?.cancel().catch(() => undefined);
	}

	private finishDrain(endedBy: string): void {
		if (!this.draining || this.drainDone) return;
		this.drainDone = true;
		if (this.drainTimer) clearTimeout(this.drainTimer);
		(this.settings.drainBudget ?? PROCESS_DRAIN_BUDGET).release();
		this.event('drain_ended', { ended_by: endedBy, bytes: this.totalBytes });
		const summary = summarizeSse(this.responseText());
		const errorBody = this.storedErrorBody();
		this.eventual = jsonSafe({
			ended_by: endedBy,
			// Completed: the provider finished the generation on its own.
			completed: endedBy === 'stream_end' && summary.finish_reason !== null,
			total_ms: this.at(),
			http_status: this.httpStatus,
			bytes: this.totalBytes,
			...(errorBody !== null ? { error_body: errorBody.slice(0, 2_000) } : {}),
			...summary
		});
		this.transport.abort(new Error('LLM call capture: drain finished'));
		this.closeRecorder();
		if (!this.rowWritten) return;
		const generationId =
			this.snapshot.generationId ?? (summary.generation_id as string | null) ?? null;
		this.settings.sink.update(this.id, {
			...this.responseColumns(),
			timeline: this.timeline(),
			eventual: this.eventual,
			...(generationId ? { generation_id: generationId } : {})
		});
		this.scheduleGenerationStats();
	}

	private scheduleGenerationStats(): void {
		const generationId =
			this.snapshot.generationId ??
			(this.eventual?.generation_id as string | null | undefined) ??
			null;
		// gen-… is OpenRouter's generation id format; a request id is not looked up.
		if (
			this.statsScheduled ||
			this.identity.routeKind !== 'openrouter' ||
			!generationId?.startsWith('gen-')
		) {
			return;
		}
		this.statsScheduled = true;
		const lookup = (delayMs: number, retry: boolean) => {
			const timer = setTimeout(() => {
				void fetchGenerationStats(
					this.settings.fetchImpl,
					this.identity.baseUrl,
					this.apiKey,
					generationId,
					this.limits.generationStatsTimeoutMs
				).then((result) => {
					if (result.kind === 'found') {
						this.settings.sink.update(this.id, { generation_stats: result.data });
					} else if (result.kind === 'not_yet' && retry) {
						lookup(this.limits.generationStatsRetryMs, false);
					} else {
						this.settings.sink.update(this.id, {
							generation_stats: {
								lookup_failed: result.kind === 'failed' ? result.status : 404
							}
						});
					}
				});
			}, delayMs);
			timer.unref?.();
		};
		lookup(this.limits.generationStatsDelayMs, true);
	}

	private row(incident: Incident): LlmCallIncidentRowV1 {
		const endedAtMs = this.endedAtMs ?? this.now();
		const requestBytes = Buffer.byteLength(this.requestBody, 'utf8');
		const stored = this.storedRequest();
		const storedBytes = Buffer.byteLength(stored.body, 'utf8');
		const requestTruncated = storedBytes > this.limits.requestBytes;
		const responseText = this.chunks.length ? this.responseText() : '';
		const identity = this.identity;
		return {
			id: this.id,
			lane: this.settings.lane,
			user_id: identity.userId,
			session_id: identity.sessionId,
			turn_run_id: identity.turnRunId,
			project_id: identity.projectId,
			usage_log_id: identity.usageLogId,
			kind: incident.kind,
			reason: incident.reason.slice(0, 120),
			pass_role: identity.passRole,
			logical_provider_round: identity.logicalProviderRound,
			provider_attempt: identity.providerAttempt,
			route_id: identity.routeId,
			model_requested: identity.modelRequested,
			model_used: this.snapshot.modelUsed ?? null,
			provider: this.snapshot.provider ?? null,
			generation_id: this.snapshot.generationId ?? null,
			started_at: new Date(this.startedAtMs).toISOString(),
			ended_at: new Date(endedAtMs).toISOString(),
			duration_ms: Math.max(0, endedAtMs - this.startedAtMs),
			request_body: textSafe(
				requestTruncated
					? Buffer.from(stored.body, 'utf8')
							.subarray(0, this.limits.requestBytes)
							.toString('utf8')
					: stored.body
			),
			request_sha256: createHash('sha256').update(this.requestBody).digest('hex'),
			request_headers: this.requestHeaders,
			...this.responseColumns(),
			timeline: this.timeline(),
			outcome: jsonSafe({
				receipt: this.receipt,
				usage_log: this.accountOutcome,
				stall: this.stall,
				stream: this.snapshot.stream ?? null,
				captured_stream: responseText ? summarizeSse(responseText) : null,
				context: identity.context,
				request_bytes: requestBytes,
				request_truncated: requestTruncated,
				// What the stored body and reply leave out (incident-redaction.ts).
				request_projection: {
					pass_through_tool_call_ids: stored.passThroughToolCallIds,
					signed_urls_stripped: stored.signedUrlsStripped,
					reasoning_removed: stored.reasoningRemoved,
					unparsed: stored.unparsed,
					reply_withheld: this.replyWithheld()
				}
			}),
			eventual: this.draining
				? (this.eventual ?? { status: 'running', limit_ms: this.limits.drainMs })
				: null,
			generation_stats: null
		};
	}

	private responseColumns(): Pick<
		LlmCallIncidentRowV1,
		'http_status' | 'response_headers' | 'response_body' | 'response_truncated'
	> {
		// After a read on the user's behalf the reply can repeat what was read: keep its timing and counts only.
		const streamed = this.chunks.length && !this.replyWithheld() ? this.responseText() : null;
		const errorBody = this.storedErrorBody();
		return {
			http_status: this.httpStatus,
			response_headers: this.responseHeaders,
			response_body: errorBody ?? streamed,
			response_truncated: this.truncated
		};
	}

	private storedRequest(): StoredIncidentRequestV1 {
		return (this.stored ??= projectIncidentRequestBody(this.requestBody));
	}

	private replyWithheld(): boolean {
		const stored = this.storedRequest();
		return stored.unparsed || stored.passThroughToolCallIds.length > 0;
	}

	private storedErrorBody(): string | null {
		if (this.errorBody === null) return null;
		return this.replyWithheld() ? minimalErrorBody(this.errorBody) : textSafe(this.errorBody);
	}

	private responseText(): string {
		return textSafe(Buffer.concat(this.chunks).toString('utf8'));
	}

	private timeline(): JsonObject {
		return jsonSafe({
			started_at: new Date(this.startedAtMs).toISOString(),
			events: this.events,
			// [ms since sent, total bytes received]
			bytes: this.samples
		});
	}

	private event(event: string, detail: JsonObject = {}): void {
		if (this.events.length >= this.limits.events) return;
		this.events.push({ at_ms: this.at(), event, ...detail });
	}

	private at(): number {
		return Math.max(0, this.now() - this.startedAtMs);
	}
}

function settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
		void work.then(
			() => {
				clearTimeout(timer);
				resolve();
			},
			() => {
				clearTimeout(timer);
				resolve();
			}
		);
	});
}
