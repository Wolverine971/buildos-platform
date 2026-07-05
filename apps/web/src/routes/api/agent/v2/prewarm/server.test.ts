// apps/web/src/routes/api/agent/v2/prewarm/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveSessionMock, loadPromptContextMock, loadRecentMessagesMock, mergeRpcMock } =
	vi.hoisted(() => ({
		resolveSessionMock: vi.fn(),
		loadPromptContextMock: vi.fn(),
		loadRecentMessagesMock: vi.fn(),
		mergeRpcMock: vi.fn()
	}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	normalizeFastContextType: (value?: string) => value ?? 'global',
	createFastChatSessionService: () => ({
		resolveSession: resolveSessionMock,
		loadRecentMessages: loadRecentMessagesMock
	}),
	loadFastChatPromptContext: loadPromptContextMock,
	composeFastChatHistory: () => ({
		historyForModel: [],
		compressed: false,
		strategy: 'raw_history',
		rawHistoryCount: 0,
		tailMessagesKept: 0,
		continuityHintUsed: false
	}),
	selectFastChatTools: () => []
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
		loadRecentMessagesMock.mockResolvedValue([]);
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

	it('builds a missing prepared prompt from fresh session context cache without reloading context', async () => {
		const cachedContext = {
			version: 1,
			key: 'global:none',
			warmed_at: '2026-03-12T00:00:00.000Z',
			context: {
				contextType: 'global',
				entityId: null,
				projectId: null,
				projectName: null,
				focusEntityType: null,
				focusEntityId: null,
				focusEntityName: null,
				data: { summary: 'cached' }
			}
		};
		const session = {
			id: 'session-1',
			user_id: 'user-1',
			context_type: 'global',
			summary: 'fresh session summary',
			agent_metadata: {
				fastchat_context_cache: cachedContext
			}
		};
		const insertedRows: Array<Record<string, unknown>> = [];
		const insertPreparedPrompt = vi.fn(async (row: Record<string, unknown>) => {
			insertedRows.push(row);
			return { error: null };
		});
		resolveSessionMock.mockResolvedValue({ session });
		loadRecentMessagesMock.mockResolvedValue([
			{
				role: 'user',
				content: 'Previous turn'
			}
		]);

		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/prewarm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					context_type: 'global',
					session_id: 'session-1',
					prepare_prompt: true
				})
			}),
			locals: {
				safeGetSession: async () => ({
					user: { id: 'user-1' }
				}),
				supabase: {
					rpc: mergeRpcMock,
					from: vi.fn((table: string) => {
						if (table === 'agentic_chat_prepared_prompts') {
							return {
								insert: insertPreparedPrompt
							};
						}
						return {
							select: vi.fn().mockReturnThis(),
							eq: vi.fn().mockReturnThis(),
							maybeSingle: vi.fn().mockResolvedValue({
								data: table === 'chat_sessions' ? session : null,
								error: null
							})
						};
					})
				}
			}
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();

		expect(loadPromptContextMock).not.toHaveBeenCalled();
		expect(loadRecentMessagesMock).toHaveBeenCalledWith('session-1', expect.any(Number));
		expect(insertPreparedPrompt).toHaveBeenCalledOnce();
		expect(insertedRows[0]).toEqual(
			expect.objectContaining({
				session_id: 'session-1',
				cache_key: 'global:none',
				context_payload: cachedContext.context,
				conversation_summary: 'fresh session summary',
				history_for_model_count: expect.any(Number)
			})
		);
		expect(payload.data).toEqual(
			expect.objectContaining({
				warmed: true,
				cache_source: 'session_cache',
				prewarmed_context: cachedContext,
				prepared_prompt: expect.objectContaining({
					key: expect.any(String),
					cache_key: 'global:none'
				})
			})
		);
	});
});
