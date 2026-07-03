// apps/web/src/routes/api/admin/users/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

import { GET } from './+server';

type Row = Record<string, unknown>;
type Filter =
	| { type: 'eq'; column: string; value: unknown }
	| { type: 'in'; column: string; values: unknown[] }
	| { type: 'is'; column: string; value: unknown }
	| { type: 'not'; column: string; operator: string; value: unknown };

function createQuery(table: string, rowsByTable: Record<string, Row[]>) {
	const filters: Filter[] = [];
	let rangeStart: number | null = null;
	let rangeEnd: number | null = null;

	const applyFilters = () => {
		let rows = [...(rowsByTable[table] ?? [])];
		for (const filter of filters) {
			if (filter.type === 'eq') {
				rows = rows.filter((row) => row[filter.column] === filter.value);
			} else if (filter.type === 'in') {
				rows = rows.filter((row) => filter.values.includes(row[filter.column]));
			} else if (filter.type === 'is') {
				rows = rows.filter((row) => row[filter.column] === filter.value);
			} else if (filter.type === 'not' && filter.operator === 'is') {
				rows = rows.filter((row) => row[filter.column] !== filter.value);
			}
		}
		return rows;
	};

	const applyRange = (rows: Row[]) => {
		if (rangeStart === null || rangeEnd === null) return rows;
		return rows.slice(rangeStart, rangeEnd + 1);
	};

	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn((column: string, value: unknown) => {
			filters.push({ type: 'eq', column, value });
			return query;
		}),
		in: vi.fn((column: string, values: unknown[]) => {
			filters.push({ type: 'in', column, values });
			return query;
		}),
		is: vi.fn((column: string, value: unknown) => {
			filters.push({ type: 'is', column, value });
			return query;
		}),
		not: vi.fn((column: string, operator: string, value: unknown) => {
			filters.push({ type: 'not', column, operator, value });
			return query;
		}),
		or: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn((from: number, to: number) => {
			rangeStart = from;
			rangeEnd = to;
			return query;
		}),
		then: (onFulfilled: any, onRejected: any) => {
			const filteredRows = applyFilters();
			return Promise.resolve({
				data: applyRange(filteredRows),
				error: null,
				count: filteredRows.length
			}).then(onFulfilled, onRejected);
		}
	};

	return query;
}

function createSupabase(rowsByTable: Record<string, Row[]>) {
	const queriesByTable = new Map<string, any[]>();
	const supabase = {
		from: vi.fn((table: string) => {
			const query = createQuery(table, rowsByTable);
			queriesByTable.set(table, [...(queriesByTable.get(table) ?? []), query]);
			return query;
		}),
		queriesByTable
	};

	return supabase;
}

describe('GET /api/admin/users', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('counts current and legacy chat activity for every listed user using the admin client', async () => {
		const adminSupabase = createSupabase({
			users: [
				{
					id: 'admin-user',
					email: 'admin@example.com',
					name: 'Admin',
					is_admin: true,
					created_at: '2026-06-01T00:00:00.000Z',
					updated_at: '2026-06-01T00:00:00.000Z',
					bio: null,
					onboarding_completed_at: '2026-06-01T00:00:00.000Z',
					last_visit: '2026-06-27T00:00:00.000Z'
				},
				{
					id: 'user-2',
					email: 'other@example.com',
					name: 'Other User',
					is_admin: false,
					created_at: '2026-06-02T00:00:00.000Z',
					updated_at: '2026-06-02T00:00:00.000Z',
					bio: null,
					onboarding_completed_at: null,
					last_visit: '2026-06-28T00:00:00.000Z'
				}
			],
			onto_actors: [],
			onto_projects: [],
			user_calendar_tokens: [],
			chat_sessions: [
				{
					id: 'admin-chat',
					user_id: 'admin-user',
					message_count: 0
				},
				{
					id: 'user-chat-with-rows',
					user_id: 'user-2',
					message_count: 0
				},
				{
					id: 'user-chat-counter-only',
					user_id: 'user-2',
					message_count: 4
				}
			],
			chat_messages: [
				{ session_id: 'admin-chat', user_id: 'admin-user' },
				{ session_id: 'user-chat-with-rows', user_id: 'user-2' },
				{ session_id: 'user-chat-with-rows', user_id: 'user-2' }
			],
			agent_chat_sessions: [
				{
					id: 'legacy-agent-session',
					user_id: 'user-2',
					message_count: 0
				}
			],
			agent_chat_messages: [{ agent_session_id: 'legacy-agent-session', user_id: 'user-2' }],
			user_brief_preferences: [],
			ontology_daily_briefs: [],
			onto_tasks: [],
			onto_goals: [],
			onto_plans: [],
			onto_documents: [],
			onto_milestones: [],
			onto_risks: [],
			onto_requirements: [],
			user_sms_preferences: []
		});
		const requestSupabase = { from: vi.fn() };
		createAdminSupabaseClientMock.mockReturnValue(adminSupabase);

		const response = await GET({
			url: new URL('http://localhost/api/admin/users?page=1&limit=20'),
			locals: {
				supabase: requestSupabase,
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'admin-user', is_admin: true } })
			}
		} as any);
		const payload = await response.json();
		const adminUser = payload.data.users.find((user: any) => user.id === 'admin-user');
		const otherUser = payload.data.users.find((user: any) => user.id === 'user-2');

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(adminUser).toMatchObject({
			agentic_session_count: 1,
			agentic_message_count: 1,
			chat_session_count: 1,
			chat_message_count: 1
		});
		expect(otherUser).toMatchObject({
			agentic_session_count: 3,
			agentic_message_count: 7,
			chat_session_count: 3,
			chat_message_count: 7
		});
		expect(createAdminSupabaseClientMock).toHaveBeenCalledTimes(1);
		expect(requestSupabase.from).not.toHaveBeenCalled();
		expect(adminSupabase.from).toHaveBeenCalledWith('chat_sessions');
		expect(adminSupabase.from).toHaveBeenCalledWith('chat_messages');
		expect(adminSupabase.from).toHaveBeenCalledWith('agent_chat_sessions');
		expect(adminSupabase.from).toHaveBeenCalledWith('agent_chat_messages');
	});

	it('does not create a service-role client for non-admin users', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/admin/users'),
			locals: {
				supabase: { from: vi.fn() },
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
