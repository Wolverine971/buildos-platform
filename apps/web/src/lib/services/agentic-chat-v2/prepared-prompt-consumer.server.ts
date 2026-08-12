// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.server.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, ChatToolDefinition, Database } from '@buildos/shared-types';
import type { GatewaySurfaceProfileName } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import type { LitePromptScaffoldOptions } from '$lib/services/agentic-chat-lite/prompt';
import { resolveCacheAgeSeconds } from './context-cache-routing';
import {
	getPreparedPromptSurface,
	inspectPreparedPromptSurfaceCurrent,
	isPreparedPromptPrewarmEnabled,
	parsePreparedPromptKey,
	verifyPreparedPromptNonce,
	type PreparedPromptCacheMissReason,
	type PreparedPromptRow,
	type PreparedPromptSurface
} from './prepared-prompt-cache';
import {
	claimPreparedPromptContent,
	readPreparedPromptContent
} from './prepared-prompt-store.server';

type FastChatSupabaseClient = SupabaseClient<Database>;

export type PreparedPromptConsumeMissDiagnostics = {
	prepared_prompt_id?: string;
	prepared_prompt_age_seconds?: number;
	prepared_prompt_created_at?: string;
	default_surface_profile?: GatewaySurfaceProfileName;
	requested_surface_profile: GatewaySurfaceProfileName;
	prepared_surface_profiles?: string[];
	surface_available?: boolean;
	surface_created_at?: string;
	surface_age_seconds?: number;
	prepared_tool_names?: string[];
	actual_tool_names?: string[];
	prepared_tools_sha256?: string | null;
	actual_tools_sha256?: string | null;
	prepared_tool_definitions_sha256?: string | null;
	actual_tool_definitions_sha256?: string | null;
	prepared_harness_sha256?: string | null;
	actual_harness_sha256?: string | null;
	harness_match?: boolean;
	tool_names_match?: boolean;
	tool_definitions_match?: boolean;
	prepared_history_created_at?: string;
	latest_session_message_id?: string;
	latest_session_message_created_at?: string;
	prepared_history_current?: boolean;
};

type PreparedHistoryCurrencyInspection = {
	current: boolean;
	preparedHistoryCreatedAt: string;
	latestSessionMessageId?: string;
	latestSessionMessageCreatedAt?: string;
};

export type PreparedPromptConsumeResult =
	| {
			hit: true;
			row: PreparedPromptRow;
			surface: PreparedPromptSurface;
			ageSeconds: number;
	  }
	| {
			hit: false;
			reason: PreparedPromptCacheMissReason;
			diagnostics?: PreparedPromptConsumeMissDiagnostics;
	  };

export type PreparedPromptAdmissionLineage = {
	id: string;
	acceptedSurfaceProfile: GatewaySurfaceProfileName;
};

export type PreparedPromptWorkerInspectionResult =
	| {
			hit: true;
			row: PreparedPromptRow;
			surface: PreparedPromptSurface;
			ageSeconds: number;
	  }
	| {
			hit: false;
			reason: PreparedPromptCacheMissReason;
			diagnostics?: PreparedPromptConsumeMissDiagnostics;
	  };

/**
 * Derives stable, trusted hash lineage without claiming prepared content.
 *
 * Consumption and expiry are intentionally not consulted here: both are mutable
 * after a successful admission, so using either to build the canonical request
 * would turn a lost-response retry into a different hash. The later consume path
 * remains authoritative for whether prepared content can actually be used.
 */
export async function inspectPreparedPromptAdmissionLineage(params: {
	supabase: FastChatSupabaseClient;
	key: string | null;
	userId: string;
	sessionId: string;
	cacheKey: string;
	surfaceProfile: GatewaySurfaceProfileName;
}): Promise<PreparedPromptAdmissionLineage | null> {
	if (!params.key || !isPreparedPromptPrewarmEnabled()) return null;
	const parsed = parsePreparedPromptKey(params.key);
	if (!parsed) return null;

	const { row, error } = await readPreparedPromptContent({
		supabase: params.supabase,
		id: parsed.id
	});
	if (error || !row) return null;

	if (row.user_id !== params.userId) return null;
	if (!verifyPreparedPromptNonce({ nonce: parsed.nonce, nonceSha256: row.nonce_sha256 })) {
		return null;
	}
	if (row.session_id && row.session_id !== params.sessionId) return null;
	if (row.cache_key !== params.cacheKey) return null;
	if (!getPreparedPromptSurface(row, params.surfaceProfile)) return null;

	return {
		id: row.id,
		acceptedSurfaceProfile: params.surfaceProfile
	};
}

/**
 * Validate and copy a prepared prompt for worker admission without claiming it.
 *
 * The atomic admission RPC repeats these checks while holding the row lock and
 * performs the only consumption write. If this read races consumption or
 * expiry, the RPC rejects and rolls the entire admission transaction back.
 */
export async function inspectPreparedPromptForWorkerAdmission(params: {
	supabase: FastChatSupabaseClient;
	key: string | null;
	userId: string;
	sessionId: string;
	cacheKey: string;
	surfaceProfile: GatewaySurfaceProfileName;
	contextType: ChatContextType;
	tools: ChatToolDefinition[];
	scaffold?: LitePromptScaffoldOptions | null;
	nowMs?: number;
}): Promise<PreparedPromptWorkerInspectionResult> {
	if (!params.key) return { hit: false, reason: 'missing_key' };
	if (!isPreparedPromptPrewarmEnabled()) return { hit: false, reason: 'disabled' };

	const parsed = parsePreparedPromptKey(params.key);
	if (!parsed) return { hit: false, reason: 'bad_format' };

	const { row, error } = await readPreparedPromptContent({
		supabase: params.supabase,
		id: parsed.id
	});
	if (error || !row) return { hit: false, reason: 'not_found' };
	if (row.user_id !== params.userId) return { hit: false, reason: 'user_mismatch' };
	if (!verifyPreparedPromptNonce({ nonce: parsed.nonce, nonceSha256: row.nonce_sha256 })) {
		return { hit: false, reason: 'nonce_mismatch' };
	}
	if (row.consumed_at) return { hit: false, reason: 'consumed' };
	if (Date.parse(row.expires_at) <= (params.nowMs ?? Date.now())) {
		return { hit: false, reason: 'expired' };
	}
	if (row.session_id && row.session_id !== params.sessionId) {
		return { hit: false, reason: 'session_mismatch' };
	}
	if (row.cache_key !== params.cacheKey) {
		return {
			hit: false,
			reason: 'scope_mismatch',
			diagnostics: buildPreparedPromptRowDiagnostics({ row, params })
		};
	}

	const surface = getPreparedPromptSurface(row, params.surfaceProfile);
	if (!surface) {
		return {
			hit: false,
			reason: 'surface_missing',
			diagnostics: buildPreparedPromptRowDiagnostics({ row, params })
		};
	}
	const surfaceInspection = inspectPreparedPromptSurfaceCurrent({
		surface,
		contextType: params.contextType,
		contextPayload: row.context_payload,
		conversationSummary: row.conversation_summary ?? null,
		tools: params.tools,
		scaffold: params.scaffold
	});
	if (!surfaceInspection.current) {
		return {
			hit: false,
			reason: 'stale_harness',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection
			})
		};
	}
	const historyInspection = await inspectPreparedHistoryCurrency({
		supabase: params.supabase,
		row,
		userId: params.userId,
		sessionId: params.sessionId,
		skipNewestMessage: false
	});
	if (!historyInspection) {
		return {
			hit: false,
			reason: 'history_check_failed',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection
			})
		};
	}
	if (!historyInspection.current) {
		return {
			hit: false,
			reason: 'stale_history',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection,
				historyInspection
			})
		};
	}

	return {
		hit: true,
		row,
		surface,
		ageSeconds: resolveCacheAgeSeconds(row.created_at)
	};
}

export async function consumePreparedPrompt(params: {
	supabase: FastChatSupabaseClient;
	key: string | null;
	userId: string;
	sessionId: string;
	cacheKey: string;
	surfaceProfile: GatewaySurfaceProfileName;
	contextType: ChatContextType;
	tools: ChatToolDefinition[];
	scaffold?: LitePromptScaffoldOptions | null;
}): Promise<PreparedPromptConsumeResult> {
	if (!params.key) {
		return { hit: false, reason: 'missing_key' };
	}
	if (!isPreparedPromptPrewarmEnabled()) {
		return { hit: false, reason: 'disabled' };
	}

	const parsed = parsePreparedPromptKey(params.key);
	if (!parsed) {
		return { hit: false, reason: 'bad_format' };
	}

	const { row, error } = await readPreparedPromptContent({
		supabase: params.supabase,
		id: parsed.id
	});
	if (error || !row) {
		return { hit: false, reason: 'not_found' };
	}

	if (row.user_id !== params.userId) {
		return { hit: false, reason: 'user_mismatch' };
	}
	if (!verifyPreparedPromptNonce({ nonce: parsed.nonce, nonceSha256: row.nonce_sha256 })) {
		return { hit: false, reason: 'nonce_mismatch' };
	}
	if (row.consumed_at) {
		return { hit: false, reason: 'consumed' };
	}
	if (Date.parse(row.expires_at) <= Date.now()) {
		return { hit: false, reason: 'expired' };
	}
	if (row.session_id && row.session_id !== params.sessionId) {
		return { hit: false, reason: 'session_mismatch' };
	}
	if (row.cache_key !== params.cacheKey) {
		return {
			hit: false,
			reason: 'scope_mismatch',
			diagnostics: buildPreparedPromptRowDiagnostics({ row, params })
		};
	}

	const surface = getPreparedPromptSurface(row, params.surfaceProfile);
	if (!surface) {
		return {
			hit: false,
			reason: 'surface_missing',
			diagnostics: buildPreparedPromptRowDiagnostics({ row, params })
		};
	}
	const surfaceInspection = inspectPreparedPromptSurfaceCurrent({
		surface,
		contextType: params.contextType,
		contextPayload: row.context_payload,
		conversationSummary: row.conversation_summary ?? null,
		tools: params.tools,
		scaffold: params.scaffold
	});
	if (!surfaceInspection.current) {
		return {
			hit: false,
			reason: 'stale_harness',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection
			})
		};
	}
	// Legacy atomic admission has already persisted this turn's user message.
	// Skip that newest row, then compare the prepared snapshot with the latest
	// message that could have existed while the user was still composing.
	const historyInspection = await inspectPreparedHistoryCurrency({
		supabase: params.supabase,
		row,
		userId: params.userId,
		sessionId: params.sessionId,
		skipNewestMessage: true
	});
	if (!historyInspection) {
		return {
			hit: false,
			reason: 'history_check_failed',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection
			})
		};
	}
	if (!historyInspection.current) {
		return {
			hit: false,
			reason: 'stale_history',
			diagnostics: buildPreparedPromptRowDiagnostics({
				row,
				params,
				surface,
				surfaceInspection,
				historyInspection
			})
		};
	}

	const consumedAt = new Date().toISOString();
	const { claimed, error: updateError } = await claimPreparedPromptContent({
		supabase: params.supabase,
		id: row.id,
		userId: params.userId,
		consumedAt
	});
	if (updateError) {
		return { hit: false, reason: 'update_failed' };
	}
	if (!claimed) {
		return { hit: false, reason: 'consumed' };
	}

	return {
		hit: true,
		row: {
			...row,
			consumed_at: consumedAt
		},
		surface,
		ageSeconds: resolveCacheAgeSeconds(row.created_at)
	};
}

function buildPreparedPromptRowDiagnostics(params: {
	row: PreparedPromptRow;
	params: {
		surfaceProfile: GatewaySurfaceProfileName;
		tools: ChatToolDefinition[];
	};
	surface?: PreparedPromptSurface | null;
	surfaceInspection?: ReturnType<typeof inspectPreparedPromptSurfaceCurrent>;
	historyInspection?: PreparedHistoryCurrencyInspection;
}): PreparedPromptConsumeMissDiagnostics {
	const surfaceProfiles = Object.keys(params.row.prepared_surfaces ?? {});
	const surface =
		params.surface ?? getPreparedPromptSurface(params.row, params.params.surfaceProfile);
	const ageSeconds = resolveCacheAgeSeconds(params.row.created_at);
	const surfaceAgeSeconds = surface?.created_at
		? resolveCacheAgeSeconds(surface.created_at)
		: undefined;
	const inspection = params.surfaceInspection;
	const historyInspection = params.historyInspection;
	return {
		prepared_prompt_id: params.row.id,
		prepared_prompt_age_seconds: ageSeconds,
		prepared_prompt_created_at: params.row.created_at,
		default_surface_profile: params.row.default_surface_profile,
		requested_surface_profile: params.params.surfaceProfile,
		prepared_surface_profiles: surfaceProfiles,
		surface_available: Boolean(surface),
		...(surface?.created_at ? { surface_created_at: surface.created_at } : {}),
		...(surfaceAgeSeconds !== undefined ? { surface_age_seconds: surfaceAgeSeconds } : {}),
		...(surface ? { prepared_tool_names: surface.tool_names } : {}),
		...(inspection ? { actual_tool_names: inspection.actual_tool_names } : {}),
		...(surface ? { prepared_tools_sha256: surface.tools_sha256 } : {}),
		...(inspection ? { actual_tools_sha256: inspection.actual_tools_sha256 } : {}),
		...(surface ? { prepared_tool_definitions_sha256: surface.tool_definitions_sha256 } : {}),
		...(inspection
			? { actual_tool_definitions_sha256: inspection.actual_tool_definitions_sha256 }
			: {}),
		...(surface ? { prepared_harness_sha256: surface.harness_sha256 } : {}),
		...(inspection ? { actual_harness_sha256: inspection.actual_harness_sha256 } : {}),
		...(surface && inspection
			? {
					harness_match: surface.harness_sha256 === inspection.actual_harness_sha256,
					tool_names_match: surface.tools_sha256 === inspection.actual_tools_sha256,
					tool_definitions_match:
						surface.tool_definitions_sha256 ===
						inspection.actual_tool_definitions_sha256
				}
			: {}),
		...(historyInspection
			? {
					prepared_history_created_at: historyInspection.preparedHistoryCreatedAt,
					...(historyInspection.latestSessionMessageId
						? { latest_session_message_id: historyInspection.latestSessionMessageId }
						: {}),
					...(historyInspection.latestSessionMessageCreatedAt
						? {
								latest_session_message_created_at:
									historyInspection.latestSessionMessageCreatedAt
							}
						: {}),
					prepared_history_current: historyInspection.current
				}
			: {})
	};
}

async function inspectPreparedHistoryCurrency(params: {
	supabase: FastChatSupabaseClient;
	row: PreparedPromptRow;
	userId: string;
	sessionId: string;
	skipNewestMessage: boolean;
}): Promise<PreparedHistoryCurrencyInspection | null> {
	const preparedHistoryCreatedAtMs = Date.parse(params.row.created_at);
	if (!Number.isFinite(preparedHistoryCreatedAtMs)) return null;

	const query = params.supabase
		.from('chat_messages')
		.select('id, created_at')
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId)
		.order('created_at', { ascending: false })
		.limit(params.skipNewestMessage ? 2 : 1);
	const { data, error } = await query;
	if (error) return null;
	const latest = Array.isArray(data) ? data[params.skipNewestMessage ? 1 : 0] : null;
	if (!latest) {
		return {
			current: true,
			preparedHistoryCreatedAt: params.row.created_at
		};
	}
	if (typeof latest.id !== 'string' || typeof latest.created_at !== 'string') return null;
	const latestCreatedAtMs = Date.parse(latest.created_at);
	if (!Number.isFinite(latestCreatedAtMs)) return null;
	return {
		current: latestCreatedAtMs <= preparedHistoryCreatedAtMs,
		preparedHistoryCreatedAt: params.row.created_at,
		latestSessionMessageId: latest.id,
		latestSessionMessageCreatedAt: latest.created_at
	};
}
