// packages/smart-llm/src/llm-call-incidents.ts
//
// Records SmartLLMService calls that time out, fail, or come back empty into
// `llm_call_incidents` (supabase/migrations/20261018150000_llm_call_incidents.sql),
// the table the chat worker's capture also writes. Read at /admin/model-incidents.
//
// Nothing happens on a healthy call beyond one cheap check. An incident is built
// and written off the caller's path, fire and forget, with a bounded write and
// per-process caps. A timed-out request may be left running (worker only) so the
// row can say how and when it eventually ended.
//
// Privacy: an operation's prompt and reply are stored only when the operation is
// on FULL_CONTENT_OPERATIONS, which lists jobs that read BuildOS records alone.
// Jobs whose prompts can carry email, outside calendar events, or web pages
// (calendar analysis, table AI fill, agent runs, deep research) and any unknown
// operation keep timing, sizes, status and a minimal error only. Rows expire
// after 14 days (cleanup_privacy_llm_call_incidents) and cascade with the user
// and chat session.
import type {
	OpenRouterCallEventual,
	OpenRouterCallObservation,
	OpenRouterCallObserver
} from './openrouter-client';
import { extractTextFromChoice } from './response-parsing';

export const SMART_LLM_INCIDENT_LIMITS = {
	requestBytes: 4 * 1024 * 1024,
	responseBytes: 2 * 1024 * 1024,
	insertsPerHour: 200,
	pendingBytes: 32 * 1024 * 1024,
	writeTimeoutMs: 15_000,
	drainMs: 120_000,
	drainConcurrent: 3,
	drainPerHour: 30
} as const;

/**
 * Operation families whose prompts hold BuildOS records only, so the prompt and
 * reply may be stored (classified 2026-10-18 from each call site's data sources).
 * Matched as exact names or, when ending in `_`, as prefixes.
 */
const FULL_CONTENT_OPERATIONS = [
	'daily_brief_',
	'project_',
	'consolidation_',
	'chat_checkpoint_',
	'chat_project_next_step',
	'chat_contact_signal_extraction',
	'profile_',
	'braindump_processing',
	'task_',
	'ontology_',
	'onboarding_analysis',
	'sms_event_reminder',
	'email_generation',
	'document_proposal_generate',
	'time_play_suggestions',
	'brief_template_generation',
	'goal_reverse_engineering',
	'batch_task_migration'
] as const;

export type IncidentStorage = 'full' | 'metadata';

/**
 * Jobs that put chat transcripts in the prompt. Their content is kept only when
 * the row carries the chat session, so deleting the chat deletes the incident.
 */
const CHAT_DERIVED_OPERATIONS = ['chat_', 'profile_'] as const;

export function incidentStorageFor(
	operationType: string | undefined | null,
	chatSessionId?: string | null
): IncidentStorage {
	const op = (operationType ?? '').trim();
	if (!op) return 'metadata';
	const listed = FULL_CONTENT_OPERATIONS.some((entry) =>
		entry.endsWith('_') ? op.startsWith(entry) : op === entry
	);
	if (!listed) return 'metadata';
	if (
		CHAT_DERIVED_OPERATIONS.some((prefix) => op.startsWith(prefix)) &&
		!uuidOrNull(chatSessionId)
	) {
		return 'metadata';
	}
	return 'full';
}

export type SmartLlmIncidentContext = {
	operationType: string;
	userId?: string | null;
	projectId?: string | null;
	chatSessionId?: string | null;
	turnRunId?: string | null;
	/** `attempt` for a model-failover attempt, `json_repair` for the parse-repair call. */
	role: 'attempt' | 'json_repair';
	/** 1-based model attempt within the operation. */
	attempt: number;
	modelRequested: string;
	modelsRouted?: string[];
};

type Classified = { kind: 'stall' | 'error'; reason: string } | null;

/** Whether a settled call is an incident, from structured fields only. */
export function classifyCall(observation: OpenRouterCallObservation): Classified {
	switch (observation.outcome) {
		case 'cancelled':
			return null;
		case 'timeout':
			return { kind: 'stall', reason: 'timeout' };
		case 'http_error':
			return { kind: 'error', reason: `http_${observation.httpStatus ?? 0}` };
		case 'invalid_json':
			return { kind: 'error', reason: 'invalid_json_body' };
		case 'error_response':
			return { kind: 'error', reason: 'provider_error_response' };
		case 'request_failed':
			return { kind: 'error', reason: 'request_failed' };
		case 'ok':
			break;
	}
	const choice = observation.response?.choices?.[0];
	if (!choice) return { kind: 'error', reason: 'empty_choices' };
	const text = extractTextFromChoice(choice);
	const toolCalls = (choice.message as { tool_calls?: unknown[] } | undefined)?.tool_calls;
	if ((text ?? '').trim() || (Array.isArray(toolCalls) && toolCalls.length)) return null;
	return {
		kind: 'error',
		reason: choice.finish_reason === 'length' ? 'empty_reply_length' : 'empty_reply'
	};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: string | null | undefined) =>
	typeof value === 'string' && UUID.test(value) ? value : null;

const encoder = new TextEncoder();
const byteLength = (value: string) => encoder.encode(value).byteLength;

/** Text the database accepts: no NUL, no lone surrogates. */
function textSafe(value: string): string {
	const cleaned = value.replace(/\u0000/g, '') as string & { toWellFormed?: () => string };
	return cleaned.toWellFormed?.() ?? cleaned;
}

function cutToBytes(value: string, max: number): { text: string; truncated: boolean } {
	if (byteLength(value) <= max) return { text: value, truncated: false };
	let end = Math.min(value.length, max);
	while (end > 0 && byteLength(value.slice(0, end)) > max) end = Math.floor(end * 0.9);
	return { text: value.slice(0, end), truncated: true };
}

/** OpenRouter's code, short message and provider; nothing an upstream may have echoed. */
export function minimalErrorBody(raw: string | null): string | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const error = (parsed?.error ?? parsed) as Record<string, unknown>;
		const metadata = (error?.metadata ?? {}) as Record<string, unknown>;
		return JSON.stringify({
			error: {
				code: error?.code ?? null,
				message: typeof error?.message === 'string' ? error.message.slice(0, 500) : null,
				metadata: {
					provider_name:
						typeof metadata.provider_name === 'string' ? metadata.provider_name : null
				}
			},
			redacted: true
		});
	} catch {
		return null;
	}
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
		''
	);
}

type JsonObject = Record<string, unknown>;

function parsedCompletion(text: string | null): JsonObject | null {
	if (!text) return null;
	try {
		const value = JSON.parse(text) as unknown;
		return value && typeof value === 'object' && !Array.isArray(value)
			? (value as JsonObject)
			: null;
	} catch {
		return null;
	}
}

/** Builds the stored response columns for one body under the operation's storage class. */
function responseColumns(
	storage: IncidentStorage,
	text: string | null,
	httpStatus: number | null,
	headers: Record<string, string> | null
): {
	response_body: string | null;
	response_truncated: boolean;
	response_headers: JsonObject | null;
} {
	if (text === null) {
		return { response_body: null, response_truncated: false, response_headers: headers };
	}
	if (storage === 'metadata') {
		return {
			response_body: httpStatus !== null && httpStatus >= 400 ? minimalErrorBody(text) : null,
			response_truncated: false,
			response_headers: headers
		};
	}
	const cut = cutToBytes(textSafe(text), SMART_LLM_INCIDENT_LIMITS.responseBytes);
	return {
		response_body: cut.text,
		response_truncated: cut.truncated,
		response_headers: headers
	};
}

/** Summary of a completion body: finish reason, usage, provider, model, id. */
function completionSummary(text: string | null): JsonObject {
	const completion = parsedCompletion(text);
	if (!completion) return {};
	const choice = Array.isArray(completion.choices) ? (completion.choices[0] as JsonObject) : null;
	return {
		finish_reason: (choice?.finish_reason as string | undefined) ?? null,
		usage: (completion.usage as JsonObject | undefined) ?? null,
		provider: typeof completion.provider === 'string' ? completion.provider : null,
		model: typeof completion.model === 'string' ? completion.model : null,
		generation_id: typeof completion.id === 'string' ? completion.id : null
	};
}

export type IncidentWriteClient = {
	from(table: 'llm_call_incidents'): {
		insert(row: JsonObject): {
			abortSignal(signal: AbortSignal): PromiseLike<{ error: { code?: string } | null }>;
		};
		update(values: JsonObject): {
			eq(
				column: 'id',
				value: string
			): {
				abortSignal(signal: AbortSignal): PromiseLike<{ error: { code?: string } | null }>;
			};
		};
	};
};

export type SmartLlmIncidentRecorderOptions = {
	client: IncidentWriteClient;
	/** Leave timed-out requests running to record their ending (long-lived processes only). */
	drain?: boolean;
	/** Defaults to the process-wide budget; tests pass their own. */
	budget?: IncidentBudget;
	now?: () => number;
	log?: (message: string, detail: JsonObject) => void;
};

/**
 * Caps shared by every recorder in the process. Jobs build a SmartLLMService per
 * run, so per-instance counters would never bind during an outage.
 */
export class IncidentBudget {
	insertWindow: number[] = [];
	drainWindow: number[] = [];
	draining = 0;
	pendingBytes = 0;

	/** Room for one more row of this size in the last hour's window. */
	hasRoom(now: number, weight: number): boolean {
		this.insertWindow = this.insertWindow.filter((at) => now - at < 3_600_000);
		return (
			this.insertWindow.length < SMART_LLM_INCIDENT_LIMITS.insertsPerHour &&
			this.pendingBytes + weight <= SMART_LLM_INCIDENT_LIMITS.pendingBytes
		);
	}
}

export const PROCESS_INCIDENT_BUDGET = new IncidentBudget();

export class SmartLlmIncidentRecorder {
	private readonly client: IncidentWriteClient;
	private readonly drain: boolean;
	private readonly now: () => number;
	private readonly log: (message: string, detail: JsonObject) => void;
	private readonly budget: IncidentBudget;

	constructor(options: SmartLlmIncidentRecorderOptions) {
		this.client = options.client;
		this.drain = options.drain ?? false;
		this.budget = options.budget ?? PROCESS_INCIDENT_BUDGET;
		this.now = options.now ?? Date.now;
		this.log =
			options.log ??
			((message, detail) => console.warn(`[smart-llm incidents] ${message}`, detail));
	}

	observerFor(context: SmartLlmIncidentContext): OpenRouterCallObserver {
		return {
			onEnd: (observation) => this.onEnd(context, observation),
			...(this.drain
				? {
						acquireDrain: () => this.acquireDrain(),
						drainMs: SMART_LLM_INCIDENT_LIMITS.drainMs
					}
				: {})
		};
	}

	private acquireDrain(): (() => void) | null {
		const now = this.now();
		const budget = this.budget;
		budget.drainWindow = budget.drainWindow.filter((at) => now - at < 3_600_000);
		if (
			budget.draining >= SMART_LLM_INCIDENT_LIMITS.drainConcurrent ||
			budget.drainWindow.length >= SMART_LLM_INCIDENT_LIMITS.drainPerHour ||
			// No slot for a request whose row could not be written anyway.
			!budget.hasRoom(now, 0)
		) {
			return null;
		}
		budget.draining += 1;
		budget.drainWindow.push(now);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			budget.draining -= 1;
		};
	}

	private onEnd(context: SmartLlmIncidentContext, observation: OpenRouterCallObservation): void {
		const classified = classifyCall(observation);
		if (!classified) return;
		const now = this.now();
		const budget = this.budget;
		const weight = observation.requestBody.length + (observation.responseText?.length ?? 0);
		if (!budget.hasRoom(now, weight)) return;
		budget.insertWindow.push(now);
		budget.pendingBytes += weight;
		// Off the caller's path: hashing and serializing happen after it has its answer.
		setTimeout(() => {
			void this.write(context, observation, classified)
				.catch((error: unknown) =>
					this.log('write failed', {
						error: error instanceof Error ? error.name : 'unknown'
					})
				)
				.finally(() => {
					budget.pendingBytes -= weight;
				});
		}, 0);
	}

	private async write(
		context: SmartLlmIncidentContext,
		observation: OpenRouterCallObservation,
		classified: NonNullable<Classified>
	): Promise<void> {
		const storage = incidentStorageFor(context.operationType, context.chatSessionId);
		const id = globalThis.crypto.randomUUID();
		const requestFits =
			storage === 'full' &&
			byteLength(observation.requestBody) <= SMART_LLM_INCIDENT_LIMITS.requestBytes;
		const summary = completionSummary(observation.responseText);
		const events: JsonObject[] = [{ at_ms: 0, event: 'request_sent' }];
		if (observation.openedMs !== null) {
			events.push({
				at_ms: observation.openedMs,
				event: 'response_opened',
				status: observation.httpStatus
			});
		}
		events.push({
			at_ms: observation.endedMs,
			event: 'attempt_ended',
			// "completed" when a reply arrived (an empty one is still an incident).
			status: observation.outcome === 'ok' ? 'completed' : observation.outcome,
			...(observation.errorName ? { error_class: observation.errorName } : {})
		});
		if (observation.eventual)
			events.push({ at_ms: observation.endedMs, event: 'drain_started' });
		const bytes =
			observation.responseText !== null
				? [[observation.endedMs, byteLength(observation.responseText)]]
				: [];

		const row: JsonObject = {
			id,
			lane: context.operationType.slice(0, 80) || 'other',
			user_id: uuidOrNull(context.userId),
			session_id: uuidOrNull(context.chatSessionId),
			turn_run_id: uuidOrNull(context.turnRunId),
			project_id: uuidOrNull(context.projectId),
			kind: classified.kind,
			reason: classified.reason,
			pass_role: context.role,
			provider_attempt: context.attempt,
			model_requested: context.modelRequested,
			model_used: (summary.model as string | null) ?? null,
			provider: (summary.provider as string | null) ?? null,
			http_status: observation.httpStatus,
			generation_id:
				(summary.generation_id as string | null) ??
				observation.responseHeaders?.['x-generation-id'] ??
				null,
			started_at: new Date(observation.startedAt).toISOString(),
			ended_at: new Date(observation.startedAt + observation.endedMs).toISOString(),
			duration_ms: observation.endedMs,
			request_body: requestFits ? textSafe(observation.requestBody) : '{}',
			request_sha256: await sha256Hex(observation.requestBody),
			request_headers: observation.requestHeaders,
			...responseColumns(
				storage,
				observation.responseText,
				observation.httpStatus,
				observation.responseHeaders
			),
			timeline: { started_at: new Date(observation.startedAt).toISOString(), events, bytes },
			outcome: {
				lane: 'smart_llm',
				storage,
				request_bytes: byteLength(observation.requestBody),
				request_stored: requestFits,
				timeout_ms: observation.timeoutMs,
				outcome: observation.outcome,
				error_class: observation.errorName,
				finish_reason: summary.finish_reason ?? null,
				usage: summary.usage ?? null,
				models_routed: context.modelsRouted ?? [context.modelRequested],
				...(storage === 'metadata' && observation.responseText !== null
					? { request_projection: { reply_withheld: true } }
					: {})
			},
			eventual: observation.eventual ? { status: 'running' } : null,
			generation_stats: null
		};

		const inserted = await this.client
			.from('llm_call_incidents')
			.insert(row)
			.abortSignal(AbortSignal.timeout(SMART_LLM_INCIDENT_LIMITS.writeTimeoutMs));
		if (inserted.error) {
			// 23503: the chat session or user is gone, so nothing is kept.
			this.log('insert failed', { code: inserted.error.code ?? 'unknown' });
			return;
		}
		if (observation.eventual) {
			const ended = await observation.eventual;
			await this.recordEventual(id, storage, observation.startedAt, events, ended);
		}
	}

	private async recordEventual(
		id: string,
		storage: IncidentStorage,
		startedAt: number,
		events: JsonObject[],
		ended: OpenRouterCallEventual
	): Promise<void> {
		const summary = completionSummary(ended.responseText);
		const completed = ended.endedBy === 'stream_end' && summary.finish_reason != null;
		const values: JsonObject = {
			updated_at: new Date().toISOString(),
			...responseColumns(
				storage,
				ended.responseText,
				ended.httpStatus,
				ended.responseHeaders
			),
			timeline: {
				started_at: new Date(startedAt).toISOString(),
				events: [
					...events,
					// Headers that arrived only after the timeout.
					...(ended.openedMs !== null &&
					!events.some((event) => event.event === 'response_opened')
						? [
								{
									at_ms: ended.openedMs,
									event: 'response_opened',
									status: ended.httpStatus
								}
							]
						: []),
					{ at_ms: ended.totalMs, event: 'drain_ended', ended_by: ended.endedBy }
				].sort((a, b) => Number(a.at_ms) - Number(b.at_ms)),
				bytes:
					ended.responseText !== null
						? [[ended.totalMs, byteLength(ended.responseText)]]
						: []
			},
			eventual: {
				ended_by: ended.endedBy,
				completed,
				total_ms: ended.totalMs,
				http_status: ended.httpStatus,
				finish_reason: summary.finish_reason ?? null,
				usage: summary.usage ?? null,
				bytes: ended.responseText !== null ? byteLength(ended.responseText) : 0
			},
			...(summary.provider ? { provider: summary.provider } : {}),
			...(summary.model ? { model_used: summary.model } : {}),
			...(summary.generation_id ? { generation_id: summary.generation_id } : {}),
			...(ended.httpStatus !== null ? { http_status: ended.httpStatus } : {})
		};
		const updated = await this.client
			.from('llm_call_incidents')
			.update(values)
			.eq('id', id)
			.abortSignal(AbortSignal.timeout(SMART_LLM_INCIDENT_LIMITS.writeTimeoutMs));
		if (updated.error) this.log('update failed', { code: updated.error.code ?? 'unknown' });
	}
}

/** The kill switch: SMART_LLM_INCIDENTS=off stops all capture in this process. */
export function smartLlmIncidentsDisabled(): boolean {
	const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
		?.env;
	const value = env?.SMART_LLM_INCIDENTS?.trim().toLowerCase();
	return value === 'off' || value === 'false' || value === '0';
}
