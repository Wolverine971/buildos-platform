// apps/web/src/lib/services/agentic-chat-v2/context-cache.ts
import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

export const FASTCHAT_CONTEXT_CACHE_TTL_MS = 2 * 60 * 1000;
export const FASTCHAT_CONTEXT_CACHE_VERSION = 1;

export type FastChatPromptContextSnapshot = {
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	projectName?: string | null;
	focusEntityType?: string | null;
	focusEntityId?: string | null;
	focusEntityName?: string | null;
	data?: Record<string, unknown> | string | null;
};

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
	const focusType = params.projectFocus?.focusType ?? null;
	const focusEntityId = params.projectFocus?.focusEntityId ?? null;
	const projectId = params.projectFocus?.projectId ?? params.entityId ?? null;
	return [
		'v2',
		params.contextType,
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
			data: params.context.data ?? null
		}
	};
}
