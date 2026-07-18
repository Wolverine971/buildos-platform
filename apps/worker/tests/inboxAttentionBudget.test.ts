// apps/worker/tests/inboxAttentionBudget.test.ts
//
// Covers the per-project attention budget (tasker/28 WP-4): at most
// PROJECT_ATTENTION_BUDGET pending inbox rows per project; overflow parks as
// 'deferred' and parked rows promote when slots free up. Ranking is risk tier
// desc, then freshness desc; rows already past expiry are left for the sweep.
import { describe, expect, it } from 'vitest';
import {
	applyProjectAttentionBudget,
	PROJECT_ATTENTION_BUDGET
} from '@buildos/shared-agent-ops/inbox-index';

type Row = {
	id: string;
	status: string;
	risk_tier: number | null;
	created_at: string;
	updated_at?: string | null;
	expires_at?: string | null;
};

function stubSupabase(rows: Row[]) {
	const updates: Array<{ payload: Record<string, unknown>; ids: string[] }> = [];

	function selectBuilder() {
		const builder: any = {
			eq: () => builder,
			in: () => builder,
			limit: () => builder,
			then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
				resolve({ data: rows, error: null })
		};
		return builder;
	}

	function updateBuilder(payload: Record<string, unknown>) {
		const captured = { payload, ids: [] as string[] };
		updates.push(captured);
		const builder: any = {
			in: (_column: string, ids: string[]) => {
				captured.ids = ids;
				return builder;
			},
			eq: () => builder,
			then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null })
		};
		return builder;
	}

	const client = {
		from: () => ({
			select: () => selectBuilder(),
			update: (payload: Record<string, unknown>) => updateBuilder(payload)
		})
	};
	return { client: client as any, updates };
}

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const future = new Date(now + 24 * HOUR).toISOString();

describe('applyProjectAttentionBudget', () => {
	it('defers pending overflow beyond the budget, keeping highest risk then freshest', async () => {
		const rows: Row[] = [
			{
				id: 'a',
				status: 'pending',
				risk_tier: 3,
				created_at: iso(5 * HOUR),
				expires_at: future
			},
			{
				id: 'b',
				status: 'pending',
				risk_tier: 1,
				created_at: iso(1 * HOUR),
				expires_at: future
			},
			{
				id: 'c',
				status: 'pending',
				risk_tier: 2,
				created_at: iso(2 * HOUR),
				expires_at: future
			},
			{
				id: 'd',
				status: 'pending',
				risk_tier: 1,
				created_at: iso(3 * HOUR),
				expires_at: future
			},
			{
				id: 'e',
				status: 'pending',
				risk_tier: 1,
				created_at: iso(4 * HOUR),
				expires_at: future
			}
		];
		const { client } = stubSupabase(rows);
		const result = await applyProjectAttentionBudget({
			supabase: client,
			projectId: 'project-1'
		});
		// Top 3: a (tier 3), c (tier 2), b (tier 1, freshest). d + e defer.
		expect(result.promotedIds).toEqual([]);
		expect([...result.deferredIds].sort()).toEqual(['d', 'e']);
	});

	it('promotes parked rows when slots are free', async () => {
		const rows: Row[] = [
			{
				id: 'a',
				status: 'pending',
				risk_tier: 2,
				created_at: iso(1 * HOUR),
				expires_at: future
			},
			{
				id: 'b',
				status: 'deferred',
				risk_tier: 2,
				created_at: iso(2 * HOUR),
				expires_at: future
			},
			{
				id: 'c',
				status: 'deferred',
				risk_tier: 1,
				created_at: iso(3 * HOUR),
				expires_at: future
			}
		];
		const { client } = stubSupabase(rows);
		const result = await applyProjectAttentionBudget({
			supabase: client,
			projectId: 'project-1'
		});
		expect([...result.promotedIds].sort()).toEqual(['b', 'c']);
		expect(result.deferredIds).toEqual([]);
	});

	it('ignores rows already past expiry (the sweep owns them)', async () => {
		const rows: Row[] = [
			{
				id: 'stale',
				status: 'pending',
				risk_tier: 3,
				created_at: iso(10 * HOUR),
				expires_at: iso(1 * HOUR)
			},
			{
				id: 'a',
				status: 'pending',
				risk_tier: 1,
				created_at: iso(1 * HOUR),
				expires_at: future
			},
			{
				id: 'b',
				status: 'deferred',
				risk_tier: 1,
				created_at: iso(2 * HOUR),
				expires_at: future
			}
		];
		const { client } = stubSupabase(rows);
		const result = await applyProjectAttentionBudget({
			supabase: client,
			projectId: 'project-1'
		});
		// The expired tier-3 row neither holds a slot nor gets touched.
		expect(result.promotedIds).toEqual(['b']);
		expect(result.deferredIds).toEqual([]);
	});

	it('does nothing when the project is within budget', async () => {
		const rows: Row[] = Array.from({ length: PROJECT_ATTENTION_BUDGET }, (_, i) => ({
			id: `row-${i}`,
			status: 'pending',
			risk_tier: 1,
			created_at: iso((i + 1) * HOUR),
			expires_at: future
		}));
		const { client, updates } = stubSupabase(rows);
		const result = await applyProjectAttentionBudget({
			supabase: client,
			projectId: 'project-1'
		});
		expect(result.promotedIds).toEqual([]);
		expect(result.deferredIds).toEqual([]);
		expect(updates).toEqual([]);
	});
});
