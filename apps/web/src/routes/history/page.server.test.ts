// apps/web/src/routes/history/page.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createLoadEvent(options: {
	url?: string;
	rpcPayload?: Record<string, unknown>;
	rpcError?: unknown;
}) {
	const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
		if (fn !== 'get_history_page_v1') {
			throw new Error(`Unexpected RPC requested: ${fn}`);
		}

		return {
			data: options.rpcPayload ?? {
				rows: [],
				totalItems: 0,
				stats: {
					totalBraindumps: 0,
					processedBraindumps: 0,
					pendingBraindumps: 0,
					totalChatSessions: 0,
					chatSessionsWithSummary: 0
				},
				selectedRow: null,
				hasMore: false
			},
			error: options.rpcError ?? null,
			args
		};
	});
	const from = vi.fn((table: string) => {
		throw new Error(`Unexpected table requested: ${table}`);
	});
	const safeGetSession = vi.fn(async () => ({
		user: { id: USER_ID, email: 'test@example.com' }
	}));
	const depends = vi.fn();

	return {
		event: {
			url: new URL(options.url ?? 'https://app.test/history'),
			locals: {
				supabase: { rpc, from },
				safeGetSession
			},
			depends
		} as any,
		rpc,
		from,
		depends
	};
}

describe('history +page.server load', () => {
	it('streams bounded RPC data without blocking on raw history table counts', async () => {
		const { event, rpc, from, depends } = createLoadEvent({
			url: 'https://app.test/history?limit=500&offset=-20&type=unknown&search=%20strategy%20&id=not-a-uuid&itemType=chat_session',
			rpcPayload: {
				rows: [
					{
						type: 'chat_session',
						data: {
							id: '22222222-2222-4222-8222-222222222222',
							title: 'Untitled Chat',
							auto_title: 'Launch strategy',
							chat_topics: ['strategy'],
							summary: 'The conversation covered launch planning.',
							context_type: 'global',
							entity_id: null,
							message_count: 5,
							status: 'active',
							created_at: '2026-07-07T12:00:00.000Z',
							updated_at: '2026-07-07T12:01:00.000Z',
							last_message_at: '2026-07-07T12:01:00.000Z'
						}
					}
				],
				totalItems: 1,
				stats: {
					totalBraindumps: 3,
					processedBraindumps: 2,
					pendingBraindumps: 1,
					totalChatSessions: 1,
					chatSessionsWithSummary: 1
				},
				selectedRow: null,
				totalItemsExact: false,
				hasMore: false
			}
		});

		const result = await load(event);

		expect(depends).toHaveBeenCalledWith('history:data');
		expect(result.itemCount).toBe(12);
		expect(result.braindumpCount).toBe(0);
		expect(result.chatSessionCount).toBe(0);
		expect(result.filters).toMatchObject({
			limit: 100,
			offset: 0,
			typeFilter: 'all',
			search: 'strategy',
			selectedId: null,
			selectedType: 'chat_session'
		});
		expect(from).not.toHaveBeenCalled();

		const historyData = await result.historyData;

		expect(rpc).toHaveBeenCalledWith('get_history_page_v1', {
			p_user_id: USER_ID,
			p_type_filter: 'all',
			p_status: null,
			p_search: 'strategy',
			p_limit: 100,
			p_offset: 0,
			p_selected_id: null,
			p_selected_type: 'chat_session'
		});
		expect(from).not.toHaveBeenCalled();
		expect(historyData.items).toHaveLength(1);
		expect(historyData.items[0]).toMatchObject({
			id: '22222222-2222-4222-8222-222222222222',
			type: 'chat_session',
			title: 'Launch strategy',
			preview: 'The conversation covered launch planning.',
			messageCount: 5
		});
		expect(historyData.totalItems).toBe(1);
		expect(historyData.totalItemsExact).toBe(false);
		expect(historyData.stats.totalBraindumps).toBe(3);
		expect(historyData.hasMore).toBe(false);
	});

	it('drops short searches and invalid statuses before calling the RPC', async () => {
		const { event, rpc } = createLoadEvent({
			url: 'https://app.test/history?search=ai&status=unknown&type=chats&limit=20'
		});

		const result = await load(event);
		await result.historyData;

		expect(result.itemCount).toBe(12);
		expect(result.filters).toMatchObject({
			limit: 20,
			typeFilter: 'chats',
			status: null,
			search: ''
		});
		expect(rpc).toHaveBeenCalledWith('get_history_page_v1', {
			p_user_id: USER_ID,
			p_type_filter: 'chats',
			p_status: null,
			p_search: null,
			p_limit: 20,
			p_offset: 0,
			p_selected_id: null,
			p_selected_type: null
		});
	});

	it('accepts non-v4 UUIDs and caps long search filters', async () => {
		const selectedId = '018f8db4-7693-7cc8-b0c5-6b4f7e8e9abc';
		const longSearch = 'x'.repeat(150);
		const { event, rpc } = createLoadEvent({
			url: `https://app.test/history?search=${longSearch}&id=${selectedId}&itemType=braindump`
		});

		const result = await load(event);
		await result.historyData;

		expect(result.filters.selectedId).toBe(selectedId);
		expect(result.filters.search).toHaveLength(120);
		expect(rpc).toHaveBeenCalledWith('get_history_page_v1', {
			p_user_id: USER_ID,
			p_type_filter: 'all',
			p_status: null,
			p_search: 'x'.repeat(120),
			p_limit: 50,
			p_offset: 0,
			p_selected_id: selectedId,
			p_selected_type: 'braindump'
		});
	});
});
