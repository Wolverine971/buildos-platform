// apps/web/src/lib/services/agentic-chat-v2/context-cache-routing.ts
import type { AgentTimingSummary, ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { buildFastChatContextCacheKey } from './context-cache';

export type FastChatContextShiftHint = {
	context_type: ChatContextType;
	entity_id?: string | null;
	project_id?: string | null;
	shifted_at: string;
};

const CONTEXT_LOAD_SOURCES = new Set<NonNullable<AgentTimingSummary['context_load_source']>>([
	'rpc',
	'rpc_null_fallback',
	'rpc_error_fallback',
	'fallback',
	'none',
	'unknown_cached'
]);

export function shouldBypassContextCacheForShiftHint(params: {
	requestContextType: ChatContextType;
	requestEntityId?: string | null;
	requestProjectFocus?: Pick<ProjectFocus, 'focusType' | 'focusEntityId' | 'projectId'> | null;
	shiftHint: FastChatContextShiftHint | null;
}): boolean {
	const { shiftHint } = params;
	if (!shiftHint) return false;
	const requestKey = buildFastChatContextCacheKey({
		contextType: params.requestContextType,
		entityId: params.requestEntityId,
		projectFocus: params.requestProjectFocus
	});
	const shiftKey = buildFastChatContextCacheKey({
		contextType: shiftHint.context_type,
		entityId: shiftHint.entity_id ?? shiftHint.project_id ?? null
	});
	return requestKey !== shiftKey;
}

export function resolveCacheAgeSeconds(
	createdAtRaw: string | null | undefined,
	nowMs: number = Date.now()
): number {
	if (!createdAtRaw) return 0;
	const createdAtMs = Date.parse(createdAtRaw);
	if (!Number.isFinite(createdAtMs)) return 0;
	return Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
}

export function normalizeContextLoadSource(
	value: unknown
): NonNullable<AgentTimingSummary['context_load_source']> {
	return typeof value === 'string' &&
		CONTEXT_LOAD_SOURCES.has(value as NonNullable<AgentTimingSummary['context_load_source']>)
		? (value as NonNullable<AgentTimingSummary['context_load_source']>)
		: 'unknown_cached';
}

export function annotateContextMetaCacheAge(
	data: Record<string, unknown> | string | null | undefined,
	cacheAgeSeconds: number
): void {
	if (!data || typeof data !== 'object') return;
	const record = data as Record<string, unknown>;
	const contextMeta =
		record.context_meta && typeof record.context_meta === 'object'
			? (record.context_meta as Record<string, unknown>)
			: null;
	if (!contextMeta) return;
	contextMeta.cache_age_seconds = Math.max(0, Math.floor(cacheAgeSeconds));
}
