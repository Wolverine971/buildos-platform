// apps/web/src/lib/services/agentic-chat-v2/context-cache.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	FASTCHAT_CONTEXT_CACHE_TTL_MS,
	buildFastChatContextCacheEntry,
	buildFastChatContextCacheKey,
	isFastChatContextCacheFresh
} from './context-cache';

describe('fastchat context cache helpers', () => {
	it('builds a stable v2 cache key from context and focus', () => {
		expect(
			buildFastChatContextCacheKey({
				contextType: 'project',
				entityId: 'project-1',
				projectFocus: {
					projectId: 'project-1',
					focusType: 'task',
					focusEntityId: 'task-1'
				}
			})
		).toBe('v2|project|project-1|task|task-1');
	});

	it('treats cache entries as fresh only inside the TTL window', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));

		const fresh = buildFastChatContextCacheEntry({
			cacheKey: 'v2|global|none|none|none',
			context: {
				contextType: 'global',
				data: { projects: [] }
			},
			createdAt: '2026-03-10T11:58:30.000Z'
		});
		const stale = buildFastChatContextCacheEntry({
			cacheKey: 'v2|global|none|none|none',
			context: {
				contextType: 'global',
				data: { projects: [] }
			},
			createdAt: new Date(Date.now() - FASTCHAT_CONTEXT_CACHE_TTL_MS - 1000).toISOString()
		});

		expect(isFastChatContextCacheFresh(fresh)).toBe(true);
		expect(isFastChatContextCacheFresh(stale)).toBe(false);

		vi.useRealTimers();
	});

	it('normalizes absent optional context fields when building cache entries', () => {
		const entry = buildFastChatContextCacheEntry({
			cacheKey: 'v2|global|none|none|none',
			context: {
				contextType: 'global'
			},
			createdAt: '2026-03-10T12:00:00.000Z'
		});

		expect(entry).toMatchObject({
			key: 'v2|global|none|none|none',
			created_at: '2026-03-10T12:00:00.000Z',
			context: {
				contextType: 'global',
				entityId: null,
				projectId: null,
				projectName: null,
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				data: null
			}
		});
	});
});
