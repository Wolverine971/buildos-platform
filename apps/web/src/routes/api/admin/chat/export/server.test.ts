// apps/web/src/routes/api/admin/chat/export/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, logSecurityEventMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	logSecurityEventMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));
vi.mock('$lib/server/admin-chat-dashboard-analytics', () => ({
	getAdminChatDashboardAnalytics: vi.fn(async () => ({ overview: {} }))
}));
vi.mock('$lib/server/admin-llm-usage-analytics', () => ({
	getAdminLlmUsageStats: vi.fn(async () => ({ totals: {} }))
}));
vi.mock('$lib/server/security-event-logger', () => ({
	logSecurityEventBlocking: logSecurityEventMock,
	getSecurityRequestContext: () => ({ requestId: null, ipAddress: null, userAgent: null })
}));

import { GET } from './+server';

function createAdminClient(rowsByTable: Record<string, unknown[]>) {
	return {
		from: vi.fn((table: string) => {
			const result = { data: rowsByTable[table] ?? [], error: null };
			const query: any = {
				then: (onFulfilled: any, onRejected: any) =>
					Promise.resolve(result).then(onFulfilled, onRejected)
			};
			for (const method of ['select', 'gte', 'lte', 'order', 'range', 'or', 'in', 'eq']) {
				query[method] = vi.fn(() => query);
			}
			return query;
		})
	};
}

const googleEvents = {
	events: [
		{
			source: 'google',
			external_event_id: 'g-1',
			title: 'Custody hearing',
			event: { summary: 'Custody hearing', location: 'Courtroom 4B' }
		}
	],
	google_event_count: 1
};

const call = (format: string) =>
	GET({
		url: new URL(`http://localhost/api/admin/chat/export?format=${format}&timeframe=7d`),
		request: new Request('http://localhost/api/admin/chat/export'),
		locals: {
			supabase: {
				from: vi.fn(() => {
					const query: any = {
						select: vi.fn(() => query),
						eq: vi.fn(() => query),
						single: vi.fn(async () => ({ data: { user_id: 'admin-1' }, error: null }))
					};
					return query;
				})
			},
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
		}
	} as any);

describe('GET /api/admin/chat/export', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createAdminSupabaseClientMock.mockReturnValue(
			createAdminClient({
				chat_sessions: [{ id: 'session-1', user_id: 'user-1', users: { email: 'u@x.co' } }],
				chat_tool_executions: [
					{
						id: 'tool-1',
						session_id: 'session-1',
						tool_name: 'web_search',
						arguments: { query: 'custody lawyer' },
						result: {
							query: 'custody lawyer',
							answer: 'Hire the one with the best reviews',
							results: [
								{ url: 'https://law.example', title: 'Law', snippet: 'Top rated' }
							]
						}
					}
				],
				chat_turn_events: [
					{
						id: 'event-1',
						session_id: 'session-1',
						event_type: 'tool_result',
						payload: {
							type: 'tool_result',
							result: { tool_name: 'list_calendar_events', result: googleEvents }
						}
					}
				]
			})
		);
	});

	it('exports stored traces of pass-through tool results and records the export', async () => {
		const response = await call('json');
		expect(response.status).toBe(200);
		const body = await response.json();
		const serialized = JSON.stringify(body);
		for (const content of ['Custody hearing', 'Courtroom', 'best reviews', 'Top rated']) {
			expect(serialized).not.toContain(content);
		}
		expect(body.chat_tool_executions[0]).toMatchObject({
			arguments: { query: 'custody lawyer' },
			result: {
				result_count: 1,
				results: [{ url: 'https://law.example', title: 'Law' }],
				content_redacted: true
			}
		});
		expect(body.chat_turn_events[0].payload.result.result).toMatchObject({
			google_event_count: 1,
			events: [{ source: 'google', external_event_id: 'g-1' }],
			content_redacted: true
		});
		expect(logSecurityEventMock).toHaveBeenCalledWith(
			expect.objectContaining({
				eventType: 'admin.chat_content.exported',
				actorUserId: 'admin-1',
				targetType: 'chat_export',
				metadata: expect.objectContaining({
					route: '/api/admin/chat/export',
					target_user_ids: ['user-1'],
					rows: expect.objectContaining({ tool_executions: 1, turn_events: 1 }),
					format: 'json',
					timeframe: '7d'
				})
			})
		);
	});

	it('records CSV exports too and rejects unknown formats without a record', async () => {
		expect((await call('csv')).status).toBe(200);
		expect(logSecurityEventMock).toHaveBeenCalledOnce();
		logSecurityEventMock.mockClear();
		expect((await call('xml')).status).toBe(400);
		expect(logSecurityEventMock).not.toHaveBeenCalled();
	});
});
