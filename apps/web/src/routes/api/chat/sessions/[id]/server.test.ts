// apps/web/src/routes/api/chat/sessions/[id]/server.test.ts
import { describe, expect, it, vi } from 'vitest';

import { GET } from './+server';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockResolvedValue(result),
		single: vi.fn().mockResolvedValue(result)
	};
}

describe('GET /api/chat/sessions/[id]', () => {
	it('returns persisted tool executions when restoring a chat session', async () => {
		const session = {
			id: 'session-1',
			user_id: 'user-1',
			context_type: 'global',
			entity_id: null,
			title: 'History fix',
			auto_title: null,
			summary: null
		};
		const messages = [
			{
				id: 'assistant-1',
				session_id: 'session-1',
				user_id: 'user-1',
				role: 'assistant',
				content: 'Created the task.',
				created_at: '2026-03-28T10:01:00.000Z',
				metadata: null,
				tool_calls: null,
				tool_call_id: null
			}
		];
		const toolExecutions = [
			{
				id: 'exec-1',
				session_id: 'session-1',
				message_id: 'assistant-1',
				tool_name: 'create_onto_task',
				gateway_op: null,
				sequence_index: 1,
				arguments: { title: 'Fix history restore' },
				result: { task: { id: 'task-1', title: 'Fix history restore' } },
				execution_time_ms: 123,
				success: true,
				error_message: null,
				created_at: '2026-03-28T10:00:30.000Z'
			}
		];

		const sessionQuery = createQuery({ data: session, error: null });
		const messagesQuery = createQuery({ data: messages, error: null });
		const toolExecutionsQuery = createQuery({ data: toolExecutions, error: null });
		const supabase = {
			from: vi.fn((table: string) => {
				if (table === 'chat_sessions') return sessionQuery;
				if (table === 'chat_messages') return messagesQuery;
				if (table === 'chat_tool_executions') return toolExecutionsQuery;
				throw new Error(`Unexpected table ${table}`);
			})
		};

		const response = await GET({
			params: { id: 'session-1' },
			url: new URL('http://localhost/api/chat/sessions/session-1'),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		const payload = await response.json();
		expect(payload.data.messages).toEqual(messages);
		expect(payload.data.toolExecutions).toEqual(toolExecutions);
		expect(supabase.from).toHaveBeenCalledWith('chat_tool_executions');
		expect(toolExecutionsQuery.eq).toHaveBeenCalledWith('session_id', 'session-1');
	});
});
