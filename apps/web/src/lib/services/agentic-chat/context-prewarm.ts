// apps/web/src/lib/services/agentic-chat/context-prewarm.ts
/**
 * Shared helpers for context prewarm caching.
 */

import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { normalizeContextType } from '../../routes/api/agent/stream/utils/context-utils';

export const CONTEXT_PREWARM_TTL_MS = 5 * 60 * 1000;

export function isCacheFresh(loadedAt?: number, ttlMs: number = CONTEXT_PREWARM_TTL_MS): boolean {
	if (!loadedAt) return false;
	return Date.now() - loadedAt < ttlMs;
}

export function buildLocationCacheKey(contextType: ChatContextType, entityId?: string): string {
	const normalized = normalizeContextType(contextType);
	return `location:${normalized}:${entityId ?? 'global'}`;
}

export function buildLinkedEntitiesCacheKey(focus?: ProjectFocus | null): string | null {
	if (!focus || focus.focusType === 'project-wide' || !focus.focusEntityId) {
		return null;
	}
	return `linked:${focus.projectId}:${focus.focusType}:${focus.focusEntityId}`;
}
