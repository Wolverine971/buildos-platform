// apps/web/src/lib/server/authenticated-user-activity.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AUTHENTICATED_ACTIVITY_WRITE_INTERVAL_MS,
	clearAuthenticatedUserActivityCacheForTests,
	recordAuthenticatedUserActivity
} from './authenticated-user-activity';

function createSupabase(response: { error: unknown } = { error: null }) {
	const query: any = {
		update: vi.fn(() => query),
		eq: vi.fn(() => query),
		or: vi.fn().mockResolvedValue(response)
	};

	return {
		supabase: { from: vi.fn(() => query) } as any,
		query
	};
}

describe('recordAuthenticatedUserActivity', () => {
	beforeEach(() => {
		clearAuthenticatedUserActivityCacheForTests();
		vi.restoreAllMocks();
	});

	it('conditionally records authenticated activity using the coarse write interval', async () => {
		const now = new Date('2026-08-15T15:00:00.000Z');
		const { supabase, query } = createSupabase();

		await recordAuthenticatedUserActivity(supabase, 'user-1', { now });

		expect(supabase.from).toHaveBeenCalledWith('users');
		expect(query.update).toHaveBeenCalledWith({ last_visit: now.toISOString() });
		expect(query.eq).toHaveBeenCalledWith('id', 'user-1');
		expect(query.or).toHaveBeenCalledWith(
			`last_visit.is.null,last_visit.lt.${new Date(
				now.getTime() - AUTHENTICATED_ACTIVITY_WRITE_INTERVAL_MS
			).toISOString()}`
		);
	});

	it('coalesces repeat checks in the same server process', async () => {
		const { supabase } = createSupabase();
		const now = new Date('2026-08-15T15:00:00.000Z');

		await recordAuthenticatedUserActivity(supabase, 'user-1', { now });
		await recordAuthenticatedUserActivity(supabase, 'user-1', {
			now: new Date(now.getTime() + 5 * 60 * 1000)
		});

		expect(supabase.from).toHaveBeenCalledTimes(1);
	});

	it('retries after a failed activity write without breaking the request', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const failed = createSupabase({ error: { message: 'temporary failure' } });
		const retry = createSupabase();
		const now = new Date('2026-08-15T15:00:00.000Z');

		await expect(
			recordAuthenticatedUserActivity(failed.supabase, 'user-1', { now })
		).resolves.toBeUndefined();
		await recordAuthenticatedUserActivity(retry.supabase, 'user-1', { now });

		expect(warn).toHaveBeenCalledOnce();
		expect(retry.supabase.from).toHaveBeenCalledOnce();
	});
});
