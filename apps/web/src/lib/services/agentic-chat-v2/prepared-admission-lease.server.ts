// apps/web/src/lib/services/agentic-chat-v2/prepared-admission-lease.server.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	ChatContextType,
	ChatSession,
	ChatToolDefinition,
	Database
} from '@buildos/shared-types';
import type { LitePromptScaffoldOptions } from '$lib/services/agentic-chat-lite/prompt';
import { resolveCacheAgeSeconds } from './context-cache-routing';
import {
	getPreparedPromptSurface,
	inspectPreparedPromptSurfaceCurrent,
	parsePreparedPromptKey,
	sha256Text,
	type PreparedPromptRow
} from './prepared-prompt-cache';
import { inspectPreparedHistorySnapshot } from './prepared-prompt-history';
import type { PreparedPromptWorkerInspectionResult } from './prepared-prompt-consumer.server';

type FastChatSupabaseClient = SupabaseClient<Database>;

export type PreparedAdmissionLeaseMissReason =
	| 'disabled'
	| 'ineligible'
	| 'bad_format'
	| 'database_error'
	| 'invalid_receipt'
	| 'invalid_request'
	| 'not_found'
	| 'nonce_mismatch'
	| 'consumed'
	| 'expired'
	| 'scope_mismatch'
	| 'session_mismatch'
	| 'access_revoked'
	| 'missing_context_generation'
	| 'stale_context'
	| 'stale_history'
	| 'checkpoint_required';

export type PreparedAdmissionLeaseInspection =
	| {
			hit: true;
			row: PreparedPromptRow;
			session: ChatSession;
			validatedAt: string;
	  }
	| {
			hit: false;
			reason: PreparedAdmissionLeaseMissReason;
	  };

type PreparedAdmissionRpcClient = {
	rpc(
		name: 'inspect_agentic_chat_prepared_admission',
		args: {
			p_user_id: string;
			p_prepared_prompt_id: string;
			p_nonce_sha256: string;
			p_session_id: string;
			p_context_type: string;
			p_entity_id: string | null;
			p_project_id: string | null;
			p_now: string;
		}
	): PromiseLike<{ data: unknown; error: unknown | null }>;
};

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

/** Default-on after the additive migration; false is the immediate rollback. */
export function isPreparedAdmissionLeaseEnabled(): boolean {
	return parseBooleanFlag(process.env.AGENTIC_CHAT_PREPARED_ADMISSION_LEASE_ENABLED, true);
}

export async function inspectPreparedAdmissionLease(params: {
	client: FastChatSupabaseClient;
	key: string | null;
	userId: string;
	sessionId: string | null;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
	attachmentCount: number;
	nowMs?: number;
}): Promise<PreparedAdmissionLeaseInspection> {
	if (!isPreparedAdmissionLeaseEnabled()) return { hit: false, reason: 'disabled' };
	if (
		!params.key ||
		!params.sessionId ||
		params.attachmentCount !== 0 ||
		(params.contextType !== 'global' &&
			params.contextType !== 'project' &&
			params.contextType !== 'ontology')
	) {
		return { hit: false, reason: 'ineligible' };
	}

	const parsed = parsePreparedPromptKey(params.key);
	if (!parsed) return { hit: false, reason: 'bad_format' };
	const now = new Date(params.nowMs ?? Date.now()).toISOString();
	if (!Number.isFinite(Date.parse(now))) return { hit: false, reason: 'invalid_request' };

	const nonceSha256 = sha256Text(parsed.nonce);
	const rpcClient = params.client as unknown as PreparedAdmissionRpcClient;
	let response: { data: unknown; error: unknown | null };
	try {
		response = await rpcClient.rpc('inspect_agentic_chat_prepared_admission', {
			p_user_id: params.userId,
			p_prepared_prompt_id: parsed.id,
			p_nonce_sha256: nonceSha256,
			p_session_id: params.sessionId,
			p_context_type: params.contextType,
			p_entity_id: params.entityId,
			p_project_id: params.projectId,
			p_now: now
		});
	} catch {
		return { hit: false, reason: 'database_error' };
	}
	const { data, error } = response;
	if (error) return { hit: false, reason: 'database_error' };
	if (!isRecord(data)) return { hit: false, reason: 'invalid_receipt' };
	if (data.outcome === 'fallback') {
		return {
			hit: false,
			reason: isDatabaseMissReason(data.reason) ? data.reason : 'invalid_receipt'
		};
	}
	if (data.outcome !== 'hit' || typeof data.validated_at !== 'string') {
		return { hit: false, reason: 'invalid_receipt' };
	}

	const row = parsePreparedPromptRow(data.prepared_prompt, params, parsed.id, nonceSha256);
	const session = parseOwnedSession(data.session, params);
	if (!row || !session || !Number.isFinite(Date.parse(data.validated_at))) {
		return { hit: false, reason: 'invalid_receipt' };
	}
	return { hit: true, row, session, validatedAt: data.validated_at };
}

/**
 * Completes the message-dependent checks that cannot live in the database RPC.
 * Authorization, scope, context generation, and history currency have already
 * been proven by the service-only receipt.
 */
export function inspectPreparedAdmissionLeaseContent(params: {
	inspection: Extract<PreparedAdmissionLeaseInspection, { hit: true }>;
	cacheKey: string;
	surfaceProfile: string;
	contextType: ChatContextType;
	tools: ChatToolDefinition[];
	scaffold?: LitePromptScaffoldOptions | null;
}): PreparedPromptWorkerInspectionResult {
	const row = params.inspection.row;
	if (row.cache_key !== params.cacheKey) return { hit: false, reason: 'scope_mismatch' };
	const surface = getPreparedPromptSurface(row, params.surfaceProfile);
	if (!surface) return { hit: false, reason: 'surface_missing' };
	const surfaceInspection = inspectPreparedPromptSurfaceCurrent({
		surface,
		contextType: params.contextType,
		contextPayload: row.context_payload,
		conversationSummary: row.conversation_summary ?? null,
		tools: params.tools,
		scaffold: params.scaffold
	});
	if (!surfaceInspection.current) return { hit: false, reason: 'stale_harness' };
	const history = inspectPreparedHistorySnapshot({
		historyForModel: row.history_for_model,
		historyStrategy: row.history_strategy,
		historyCompressed: row.history_compressed,
		rawHistoryCount: row.raw_history_count,
		historyForModelCount: row.history_for_model_count
	});
	if (!history.ok) return { hit: false, reason: 'invalid_history' };
	return {
		hit: true,
		row,
		surface,
		surfaceKey: params.surfaceProfile,
		history,
		ageSeconds: resolveCacheAgeSeconds(row.created_at)
	};
}

function parsePreparedPromptRow(
	value: unknown,
	params: {
		userId: string;
		sessionId: string | null;
		contextType: ChatContextType;
		entityId: string | null;
		projectId: string | null;
	},
	preparedPromptId: string,
	nonceSha256: string
): PreparedPromptRow | null {
	if (!isRecord(value)) return null;
	if (
		value.id !== preparedPromptId ||
		value.user_id !== params.userId ||
		value.session_id !== params.sessionId ||
		value.context_type !== params.contextType ||
		(value.entity_id ?? null) !== params.entityId ||
		(value.project_id ?? null) !== params.projectId ||
		typeof value.cache_key !== 'string' ||
		value.nonce_sha256 !== nonceSha256 ||
		typeof value.context_payload_sha256 !== 'string' ||
		!/^[0-9a-f]{64}$/.test(value.context_payload_sha256) ||
		typeof value.created_at !== 'string' ||
		typeof value.expires_at !== 'string' ||
		!Number.isFinite(Date.parse(value.created_at)) ||
		!Number.isFinite(Date.parse(value.expires_at)) ||
		value.consumed_at != null ||
		!isRecord(value.context_payload) ||
		!isRecord(value.prepared_surfaces) ||
		!Array.isArray(value.history_for_model)
	) {
		return null;
	}
	return value as unknown as PreparedPromptRow;
}

function parseOwnedSession(
	value: unknown,
	params: {
		userId: string;
		sessionId: string | null;
		contextType: ChatContextType;
		entityId: string | null;
	}
): ChatSession | null {
	if (!isRecord(value)) return null;
	if (
		value.id !== params.sessionId ||
		value.user_id !== params.userId ||
		value.context_type !== params.contextType ||
		(value.entity_id ?? null) !== params.entityId
	) {
		return null;
	}
	return value as unknown as ChatSession;
}

function isDatabaseMissReason(value: unknown): value is PreparedAdmissionLeaseMissReason {
	return (
		typeof value === 'string' &&
		[
			'invalid_request',
			'not_found',
			'nonce_mismatch',
			'consumed',
			'expired',
			'scope_mismatch',
			'session_mismatch',
			'access_revoked',
			'missing_context_generation',
			'stale_context',
			'stale_history',
			'checkpoint_required'
		].includes(value)
	);
}

function isRecord(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}
