// apps/web/src/routes/api/inbox/done-for-you/server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/config/project-loops', () => ({ PROJECT_LOOPS_ENABLED: true }));

import { GET } from './+server';

function supabaseReturning(rows: unknown[]) {
	const calls: Array<[string, unknown[]]> = [];
	const query: any = new Proxy(
		{},
		{
			get(_target, prop: string) {
				if (prop === 'then') {
					return (resolve: (value: unknown) => void) =>
						resolve({ data: rows, error: null });
				}
				return (...args: unknown[]) => {
					calls.push([prop, args]);
					return query;
				};
			}
		}
	);
	return { supabase: { from: vi.fn(() => query) }, calls };
}

describe('GET /api/inbox/done-for-you', () => {
	it('lists recent auto-applied changes with their project, skipping undone ones', async () => {
		const { supabase, calls } = supabaseReturning([
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
				suggestion_id: 's1',
				title: 'Move "Brief" under "Client Work"',
				project_id: 'p1',
				project_name: 'Wayne Strategies'
			})
		]);
		expect(calls).toEqual(
			expect.arrayContaining([
				['eq', ['status', 'applied']],
				['eq', ['result->>applied_via', 'auto']]
			])
		);
	});

	it('requires a signed-in user', async () => {
		const response = await GET({
			locals: { supabase: {}, safeGetSession: async () => ({ user: null }) }
		} as any);
		expect(response.status).toBe(401);
	});
});
