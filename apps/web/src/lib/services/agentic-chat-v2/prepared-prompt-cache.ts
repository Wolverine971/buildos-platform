// apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ChatContextType, ChatToolDefinition, Database } from '@buildos/shared-types';
import type {
	LitePromptEnvelope,
	LitePromptSection,
	LitePromptContextInventory,
	LitePromptToolsSummary
} from '$lib/services/agentic-chat-lite/prompt';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import type { GatewaySurfaceProfileName } from '$lib/services/agentic-chat/tools/core/gateway-surface';
import { resolveGatewaySurfaceProfileForContextType } from '$lib/services/agentic-chat/tools/core/gateway-surface';

export const PREPARED_PROMPT_CACHE_VERSION = 1;
export const PREPARED_PROMPT_KEY_PREFIX = 'pp_v1';
export const PREPARED_PROMPT_TTL_MS = 90 * 1000;
const PREPARED_PROMPT_FOCUS_STRING_MAX_CHARS = 1_500;

export type PreparedPromptSectionSummary = Omit<LitePromptSection, 'content'> & {
	content_sha256: string;
	content_chars: number;
};

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
	| 'stale_harness'
	| 'surface_missing'
	| 'update_failed'
	| 'parse_error';

export type PreparedPromptSurface = {
	surface_profile: GatewaySurfaceProfileName;
	tool_names: string[];
	tools_sha256: string | null;
	tool_definitions_sha256: string | null;
	harness_sha256: string;
	system_prompt: string;
	system_prompt_sha256: string;
	sections: PreparedPromptSectionSummary[];
	context_inventory: LitePromptContextInventory;
	tools_summary: LitePromptToolsSummary;
	created_at: string;
};

export type PreparedPromptSurfaceCurrentInspection = {
	current: boolean;
	actual_tool_names: string[];
	actual_tools_sha256: string | null;
	actual_tool_definitions_sha256: string | null;
	actual_harness_sha256: string;
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

type PreparedPromptTableRow = Database['public']['Tables']['agentic_chat_prepared_prompts']['Row'];

export type PreparedPromptRow = Omit<
	PreparedPromptTableRow,
	'context_type' | 'context_payload' | 'prepared_surfaces' | 'default_surface_profile'
> & {
	context_type: ChatContextType;
	context_payload: Record<string, unknown>;
	prepared_surfaces: Record<string, PreparedPromptSurface>;
	default_surface_profile: GatewaySurfaceProfileName;
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

// Default flipped false → true on 2026-06-11 for a measured rollout: telemetry
// showed 0 hits / 60 misses (all `missing_key`) because the flag had never
// been enabled. As of the 2026-06-22 cleanup, keep default-on until live
// prepared_prompt_hit + time_to_first_response by cache_source are reviewed.
// Set FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED=false as the rollback override.
export function isPreparedPromptPrewarmEnabled(): boolean {
	return parseBooleanFlag(process.env.FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED, true);
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

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}

function sha256ToolDefinitions(tools: ChatToolDefinition[]): string | null {
	return tools.length > 0 ? sha256Text(stableStringify(tools)) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function cloneJsonRecord(value: Record<string, unknown>): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function truncatePreparedPromptString(value: string): string {
	if (value.length <= PREPARED_PROMPT_FOCUS_STRING_MAX_CHARS) return value;
	return `${value.slice(0, PREPARED_PROMPT_FOCUS_STRING_MAX_CHARS)}...`;
}

function compactPreparedPromptFocusEntity(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {};
	const allowedKeys = new Set([
		'id',
		'project_id',
		'title',
		'name',
		'description',
		'summary',
		'state_key',
		'type_key',
		'priority',
		'start_at',
		'due_at',
		'target_date',
		'completed_at',
		'created_at',
		'updated_at',
		'content_length',
		'content_preview'
	]);
	const output: Record<string, unknown> = {};
	for (const key of allowedKeys) {
		if (!(key in value)) continue;
		const field = value[key];
		if (typeof field === 'string') {
			output[key] = truncatePreparedPromptString(field);
		} else if (field === null || typeof field === 'number' || typeof field === 'boolean') {
			output[key] = field;
		}
	}
	return output;
}

export function compactPreparedPromptContextPayload<T extends Record<string, unknown>>(
	contextPayload: T
): T {
	const compacted = cloneJsonRecord(contextPayload) as T;
	const data = compacted.data;
	if (isRecord(data) && 'focus_entity_full' in data) {
		data.focus_entity_full = compactPreparedPromptFocusEntity(data.focus_entity_full);
	}
	return compacted;
}

function summarizePreparedPromptSections(
	sections: LitePromptSection[]
): PreparedPromptSectionSummary[] {
	return sections.map(({ content, ...section }) => ({
		...section,
		content_sha256: sha256Text(content),
		content_chars: content.length
	}));
}

function buildPreparedPromptHarnessSha(params: {
	contextType: ChatContextType;
	contextPayload: Record<string, unknown>;
	conversationSummary?: string | null;
	tools: ChatToolDefinition[];
}): string {
	const canonicalEnvelope = buildLitePromptEnvelope({
		...params.contextPayload,
		contextType: params.contextType,
		conversationSummary: params.conversationSummary ?? null,
		tools: params.tools,
		now: '2026-01-01T00:00:00.000Z',
		timezone: 'UTC',
		productSurface: '__prepared_prompt_canonical__',
		conversationPosition: 'prepared prompt canonical'
	});

	return sha256Text(
		stableStringify({
			systemPrompt: canonicalEnvelope.systemPrompt,
			tools: params.tools
		})
	);
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
	contextType: ChatContextType;
	contextPayload: Record<string, unknown>;
	conversationSummary?: string | null;
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
		tool_definitions_sha256: sha256ToolDefinitions(params.tools),
		harness_sha256: buildPreparedPromptHarnessSha({
			contextType: params.contextType,
			contextPayload: params.contextPayload,
			conversationSummary: params.conversationSummary ?? null,
			tools: params.tools
		}),
		system_prompt: params.envelope.systemPrompt,
		system_prompt_sha256: sha256Text(params.envelope.systemPrompt),
		sections: summarizePreparedPromptSections(params.envelope.sections),
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

export function isPreparedPromptSurfaceCurrent(params: {
	surface: PreparedPromptSurface;
	contextType: ChatContextType;
	contextPayload: Record<string, unknown>;
	conversationSummary?: string | null;
	tools: ChatToolDefinition[];
}): boolean {
	return inspectPreparedPromptSurfaceCurrent(params).current;
}

export function inspectPreparedPromptSurfaceCurrent(params: {
	surface: PreparedPromptSurface;
	contextType: ChatContextType;
	contextPayload: Record<string, unknown>;
	conversationSummary?: string | null;
	tools: ChatToolDefinition[];
}): PreparedPromptSurfaceCurrentInspection {
	const actualToolNames = params.tools
		.map((tool) => tool.function?.name)
		.filter((name): name is string => Boolean(name));
	const actualHarnessSha256 = buildPreparedPromptHarnessSha({
		contextType: params.contextType,
		contextPayload: params.contextPayload,
		conversationSummary: params.conversationSummary ?? null,
		tools: params.tools
	});
	return {
		current: params.surface.harness_sha256 === actualHarnessSha256,
		actual_tool_names: actualToolNames,
		actual_tools_sha256: actualToolNames.length > 0 ? sha256Json(actualToolNames) : null,
		actual_tool_definitions_sha256: sha256ToolDefinitions(params.tools),
		actual_harness_sha256: actualHarnessSha256
	};
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
