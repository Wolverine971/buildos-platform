// apps/web/src/lib/services/agentic-chat-v2/materialized-context-cache.server.ts
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, Database, Json, ProjectFocus } from '@buildos/shared-types';
import {
	FASTCHAT_CONTEXT_CACHE_VERSION,
	buildFastChatContextCacheEntry,
	isFastChatContextCacheFresh,
	normalizeFastChatContextSnapshot,
	type FastChatContextCache,
	type FastChatPromptContextSnapshot
} from './context-cache';

type FastChatSupabaseClient = SupabaseClient<Database>;

type MaterializedContextSnapshotRow = {
	user_id: string;
	cache_key: string;
	context_type: string;
	entity_id: string | null;
	project_id: string | null;
	project_focus: Json | null;
	context_cache_version: number;
	invalidation_token: string;
	context_payload: Json;
	context_payload_sha256: string;
	expires_at: string;
	created_at: string;
	updated_at: string;
};

export type MaterializedContextCacheSource = 'session_cache' | 'materialized_cache' | 'fresh_load';

export type MaterializedContextResolution = {
	cache: FastChatContextCache;
	cacheSource: MaterializedContextCacheSource;
	invalidationToken: string | null;
};

const CACHEABLE_CONTEXT_TYPES = new Set<ChatContextType>(['global', 'project', 'ontology']);
const MATERIALIZED_CONTEXT_TTL_MS = positiveInt(
	process.env.FASTCHAT_MATERIALIZED_CONTEXT_TTL_MS,
	15 * 60 * 1000,
	24 * 60 * 60 * 1000
);

export async function resolveMaterializedFastChatContext(params: {
	sourceSupabase: FastChatSupabaseClient;
	storeSupabase: FastChatSupabaseClient;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectFocus?: ProjectFocus | null;
	cacheKey: string;
	sessionCache?: FastChatContextCache | null;
	loadFresh: () => Promise<FastChatPromptContextSnapshot>;
	nowMs?: number;
	onWarning?: (message: string, error: unknown) => void;
}): Promise<MaterializedContextResolution> {
	const nowMs = params.nowMs ?? Date.now();
	const supportsMaterialization = CACHEABLE_CONTEXT_TYPES.has(params.contextType);
	const initialToken = supportsMaterialization
		? await resolveInvalidationToken(params).catch((error) => {
				params.onWarning?.('Failed to resolve context invalidation token', error);
				return null;
			})
		: null;

	if (
		initialToken &&
		params.sessionCache?.version === FASTCHAT_CONTEXT_CACHE_VERSION &&
		params.sessionCache.key === params.cacheKey &&
		params.sessionCache.invalidation_token === initialToken &&
		isFastChatContextCacheFresh(params.sessionCache, nowMs)
	) {
		return {
			cache: params.sessionCache,
			cacheSource: 'session_cache',
			invalidationToken: initialToken
		};
	}

	if (initialToken) {
		const materialized = await readMaterializedSnapshot(params).catch((error) => {
			params.onWarning?.('Failed to read materialized context snapshot', error);
			return null;
		});
		if (
			materialized &&
			materialized.context_cache_version === FASTCHAT_CONTEXT_CACHE_VERSION &&
			materialized.invalidation_token === initialToken &&
			Date.parse(materialized.expires_at) > nowMs &&
			materialized.context_payload_sha256 === sha256Json(materialized.context_payload)
		) {
			const normalized = normalizeFastChatContextSnapshot(materialized.context_payload);
			if (normalized) {
				return {
					cache: buildFastChatContextCacheEntry({
						cacheKey: params.cacheKey,
						context: normalized,
						createdAt: new Date(nowMs).toISOString(),
						invalidationToken: initialToken,
						materializedAt: materialized.created_at
					}),
					cacheSource: 'materialized_cache',
					invalidationToken: initialToken
				};
			}
		}
	}

	let context = await params.loadFresh();
	let finalToken = initialToken;
	if (initialToken) {
		const tokenAfterLoad = await resolveInvalidationToken(params).catch((error) => {
			params.onWarning?.('Failed to recheck context invalidation token', error);
			return null;
		});
		if (tokenAfterLoad && tokenAfterLoad !== initialToken) {
			// A source row changed while the snapshot was being assembled. Reload once
			// under the new generation rather than publishing known-stale context.
			context = await params.loadFresh();
		}
		finalToken = tokenAfterLoad;
	}

	const materializedAt = new Date(nowMs).toISOString();
	const cache = buildFastChatContextCacheEntry({
		cacheKey: params.cacheKey,
		context,
		createdAt: materializedAt,
		invalidationToken: finalToken,
		materializedAt
	});

	if (finalToken) {
		await writeMaterializedSnapshot({
			...params,
			cache,
			invalidationToken: finalToken,
			nowMs
		}).catch((error) => {
			params.onWarning?.('Failed to write materialized context snapshot', error);
		});
	}

	return {
		cache,
		cacheSource: 'fresh_load',
		invalidationToken: finalToken
	};
}

async function resolveInvalidationToken(params: {
	sourceSupabase: FastChatSupabaseClient;
	userId: string;
	contextType: ChatContextType;
	projectId?: string | null;
}): Promise<string | null> {
	const { data, error } = await params.sourceSupabase.rpc(
		'get_agentic_chat_context_invalidation_token',
		{
			p_context_type: params.contextType,
			p_user_id: params.userId,
			p_project_id: params.projectId ?? null
		}
	);
	if (error) throw error;
	return typeof data === 'string' && data.length > 0 ? data : null;
}

async function readMaterializedSnapshot(params: {
	storeSupabase: FastChatSupabaseClient;
	userId: string;
	cacheKey: string;
}): Promise<MaterializedContextSnapshotRow | null> {
	const { data, error } = await params.storeSupabase
		.from('agentic_chat_context_snapshots')
		.select('*')
		.eq('user_id', params.userId)
		.eq('cache_key', params.cacheKey)
		.maybeSingle();
	if (error) throw error;
	return (data as MaterializedContextSnapshotRow | null) ?? null;
}

async function writeMaterializedSnapshot(params: {
	storeSupabase: FastChatSupabaseClient;
	userId: string;
	cacheKey: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectFocus?: ProjectFocus | null;
	cache: FastChatContextCache;
	invalidationToken: string;
	nowMs: number;
}): Promise<void> {
	const contextPayload = params.cache.context as unknown as Json;
	const createdAt = new Date(params.nowMs).toISOString();
	const { error } = await params.storeSupabase.from('agentic_chat_context_snapshots').upsert(
		{
			user_id: params.userId,
			cache_key: params.cacheKey,
			context_type: params.contextType,
			entity_id: params.entityId ?? null,
			project_id: params.projectId ?? null,
			project_focus: (params.projectFocus ?? null) as unknown as Json,
			context_cache_version: FASTCHAT_CONTEXT_CACHE_VERSION,
			invalidation_token: params.invalidationToken,
			context_payload: contextPayload,
			context_payload_sha256: sha256Json(contextPayload),
			expires_at: new Date(params.nowMs + MATERIALIZED_CONTEXT_TTL_MS).toISOString(),
			created_at: createdAt,
			updated_at: createdAt
		},
		{ onConflict: 'user_id,cache_key' }
	);
	if (error) throw error;
}

function sha256Json(value: unknown): string {
	return createHash('sha256')
		.update(stableStringify(value ?? null))
		.digest('hex');
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

function positiveInt(value: string | undefined, fallback: number, maximum: number): number {
	if (!value) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}
