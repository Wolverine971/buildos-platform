// apps/web/src/routes/api/inbox/done-for-you/server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/config/project-loops', () => ({ PROJECT_LOOPS_ENABLED: true }));

import { GET } from './+server';

function queryReturning(rows: unknown[]) {
	return Object.assign(Promise.resolve({ data: rows, error: null }), {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		gte: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis()
	});
}

describe('GET /api/inbox/done-for-you', () => {
	it('lists cleanup and calendar changes newest first, skipping undone suggestions', async () => {
		const cleanup = queryReturning([
			{
				id: 's1',
				project_id: 'p1',
				project: { name: 'Wayne Strategies' },
				kind: 'doc_org',
				title: 'Move brief',
				lineage_id: 'lin-1',
				applied_at: '2026-10-29T10:00:00Z',
				reversible: true,
				result: { applied_via: 'auto', headline: 'Move "Brief" under "Client Work"' }
			},
			{
				id: 's2',
				project_id: 'p1',
				project: { name: 'Wayne Strategies' },
				kind: 'doc_outdated',
				title: 'Archive Book Research',
				lineage_id: 'lin-2',
				applied_at: '2026-10-29T09:00:00Z',
				reversible: true,
				result: { applied_via: 'auto', undone_at: '2026-10-29T09:30:00Z' }
			}
		]);
		const calendar = queryReturning([
			{
				id: 'cal-1',
				project_id: 'p2',
				project: { name: 'Events' },
				title: 'Rescheduled kickoff',
				applied_at: '2026-10-29T11:00:00Z'
			}
		]);
		const tables = { project_suggestions: cleanup, calendar_ingest_changes: calendar };
		const supabase = { from: (table: keyof typeof tables) => tables[table] };
		const response = await GET({
			locals: {
				supabase,
				safeGetSession: async () => ({ user: { id: 'u1' } })
			}
		} as any);
		const json = await response.json();
		expect(response.status).toBe(200);
		expect(json.data.items).toEqual([
			expect.objectContaining({
				suggestion_id: 'cal-1',
				title: 'Rescheduled kickoff',
				project_id: 'p2',
				project_name: 'Events',
				undoable: true,
				undo_url: '/api/calendar/changes/cal-1/undo'
			}),
			expect.objectContaining({
				suggestion_id: 's1',
				title: 'Move "Brief" under "Client Work"',
				project_id: 'p1',
				project_name: 'Wayne Strategies'
			})
		]);
		expect(cleanup.eq).toHaveBeenCalledWith('status', 'applied');
		expect(cleanup.eq).toHaveBeenCalledWith('result->>applied_via', 'auto');
		expect(calendar.eq).toHaveBeenCalledWith('user_id', 'u1');
		expect(calendar.eq).toHaveBeenCalledWith('status', 'applied');
	});

	it('requires a signed-in user', async () => {
		const response = await GET({
			locals: { supabase: {}, safeGetSession: async () => ({ user: null }) }
		} as any);
		expect(response.status).toBe(401);
	});
});
