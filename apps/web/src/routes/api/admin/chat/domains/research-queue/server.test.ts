// apps/web/src/routes/api/admin/chat/domains/research-queue/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

function createQueueQuery(result: { data: unknown[]; error: unknown; count?: number | null }) {
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn(() => query),
		or: vi.fn(() => query),
		order: vi.fn(() => query),
		range: vi.fn(() => query),
		then: (onFulfilled: any, onRejected: any) =>
			Promise.resolve(result).then(onFulfilled, onRejected)
	};
	return query;
}

function createSupabase({
	isAdmin = true,
	rows = []
}: {
	isAdmin?: boolean;
	rows?: unknown[];
} = {}) {
	const queueQuery = createQueueQuery({ data: rows, error: null, count: rows.length });
	const supabase = {
		queueQuery,
		from: vi.fn((table: string) => {
			if (table === 'admin_users') {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					single: vi.fn().mockResolvedValue({
						data: isAdmin ? { user_id: 'admin-1' } : null,
						error: isAdmin ? null : { message: 'not found' }
					})
				};
			}
			if (table === 'domain_research_queue') return queueQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
	return supabase;
}

describe('GET /api/admin/chat/domains/research-queue', () => {
	it('lists queue rows for admins with bounded filters', async () => {
		const supabase = createSupabase({
			rows: [
				{
					id: 'queue-1',
					queue_key: 'skill:youtube_channel_diagnostics',
					kind: 'skill',
					status: 'queued',
					priority: 'medium',
					domain_ids: ['marketing.youtube_growth'],
					missing_skill_id: 'youtube_channel_diagnostics',
					user_need: 'diagnose channel blockers',
					summary: 'No diagnostics skill exists.',
					evidence: [],
					source_session_ids: [],
					source_user_count: 0,
					occurrences: 2,
					first_seen_at: '2026-05-17T12:00:00.000Z',
					last_seen_at: '2026-05-17T13:00:00.000Z',
					budget: {},
					created_at: '2026-05-17T12:00:00.000Z',
					updated_at: '2026-05-17T13:00:00.000Z'
				}
			]
		});

		const response = await GET({
			url: new URL(
				'http://localhost/api/admin/chat/domains/research-queue?status=queued&kind=skill&priority=medium&search=YouTube, growth&limit=500'
			),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.filters.limit).toBe(200);
		expect(payload.data.overview.status_counts.queued).toBe(1);
		expect(supabase.queueQuery.eq).toHaveBeenCalledWith('status', 'queued');
		expect(supabase.queueQuery.eq).toHaveBeenCalledWith('kind', 'skill');
		expect(supabase.queueQuery.eq).toHaveBeenCalledWith('priority', 'medium');
		expect(supabase.queueQuery.or).toHaveBeenCalledWith(
			'queue_key.ilike.%YouTube growth%,user_need.ilike.%YouTube growth%,summary.ilike.%YouTube growth%'
		);
		expect(supabase.queueQuery.order).toHaveBeenCalledWith('last_seen_at', {
			ascending: false
		});
		expect(supabase.queueQuery.range).toHaveBeenCalledWith(0, 199);
	});

	it('rejects non-admin users', async () => {
		const response = await GET({
			url: new URL('http://localhost/api/admin/chat/domains/research-queue'),
			locals: {
				supabase: createSupabase({ isAdmin: false }),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(403);
	});
});
