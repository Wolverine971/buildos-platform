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
}): PreparedPromptConsumeMissDiagnostics {
	const surfaceProfiles = Object.keys(params.row.prepared_surfaces ?? {});
	const surface =
		params.surface ?? getPreparedPromptSurface(params.row, params.params.surfaceProfile);
	const ageSeconds = resolveCacheAgeSeconds(params.row.created_at);
	const surfaceAgeSeconds = surface?.created_at
		? resolveCacheAgeSeconds(surface.created_at)
		: undefined;
	const inspection = params.surfaceInspection;
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
			: {})
	};
}
