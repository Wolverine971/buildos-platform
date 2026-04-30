// apps/web/src/routes/api/admin/chat/sessions/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

type QueryResult = {
	data: unknown;
	error: unknown;
	count?: number | null;
};

function createQuery(result: QueryResult) {
	const query: any = {
		select: vi.fn(() => query),
		gte: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn(() => query),
		eq: vi.fn(() => query),
		or: vi.fn(() => query),
		in: vi.fn(() => query),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve(result).then(onFulfilled, onRejected)
	};

	return query;
}

function createAdminSupabase(resultsByTable: Record<string, QueryResult>) {
	const queriesByTable = new Map<string, any[]>();
	const adminSupabase = {
		from: vi.fn((table: string) => {
			const query = createQuery(resultsByTable[table] ?? { data: [], error: null });
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};

	return adminSupabase;
}

describe('GET /api/admin/chat/sessions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('uses the admin Supabase client so admins can list sessions from all users', async () => {
		const adminSupabase = createAdminSupabase({
			chat_sessions: {
				data: [
					{
						id: 'session-user-1',
						user_id: 'user-1',
						title: 'Mine',
						status: 'active',
						context_type: 'global',
						message_count: 1,
						total_tokens_used: 10,
						tool_call_count: 0,
						created_at: '2026-04-29T10:00:00.000Z',
						updated_at: '2026-04-29T10:05:00.000Z',
						last_message_at: '2026-04-29T10:05:00.000Z',
						agent_metadata: {},
						extracted_entities: {},
						users: { id: 'user-1', email: 'me@example.com', name: 'Me' }
					},
					{
						id: 'session-user-2',
						user_id: 'user-2',
						auto_title: 'Theirs',
						status: 'active',
						context_type: 'project',
						message_count: 2,
						total_tokens_used: 20,
						tool_call_count: 1,
						created_at: '2026-04-29T11:00:00.000Z',
						updated_at: '2026-04-29T11:10:00.000Z',
						last_message_at: '2026-04-29T11:10:00.000Z',
						agent_metadata: {},
						extracted_entities: {},
						users: { id: 'user-2', email: 'them@example.com', name: 'Them' }
					}
				],
				error: null,
				count: 2
			},
			chat_messages: { data: [], error: null },
			chat_tool_executions: { data: [], error: null },
			llm_usage_logs: { data: [], error: null }
		});
		const requestSupabase = { from: vi.fn() };
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await GET({
			url: new URL('http://localhost/api/admin/chat/sessions?timeframe=30d'),
			locals: {
				supabase: requestSupabase,
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'admin-1', is_admin: true } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.total).toBe(2);
		expect(payload.data.sessions.map((session: any) => session.user.id)).toEqual([
			'user-1',
			'user-2'
		]);
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(requestSupabase.from).not.toHaveBeenCalled();
		expect(adminSupabase.from).toHaveBeenCalledWith('chat_sessions');
		expect(adminSupabase.from).toHaveBeenCalledWith('chat_messages');
		expect(adminSupabase.from).toHaveBeenCalledWith('chat_tool_executions');
		expect(adminSupabase.from).toHaveBeenCalledWith('llm_usage_logs');
	});

	it('does not create a service-role client for non-admin users', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/admin/chat/sessions'),
			locals: {
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'user-1', is_admin: false } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.success).toBe(false);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
