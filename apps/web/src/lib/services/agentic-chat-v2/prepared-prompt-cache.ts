// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChatContextType, ChatToolDefinition, Json } from '@buildos/shared-types';
import type {
	LitePromptEnvelope,
	LitePromptSection,
	LitePromptContextInventory,
	LitePromptToolsSummary
} from '$lib/services/agentic-chat-lite/prompt';
import type { GatewaySurfaceProfileName } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { resolveGatewaySurfaceProfileForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';

export const PREPARED_PROMPT_CACHE_VERSION = 1;
export const PREPARED_PROMPT_KEY_PREFIX = 'pp_v1';
export const PREPARED_PROMPT_TTL_MS = 90 * 1000;

export type PreparedPromptCacheMissReason =
	| 'disabled'
	| 'missing_key'
	| 'bad_format'
	| 'not_found'
	| 'nonce_mismatch'
	| 'expired'
	| 'consumed'
	| 'user_mismatch'
	| 'session_mismatch'
	| 'scope_mismatch'
	| 'surface_missing'
	| 'update_failed'
	| 'parse_error';

export type PreparedPromptSurface = {
	surface_profile: GatewaySurfaceProfileName;
	tool_names: string[];
	tools_sha256: string | null;
	system_prompt: string;
	system_prompt_sha256: string;
	sections: LitePromptSection[];
	context_inventory: LitePromptContextInventory;
	tools_summary: LitePromptToolsSummary;
	created_at: string;
};

export type PreparedPromptResponse = {
	id: string;
	key: string;
	expires_at: string;
	cache_key: string;
	prompt_variant: string;
	default_surface_profile: GatewaySurfaceProfileName;
	prepared_surface_profiles: GatewaySurfaceProfileName[];
	system_prompt_sha256: string;
};

export type PreparedPromptRow = {
	id: string;
	user_id: string;
	session_id?: string | null;
	context_type: ChatContextType;
	entity_id?: string | null;
	project_id?: string | null;
	project_focus?: Json | null;
	cache_key: string;
	nonce_sha256: string;
	prompt_variant: string;
	context_cache_version: number;
	context_payload: Record<string, unknown>;
	conversation_summary?: string | null;
	history_for_model?: Json | null;
	history_strategy?: string | null;
	history_compressed?: boolean | null;
	raw_history_count?: number | null;
	history_for_model_count?: number | null;
	prepared_surfaces: Record<string, PreparedPromptSurface>;
	default_surface_profile: GatewaySurfaceProfileName;
	context_payload_sha256: string;
	expires_at: string;
	consumed_at?: string | null;
	created_at: string;
	updated_at?: string | null;
};

export type ParsedPreparedPromptKey = {
	id: string;
	nonce: string;
};

function parseBooleanFlag(value: string | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isPreparedPromptPrewarmEnabled(): boolean {
	return parseBooleanFlag(process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED, false);
}

export function getPreparedPromptTtlMs(): number {
	return parsePositiveInt(process.env.FASTCHAT_PREPARED_PROMPT_TTL_MS, PREPARED_PROMPT_TTL_MS);
}

export function sha256Text(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function sha256Json(value: unknown): string {
	return sha256Text(JSON.stringify(value ?? null));
}

export function buildPreparedPromptKey(id: string): {
	key: string;
	nonce: string;
	nonceSha256: string;
} {
	const nonce = randomBytes(24).toString('base64url');
	return {
		key: `${PREPARED_PROMPT_KEY_PREFIX}.${id}.${nonce}`,
		nonce,
		nonceSha256: sha256Text(nonce)
	};
}

export function parsePreparedPromptKey(value: unknown): ParsedPreparedPromptKey | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	const [prefix, id, nonce, ...rest] = trimmed.split('.');
	if (rest.length > 0 || prefix !== PREPARED_PROMPT_KEY_PREFIX || !id || !nonce) {
		return null;
	}
	if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
		return null;
	}
	return { id, nonce };
}

export function verifyPreparedPromptNonce(params: { nonce: string; nonceSha256: string }): boolean {
	const actual = Buffer.from(sha256Text(params.nonce), 'hex');
	const expected = Buffer.from(params.nonceSha256, 'hex');
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}

export function resolvePreparedSurfaceProfiles(
	contextType: ChatContextType
): GatewaySurfaceProfileName[] {
	if (contextType === 'project' || contextType === 'ontology') {
		return ['project_basic', 'project_write', 'project_document', 'project_write_document'];
	}
	return [resolveGatewaySurfaceProfileForContextType(contextType)];
}

export function resolveDefaultPreparedSurfaceProfile(
	contextType: ChatContextType
): GatewaySurfaceProfileName {
	return resolveGatewaySurfaceProfileForContextType(contextType);
}

export function buildPreparedPromptSurface(params: {
	surfaceProfile: GatewaySurfaceProfileName;
	tools: ChatToolDefinition[];
	envelope: LitePromptEnvelope;
	createdAt?: string;
}): PreparedPromptSurface {
	const toolNames = params.tools
		.map((tool) => tool.function?.name)
		.filter((name): name is string => Boolean(name));
	return {
		surface_profile: params.surfaceProfile,
		tool_names: toolNames,
		tools_sha256: toolNames.length > 0 ? sha256Json(toolNames) : null,
		system_prompt: params.envelope.systemPrompt,
		system_prompt_sha256: sha256Text(params.envelope.systemPrompt),
		sections: params.envelope.sections,
		context_inventory: params.envelope.contextInventory,
		tools_summary: params.envelope.toolsSummary,
		created_at: params.createdAt ?? new Date().toISOString()
	};
}

export function getPreparedPromptSurface(
	row: PreparedPromptRow,
	surfaceProfile: GatewaySurfaceProfileName
): PreparedPromptSurface | null {
	const surface = row.prepared_surfaces?.[surfaceProfile];
	if (!surface?.system_prompt) return null;
	return surface;
}

export function buildPreparedPromptResponse(params: {
	rowId: string;
	key: string;
	expiresAt: string;
	cacheKey: string;
	promptVariant: string;
	defaultSurfaceProfile: GatewaySurfaceProfileName;
	preparedSurfaces: Record<string, PreparedPromptSurface>;
}): PreparedPromptResponse {
	const defaultSurface = params.preparedSurfaces[params.defaultSurfaceProfile];
	return {
		id: params.rowId,
		key: params.key,
		expires_at: params.expiresAt,
		cache_key: params.cacheKey,
		prompt_variant: params.promptVariant,
		default_surface_profile: params.defaultSurfaceProfile,
		prepared_surface_profiles: Object.keys(
			params.preparedSurfaces
		) as GatewaySurfaceProfileName[],
		system_prompt_sha256: defaultSurface?.system_prompt_sha256 ?? ''
	};
}
