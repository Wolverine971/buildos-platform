// apps/web/src/lib/services/agentic-chat-v2/context-cache.ts
import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { buildAgenticChatContextCacheKeyInput, normalizeAgenticChatContextType } from './scope';

export const FASTCHAT_CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000;
export const FASTCHAT_CONTEXT_CACHE_VERSION = 2;

export type FastChatPromptContextSnapshot = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	contextLoadSource?:
		| 'rpc'
		| 'rpc_null_fallback'
		| 'rpc_error_fallback'
		| 'fallback'
		| 'none'
		| 'unknown_cached';
	data?: Record<string, unknown> | string | null;
};

type FastChatContextLoadSource = NonNullable<FastChatPromptContextSnapshot['contextLoadSource']>;
const FASTCHAT_CONTEXT_LOAD_SOURCES = new Set<FastChatContextLoadSource>([
	'rpc',
	'rpc_null_fallback',
	'rpc_error_fallback',
	'fallback',
	'none',
	'unknown_cached'
]);

export type FastChatContextCache = {
	version: number;
	key: string;
	created_at: string;
	context: FastChatPromptContextSnapshot;
};

export function buildFastChatContextCacheKey(params: {
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: Pick<ProjectFocus, 'focusType' | 'focusEntityId' | 'projectId'> | null;
}): string {
	const normalized = buildAgenticChatContextCacheKeyInput(params);
	const focusType = normalized.projectFocus?.focusType ?? null;
	const focusEntityId = normalized.projectFocus?.focusEntityId ?? null;
	const projectId = normalized.projectFocus?.projectId ?? normalized.entityId ?? null;
	return [
		'v2',
		normalized.contextType,
		projectId ?? 'none',
		focusType ?? 'none',
		focusEntityId ?? 'none'
	].join('|');
}

export function isFastChatContextCacheFresh(
	cache: FastChatContextCache | null | undefined,
	nowMs: number = Date.now()
): boolean {
	if (!cache?.created_at) return false;
	const createdAt = Date.parse(cache.created_at);
	if (!Number.isFinite(createdAt)) return false;
	return nowMs - createdAt <= FASTCHAT_CONTEXT_CACHE_TTL_MS;
}

function readString(
	record: Record<string, unknown>,
	camelKey: string,
	snakeKey: string
): string | null {
	const camel = record[camelKey];
	if (typeof camel === 'string') return camel;
	const snake = record[snakeKey];
	if (typeof snake === 'string') return snake;
	return null;
}

function normalizeContextLoadSource(value: string | null): FastChatContextLoadSource | null {
	if (!value) return null;
	return FASTCHAT_CONTEXT_LOAD_SOURCES.has(value as FastChatContextLoadSource)
		? (value as FastChatContextLoadSource)
		: null;
}

/**
 * Single normalization point for context snapshots arriving from outside the
 * process (request prewarm payloads, prepared prompt rows). Accepts the
 * legacy snake_case key variants and always returns the canonical camelCase
 * `FastChatPromptContextSnapshot` shape — downstream code must never
 * dual-read casings again.
 */
export function normalizeFastChatContextSnapshot(
	raw: unknown
): FastChatPromptContextSnapshot | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const contextTypeRaw = readString(record, 'contextType', 'context_type');
	if (!contextTypeRaw) return null;

	const data = record.data;
	const contextLoadSource =
		normalizeContextLoadSource(
			readString(record, 'contextLoadSource', 'context_load_source')
		) ?? undefined;
	return {
		contextType: normalizeAgenticChatContextType(contextTypeRaw),
		entityId: readString(record, 'entityId', 'entity_id'),
		projectId: readString(record, 'projectId', 'project_id'),
		projectName: readString(record, 'projectName', 'project_name'),
		focusEntityType: readString(record, 'focusEntityType', 'focus_entity_type'),
		focusEntityId: readString(record, 'focusEntityId', 'focus_entity_id'),
		focusEntityName: readString(record, 'focusEntityName', 'focus_entity_name'),
		contextLoadSource,
		data:
			data && typeof data === 'object' && !Array.isArray(data)
				? (data as Record<string, unknown>)
				: typeof data === 'string'
					? data
					: null
	};
}

/**
 * Normalizes a client-supplied prewarmed context cache payload into the
 * canonical `FastChatContextCache` shape, or null when the payload is not a
 * usable cache entry.
 */
export function normalizeFastChatContextCache(raw: unknown): FastChatContextCache | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const record = raw as Record<string, unknown>;
	const key = typeof record.key === 'string' ? record.key : null;
	const createdAt = typeof record.created_at === 'string' ? record.created_at : null;
	const version = typeof record.version === 'number' ? record.version : null;
	if (!key || !createdAt || version === null) return null;

	const context = normalizeFastChatContextSnapshot(record.context);
	if (!context) return null;

	return {
		version,
		key,
		created_at: createdAt,
		context
	};
}

export function buildFastChatContextCacheEntry(params: {
	cacheKey: string;
	context: FastChatPromptContextSnapshot;
	createdAt?: string;
}): FastChatContextCache {
	return {
		version: FASTCHAT_CONTEXT_CACHE_VERSION,
		key: params.cacheKey,
		created_at: params.createdAt ?? new Date().toISOString(),
		context: {
			contextType: params.context.contextType,
			entityId: params.context.entityId ?? null,
			projectId: params.context.projectId ?? null,
			projectName: params.context.projectName ?? null,
			focusEntityType: params.context.focusEntityType ?? null,
			focusEntityId: params.context.focusEntityId ?? null,
			focusEntityName: params.context.focusEntityName ?? null,
			contextLoadSource: params.context.contextLoadSource ?? undefined,
			data: params.context.data ?? null
		}
	};
}
