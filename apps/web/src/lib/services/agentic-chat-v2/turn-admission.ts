// apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, Database, Json } from '@buildos/shared-types';

export const DEFAULT_PROGRESS_STALE_RECLAIM_MS = 120_000;
export const DEFAULT_RECENT_PROGRESS_GRACE_MS = 60_000;

export type LegacyFallbackHistoryMessageRow = {
	id: string;
	role: string;
	content: string;
	metadata: Json | null;
	created_at: string | null;
};

export type LegacyFallbackHistoryAttachmentRow = {
	message_id: string;
	asset_id: string | null;
	project_id: string | null;
	attachment_kind: string;
	media_type: string;
	role: string | null;
	display_order: number | null;
	metadata: Record<string, unknown> | null;
	asset: Record<string, unknown> | null;
};

export type LegacyFallbackHistoryToolExecutionRow = {
	message_id: string | null;
	provider_tool_call_id?: string | null;
	tool_name: string;
	gateway_op: string | null;
	sequence_index: number | null;
	success: boolean;
	error_message: string | null;
	arguments: Json;
	result: Json | null;
};

export type LegacyFallbackHistorySnapshot = {
	messages: LegacyFallbackHistoryMessageRow[];
	attachments: LegacyFallbackHistoryAttachmentRow[];
	interrupted_tool_executions: LegacyFallbackHistoryToolExecutionRow[];
	loaded_skill_executions: LegacyFallbackHistoryToolExecutionRow[];
};

type LegacyAgenticChatAdmissionCommon = {
	executionMayStart: false;
	turnRunId: string;
	sessionId: string;
	userMessageId: string | null;
	streamRunId: string;
	clientTurnId: string | null;
	executionMode: 'legacy_sse';
};

export type LegacyAgenticChatAdmissionResult =
	| {
			outcome: 'newly_admitted';
			executionMayStart: true;
			turnRunId: string;
			sessionId: string;
			userMessageId: string;
			streamRunId: string;
			clientTurnId: string | null;
			executionMode: 'legacy_sse';
			reclaimedTurnRunId: string | null;
			fallbackSnapshot: LegacyFallbackHistorySnapshot;
	  }
	| {
			outcome: 'capacity_exceeded';
			executionMayStart: false;
			runningCount: number;
			retryAfterSeconds: number;
	  }
	| (LegacyAgenticChatAdmissionCommon & {
			outcome: 'matching_duplicate';
	  })
	| (LegacyAgenticChatAdmissionCommon & {
			outcome: 'active_turn_conflict';
	  })
	| (LegacyAgenticChatAdmissionCommon & {
			outcome: 'idempotency_conflict';
			conflictReason: string;
	  });

export class LegacyAgenticChatAdmissionError extends Error {
	constructor(
		public readonly code: 'database_error' | 'invalid_result',
		message: string,
		public readonly causeValue?: unknown
	) {
		super(message);
		this.name = 'LegacyAgenticChatAdmissionError';
	}
}

type AdmitLegacyAgenticChatTurnParams = {
	supabase: SupabaseClient<Database>;
	userId: string;
	sessionId: string;
	turnRunId: string;
	userMessageId: string;
	streamRunId: string;
	clientTurnId: string | null;
	requestHash: string;
	requestHashVersion: string;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
	source: string;
	gatewayEnabled: boolean;
	requestMessage: string;
	startedAt: string;
	userMessageContent: string;
	userMessageMetadata: Record<string, Json | undefined>;
	historyLimit: number;
	detachedTurnMaxDurationMs: number;
	progressStaleReclaimMs: number;
	recentProgressGraceMs: number;
};

type LegacyAgenticChatAdmissionRpc = (
	functionName: 'admit_legacy_agentic_chat_turn',
	args: {
		p_user_id: string;
		p_session_id: string;
		p_turn_run_id: string;
		p_user_message_id: string;
		p_stream_run_id: string;
		p_client_turn_id: string | null;
		p_request_hash: string;
		p_request_hash_version: string;
		p_context_type: ChatContextType;
		p_entity_id: string | null;
		p_project_id: string | null;
		p_source: string;
		p_gateway_enabled: boolean;
		p_request_message: string;
		p_started_at: string;
		p_user_message_content: string;
		p_user_message_metadata: Record<string, Json | undefined>;
		p_history_limit: number;
		p_detached_turn_max_duration_ms: number;
		p_progress_stale_reclaim_ms: number;
		p_recent_progress_grace_ms: number;
	}
) => Promise<{ data: unknown; error: unknown }>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requiredString(value: unknown, field: string, result: Record<string, unknown>): string {
	if (typeof value === 'string' && value.length > 0) return value;
	throw new LegacyAgenticChatAdmissionError(
		'invalid_result',
		`Legacy admission RPC returned an invalid ${field}`,
		result
	);
}

function nullableString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function parseFallbackSnapshot(
	value: unknown,
	result: Record<string, unknown>
): LegacyFallbackHistorySnapshot {
	if (!isRecord(value)) {
		throw new LegacyAgenticChatAdmissionError(
			'invalid_result',
			'Legacy admission RPC omitted the fallback snapshot for a new admission',
			result
		);
	}
	const arrayField = <T>(field: string): T[] => {
		const rows = value[field];
		if (Array.isArray(rows)) return rows as T[];
		throw new LegacyAgenticChatAdmissionError(
			'invalid_result',
			`Legacy admission fallback snapshot returned an invalid ${field} array`,
			result
		);
	};
	return {
		messages: arrayField<LegacyFallbackHistoryMessageRow>('messages'),
		attachments: arrayField<LegacyFallbackHistoryAttachmentRow>('attachments'),
		interrupted_tool_executions: arrayField<LegacyFallbackHistoryToolExecutionRow>(
			'interrupted_tool_executions'
		),
		loaded_skill_executions:
			arrayField<LegacyFallbackHistoryToolExecutionRow>('loaded_skill_executions')
	};
}

function parseLegacyAdmissionResult(value: unknown): LegacyAgenticChatAdmissionResult {
	if (!isRecord(value)) {
		throw new LegacyAgenticChatAdmissionError(
			'invalid_result',
			'Legacy admission RPC returned no result',
			value
		);
	}

	const outcome = value.outcome;
	const executionMayStart = value.execution_may_start === true;
	if (outcome === 'capacity_exceeded') {
		const runningCount = value.running_count;
		const retryAfterSeconds = value.retry_after_seconds;
		if (
			executionMayStart ||
			typeof runningCount !== 'number' ||
			!Number.isSafeInteger(runningCount) ||
			runningCount < 2 ||
			typeof retryAfterSeconds !== 'number' ||
			!Number.isSafeInteger(retryAfterSeconds) ||
			retryAfterSeconds < 1 ||
			retryAfterSeconds > 300
		) {
			throw new LegacyAgenticChatAdmissionError(
				'invalid_result',
				'Legacy admission returned an invalid capacity result',
				value
			);
		}
		return {
			outcome,
			executionMayStart: false,
			runningCount,
			retryAfterSeconds
		};
	}
	const common = {
		turnRunId: requiredString(value.turn_run_id, 'turn_run_id', value),
		sessionId: requiredString(value.session_id, 'session_id', value),
		userMessageId: nullableString(value.user_message_id),
		streamRunId: requiredString(value.stream_run_id, 'stream_run_id', value),
		clientTurnId: nullableString(value.client_turn_id),
		executionMode: requiredString(value.execution_mode, 'execution_mode', value)
	};
	if (common.executionMode !== 'legacy_sse') {
		throw new LegacyAgenticChatAdmissionError(
			'invalid_result',
			'Legacy admission RPC returned a non-legacy execution mode',
			value
		);
	}

	if (outcome === 'newly_admitted') {
		if (!executionMayStart || !common.userMessageId) {
			throw new LegacyAgenticChatAdmissionError(
				'invalid_result',
				'New legacy admission did not return executable turn/message identities',
				value
			);
		}
		return {
			outcome,
			executionMayStart: true,
			...common,
			executionMode: 'legacy_sse',
			userMessageId: common.userMessageId,
			reclaimedTurnRunId: nullableString(value.reclaimed_turn_run_id),
			fallbackSnapshot: parseFallbackSnapshot(value.fallback_snapshot, value)
		};
	}

	if (executionMayStart) {
		throw new LegacyAgenticChatAdmissionError(
			'invalid_result',
			'Non-new legacy admission unexpectedly permits execution',
			value
		);
	}
	const nonExecutingCommon = {
		...common,
		executionMayStart: false as const,
		executionMode: 'legacy_sse' as const
	};
	if (outcome === 'matching_duplicate' || outcome === 'active_turn_conflict') {
		return { outcome, ...nonExecutingCommon };
	}
	if (outcome === 'idempotency_conflict') {
		return {
			outcome,
			...nonExecutingCommon,
			conflictReason:
				typeof value.conflict_reason === 'string'
					? value.conflict_reason
					: 'request_hash_mismatch'
		};
	}

	throw new LegacyAgenticChatAdmissionError(
		'invalid_result',
		`Legacy admission RPC returned an unknown outcome: ${String(outcome)}`,
		value
	);
}

/**
 * Typed service-role adapter for the atomic legacy admission transaction.
 * The caller supplies the gateway-owned canonical request hash; PostgreSQL
 * compares/stores it but deliberately never attempts to reproduce the JS hash.
 */
export async function admitLegacyAgenticChatTurn(
	params: AdmitLegacyAgenticChatTurnParams
): Promise<LegacyAgenticChatAdmissionResult> {
	// The workspace package's built declaration can lag the source-generated
	// Database type during a migration change. Keep this compatibility cast
	// local and fully typed until the generated package is rebuilt/deployed.
	const rpc = params.supabase.rpc.bind(
		params.supabase
	) as unknown as LegacyAgenticChatAdmissionRpc;
	const { data, error } = await rpc('admit_legacy_agentic_chat_turn', {
		p_user_id: params.userId,
		p_session_id: params.sessionId,
		p_turn_run_id: params.turnRunId,
		p_user_message_id: params.userMessageId,
		p_stream_run_id: params.streamRunId,
		p_client_turn_id: params.clientTurnId,
		p_request_hash: params.requestHash,
		p_request_hash_version: params.requestHashVersion,
		p_context_type: params.contextType,
		p_entity_id: params.entityId,
		p_project_id: params.projectId,
		p_source: params.source,
		p_gateway_enabled: params.gatewayEnabled,
		p_request_message: params.requestMessage,
		p_started_at: params.startedAt,
		p_user_message_content: params.userMessageContent,
		p_user_message_metadata: params.userMessageMetadata,
		p_history_limit: params.historyLimit,
		p_detached_turn_max_duration_ms: params.detachedTurnMaxDurationMs,
		p_progress_stale_reclaim_ms: params.progressStaleReclaimMs,
		p_recent_progress_grace_ms: params.recentProgressGraceMs
	});
	if (error) {
		throw new LegacyAgenticChatAdmissionError(
			'database_error',
			`Legacy admission RPC failed: ${
				isRecord(error) && typeof error.message === 'string'
					? error.message
					: 'unknown database error'
			}`,
			error
		);
	}
	return parseLegacyAdmissionResult(data);
}

/**
 * Pure reclaim rule for a running turn (exported for tests):
 * - progress silent >= progressStaleReclaimMs → reclaim (dead turn);
 * - past max duration AND progress not fresh → reclaim (bounded lock);
 * - otherwise the turn keeps its lock. `last_progress_at` may be null for
 *   turns started before the heartbeat existed; started_at stands in.
 */
export function shouldReclaimRunningTurn(params: {
	nowMs: number;
	startedAtMs: number;
	lastProgressAtMs: number | null;
	detachedTurnMaxDurationMs: number;
	progressStaleReclaimMs?: number;
	recentProgressGraceMs?: number;
}): boolean {
	const progressStaleReclaimMs =
		params.progressStaleReclaimMs ?? DEFAULT_PROGRESS_STALE_RECLAIM_MS;
	const recentProgressGraceMs = params.recentProgressGraceMs ?? DEFAULT_RECENT_PROGRESS_GRACE_MS;
	const ageMs = Math.max(0, params.nowMs - params.startedAtMs);
	const progressReferenceMs = params.lastProgressAtMs ?? params.startedAtMs;
	const progressAgeMs = Math.max(0, params.nowMs - progressReferenceMs);

	if (progressAgeMs >= progressStaleReclaimMs) return true;
	return ageMs >= params.detachedTurnMaxDurationMs && progressAgeMs >= recentProgressGraceMs;
}
