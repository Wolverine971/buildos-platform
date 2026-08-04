// apps/worker/src/workers/agentic-chat/timingPayload.ts
import {
	AGENTIC_CHAT_ASYNC_TIMING_CONTRACT_VERSION,
	type AgentTimingSummary
} from '@buildos/shared-types';
import type { AgenticChatPreterminalTimingSnapshotV1 } from './runtimeTiming';

const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export type AgenticChatAsyncTimingDraftV1 = {
	timing_contract_version: typeof AGENTIC_CHAT_ASYNC_TIMING_CONTRACT_VERSION;
	request_started_at: string;
	admitted_at: string;
	accepted_at: string;
	worker_started_at: string;
	provider_authorized_at: string;
	first_event_at: string | null;
	first_response_at: string | null;
	cache_source?: AgentTimingSummary['cache_source'];
	cache_age_seconds: number | null;
	request_prewarmed_context: boolean;
	history_strategy: string | null;
	history_compressed?: boolean;
	raw_history_count: number | null;
	history_for_model_count: number | null;
	prepared_prompt_hit: boolean;
	prepared_prompt_miss_reason: string | null;
	prepared_surface_profile: string | null;
	finished_reason: string;
	phases: AgentTimingSummary['phases'] & {
		admission_to_acceptance_ms: number;
		queue_wait_ms: number;
		worker_start_to_provider_authority_ms: number;
		provider_authority_to_finish_ms: number;
		provider_finish_to_terminal_call_ms: number;
	};
};

export type AgenticChatAsyncTimingTerminalEvidenceV1 = {
	assistantPersistedAt: string;
	terminalCommittedAt: string;
};

export type AgenticChatAsyncTimingSummaryV1 = AgentTimingSummary &
	AgenticChatAsyncTimingDraftV1 & {
		assistant_persisted_at: string;
		done_emitted_at: null;
		terminal_committed_at: string;
		phases: AgenticChatAsyncTimingDraftV1['phases'] & {
			total_request_ms: number;
		};
	};

export class AgenticChatTimingPayloadError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat timing payload: ${message}`);
		this.name = 'AgenticChatTimingPayloadError';
	}
}

/**
 * Build the exact worker-owned portion of the public timing summary. The
 * database terminal wrapper will add commit-owned evidence in the same
 * transaction that persists timing and done.
 */
export function buildAgenticChatAsyncTimingDraftV1(
	snapshot: AgenticChatPreterminalTimingSnapshotV1,
	finishedReason: string
): AgenticChatAsyncTimingDraftV1 {
	if (!canonicalText(finishedReason, 256)) {
		throw new AgenticChatTimingPayloadError('finished reason is invalid');
	}
	const database = snapshot.database;
	const admittedAtMs = timestampMs(database.admittedAt, 'admitted_at');
	const acceptedAtMs = timestampMs(database.startedAt, 'accepted_at');
	const workerStartedAtMs = timestampMs(database.workerStartedAt, 'worker_started_at');
	const providerAuthorizedAtMs = timestampMs(
		database.executionStartedAt,
		'provider_authorized_at'
	);
	const firstEventAtMs = nullableTimestampMs(
		snapshot.preterminal.firstEventPersistedAt,
		'first_event_at'
	);
	const firstResponseAtMs = nullableTimestampMs(
		snapshot.preterminal.firstResponsePersistedAt,
		'first_response_at'
	);
	if (
		admittedAtMs > acceptedAtMs ||
		acceptedAtMs > workerStartedAtMs ||
		workerStartedAtMs > providerAuthorizedAtMs ||
		(firstEventAtMs !== null && firstEventAtMs < providerAuthorizedAtMs) ||
		(firstResponseAtMs !== null && firstResponseAtMs < providerAuthorizedAtMs) ||
		(firstEventAtMs !== null &&
			firstResponseAtMs !== null &&
			firstResponseAtMs < firstEventAtMs)
	) {
		throw new AgenticChatTimingPayloadError('database timestamps are not causal');
	}

	const runtime = snapshot.preterminal.durationsMs;
	const phases: AgenticChatAsyncTimingDraftV1['phases'] = {
		admission_to_acceptance_ms: acceptedAtMs - admittedAtMs,
		queue_wait_ms: workerStartedAtMs - acceptedAtMs,
		worker_start_to_provider_authority_ms: providerAuthorizedAtMs - workerStartedAtMs,
		provider_authority_to_finish_ms: nonnegativeDuration(
			runtime.authorityToProviderFinish,
			'provider_authority_to_finish_ms'
		),
		provider_finish_to_terminal_call_ms: nonnegativeDuration(
			runtime.providerFinishToTerminalCall,
			'provider_finish_to_terminal_call_ms'
		)
	};
	assignDuration(
		phases,
		'response_generation_ms',
		runtime.firstResponsePersistenceToProviderFinish
	);
	if (firstEventAtMs !== null) {
		phases.time_to_first_event_ms = firstEventAtMs - admittedAtMs;
		phases.provider_authority_to_first_event_persistence_ms =
			firstEventAtMs - providerAuthorizedAtMs;
	}
	if (firstResponseAtMs !== null) {
		phases.time_to_first_response_ms = firstResponseAtMs - admittedAtMs;
		phases.provider_authority_to_first_response_persistence_ms =
			firstResponseAtMs - providerAuthorizedAtMs;
	}

	return {
		timing_contract_version: AGENTIC_CHAT_ASYNC_TIMING_CONTRACT_VERSION,
		request_started_at: database.admittedAt,
		admitted_at: database.admittedAt,
		accepted_at: database.startedAt,
		worker_started_at: database.workerStartedAt,
		provider_authorized_at: database.executionStartedAt,
		first_event_at: snapshot.preterminal.firstEventPersistedAt,
		first_response_at: snapshot.preterminal.firstResponsePersistedAt,
		...(database.cacheSource === null ? {} : { cache_source: database.cacheSource }),
		cache_age_seconds: database.cacheAgeSeconds,
		request_prewarmed_context: database.requestPrewarmedContext,
		history_strategy: database.historyStrategy,
		...(database.historyCompressed === null
			? {}
			: { history_compressed: database.historyCompressed }),
		raw_history_count: database.rawHistoryCount,
		history_for_model_count: database.historyForModelCount,
		prepared_prompt_hit: database.preparedPromptHit,
		prepared_prompt_miss_reason: database.preparedPromptMissReason,
		prepared_surface_profile: database.preparedSurfaceProfile,
		finished_reason: finishedReason,
		phases
	};
}

/** Reference finalizer for the payload the future database wrapper must emit. */
export function finalizeAgenticChatAsyncTimingSummaryV1(
	draft: AgenticChatAsyncTimingDraftV1,
	evidence: AgenticChatAsyncTimingTerminalEvidenceV1
): AgenticChatAsyncTimingSummaryV1 {
	if (
		draft.timing_contract_version !== AGENTIC_CHAT_ASYNC_TIMING_CONTRACT_VERSION ||
		draft.request_started_at !== draft.admitted_at
	) {
		throw new AgenticChatTimingPayloadError('draft contract identity is invalid');
	}
	const admittedAtMs = timestampMs(draft.admitted_at, 'admitted_at');
	const providerAuthorizedAtMs = timestampMs(
		draft.provider_authorized_at,
		'provider_authorized_at'
	);
	const assistantPersistedAtMs = timestampMs(
		evidence.assistantPersistedAt,
		'assistant_persisted_at'
	);
	const terminalCommittedAtMs = timestampMs(
		evidence.terminalCommittedAt,
		'terminal_committed_at'
	);
	if (
		assistantPersistedAtMs < providerAuthorizedAtMs ||
		terminalCommittedAtMs < assistantPersistedAtMs ||
		(draft.first_event_at !== null &&
			terminalCommittedAtMs < timestampMs(draft.first_event_at, 'first_event_at')) ||
		(draft.first_response_at !== null &&
			terminalCommittedAtMs < timestampMs(draft.first_response_at, 'first_response_at'))
	) {
		throw new AgenticChatTimingPayloadError('terminal timestamps are not causal');
	}

	return {
		...draft,
		assistant_persisted_at: evidence.assistantPersistedAt,
		done_emitted_at: null,
		terminal_committed_at: evidence.terminalCommittedAt,
		phases: {
			...draft.phases,
			total_request_ms: terminalCommittedAtMs - admittedAtMs
		}
	};
}

function assignDuration(
	phases: AgentTimingSummary['phases'],
	key: keyof AgentTimingSummary['phases'],
	value: number | null
): void {
	if (value !== null) phases[key] = nonnegativeDuration(value, key);
}

function nonnegativeDuration(value: number, name: PropertyKey): number {
	if (!Number.isFinite(value) || value < 0) {
		throw new AgenticChatTimingPayloadError(`${String(name)} is invalid`);
	}
	return value;
}

function nullableTimestampMs(value: string | null, name: string): number | null {
	return value === null ? null : timestampMs(value, name);
}

function timestampMs(value: string, name: string): number {
	if (!DATABASE_TIMESTAMP_PATTERN.test(value)) {
		throw new AgenticChatTimingPayloadError(`${name} is not a database timestamp`);
	}
	const parsed = Date.parse(value);
	if (!Number.isFinite(parsed)) {
		throw new AgenticChatTimingPayloadError(`${name} is not a database timestamp`);
	}
	return parsed;
}

function canonicalText(value: unknown, maximum: number): value is string {
	return (
		typeof value === 'string' &&
		value.length > 0 &&
		value.length <= maximum &&
		value === value.trim()
	);
}
