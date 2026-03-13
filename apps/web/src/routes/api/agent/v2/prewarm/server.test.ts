// apps/web/src/routes/api/agent/v2/prewarm/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveSessionMock, loadPromptContextMock, mergeRpcMock } = vi.hoisted(() => ({
	resolveSessionMock: vi.fn(),
	loadPromptContextMock: vi.fn(),
	mergeRpcMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	normalizeFastContextType: (value?: string) => value ?? 'global',
	createFastChatSessionService: () => ({
		resolveSession: resolveSessionMock
	}),
	loadFastChatPromptContext: loadPromptContextMock
}));

vi.mock('$lib/services/agentic-chat-v2/context-cache', () => ({
	FASTCHAT_CONTEXT_CACHE_VERSION: 1,
	buildFastChatContextCacheKey: ({
		contextType,
		entityId
	}: {
		contextType: string;
		entityId?: string | null;
	}) => `${contextType}:${entityId ?? 'none'}`,
	buildFastChatContextCacheEntry: ({
		cacheKey,
		context
	}: {
		cacheKey: string;
		context: Record<string, unknown>;
	}) => ({
		version: 1,
		key: cacheKey,
		warmed_at: '2026-03-12T00:00:00.000Z',
		context
	}),
	isFastChatContextCacheFresh: () => true
}));

import { POST } from './+server';

describe('POST /api/agent/v2/prewarm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resolveSessionMock.mockResolvedValue({
			session: {
				id: 'session-1',
				user_id: 'user-1',
				context_type: 'global',
				agent_metadata: null
			}
		});
		loadPromptContextMock.mockResolvedValue({
			contextType: 'global',
			entityId: null,
			projectId: null,
			projectName: null,
			focusEntityType: null,
			focusEntityId: null,
			focusEntityName: null,
			data: { summary: 'ready' }
		});
		mergeRpcMock.mockResolvedValue({ error: null });
	});

	it('ensures a session when ensure_session is requested', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/prewarm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					context_type: 'global',
					ensure_session: true
				})
			}),
			locals: {
				safeGetSession: async () => ({
					user: { id: 'user-1' }
				}),
				supabase: {
					rpc: mergeRpcMock,
					from: vi.fn(() => ({
						select: vi.fn().mockReturnThis(),
						eq: vi.fn().mockReturnThis(),
						maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
					}))
				}
			}
		} as any);

		expect(response.status).toBe(200);

		const payload = await response.json();
		expect(resolveSessionMock).toHaveBeenCalledWith(
			expect.objectContaining({
				sessionId: undefined,
				userId: 'user-1',
				contextType: 'global'
			})
		);
		expect(payload.data.session.id).toBe('session-1');
		expect(payload.data.prewarmed_context.key).toBe('global:none');
		expect(mergeRpcMock).toHaveBeenCalledWith(
			'merge_chat_session_agent_metadata',
			expect.objectContaining({
				p_session_id: 'session-1'
			})
		);
	});
});
