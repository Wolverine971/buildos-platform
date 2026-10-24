// apps/worker/src/workers/about-you/aboutYouSweep.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { isAboutYouUser, parseAboutYouCohort } from './about-you-cohort';
import { aboutYouRefreshDedupKey, sweepAboutYouRefreshes } from './aboutYouSweep';

const A = '255735ad-a34b-4ca9-942c-397ed8cc1435';
const B = '11111111-2222-4333-8444-555555555555';

describe('about you cohort', () => {
	it('is nobody by default, a list of ids, or everyone', () => {
		expect(parseAboutYouCohort(undefined)).toEqual([]);
		expect(parseAboutYouCohort(` ${A.toUpperCase()}, not-an-id, ${A}`)).toEqual([A]);
		expect(parseAboutYouCohort('*')).toBe('all');
		expect(isAboutYouUser(A, [A])).toBe(true);
		expect(isAboutYouUser(B, [A])).toBe(false);
		expect(isAboutYouUser(B, 'all')).toBe(true);
	});
});

describe('sweepAboutYouRefreshes', () => {
	function db(rows: Array<{ user_id: string }>) {
		const calls: Array<Record<string, unknown>> = [];
		const filters: Array<[string, unknown]> = [];
		const builder = {
			select: () => builder,
			gt: () => builder,
			order: () => builder,
			limit: () => builder,
			in: (column: string, values: unknown) => {
				filters.push([column, values]);
				return builder;
			},
			then: (resolve: (value: unknown) => unknown) => resolve({ data: rows, error: null })
		};
		return {
			calls,
			filters,
			from: () => builder,
			rpc: async (_name: string, args: Record<string, unknown>) => {
				calls.push(args);
				return { data: `job-${calls.length}`, error: null };
			}
		};
	}

	it('stays dark with no cohort', async () => {
		const fake = db([{ user_id: A }]);
		expect(await sweepAboutYouRefreshes({ cohort: [], supabase: fake as never })).toEqual({
			scanned: 0,
			enqueued: 0
		});
		expect(fake.calls).toHaveLength(0);
	});

	it('queues one deduped refresh per recently active person in the cohort', async () => {
		const fake = db([{ user_id: A }, { user_id: A }]);
		const result = await sweepAboutYouRefreshes({ cohort: [A], supabase: fake as never });
		expect(result).toEqual({ scanned: 1, enqueued: 1 });
		expect(fake.filters).toEqual([['user_id', [A]]]);
		expect(fake.calls[0]).toMatchObject({
			p_user_id: A,
			p_job_type: 'about_you_refresh',
			p_dedup_key: aboutYouRefreshDedupKey(A),
			p_metadata: { userId: A, reason: 'activity' }
		});
	});
});
