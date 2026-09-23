// apps/worker/tests/queueCleanup.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	updates: [] as Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>,
	staleRows: [] as Array<Record<string, unknown>>,
	cancelledRows: [] as Array<{ id: string }>
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: () => {
			const filters: Array<[string, unknown]> = [];
			let payload: Record<string, unknown> | null = null;
			const builder: any = {
				select: () => builder,
				update: (value: Record<string, unknown>) => {
					payload = value;
					mocks.updates.push({ payload: value, filters });
					return builder;
				},
				in: (column: string, value: unknown) => {
					filters.push([column, value]);
					return builder;
				},
				lt: () => builder,
				order: () => builder,
				then: (resolve: (value: unknown) => unknown) =>
					Promise.resolve({
						data: payload ? mocks.cancelledRows : mocks.staleRows,
						error: null
					}).then(resolve)
			};
			return builder;
		}
	}
}));

import { cleanupStaleJobs } from '../src/lib/utils/queueCleanup';

describe('cleanupStaleJobs stale cancellation', () => {
	beforeEach(() => {
		mocks.updates.length = 0;
		mocks.staleRows = [
			{
				id: 'job-1',
				job_type: 'generate_daily_brief',
				status: 'pending',
				scheduled_for: '2026-01-01T00:00:00Z'
			},
			{
				id: 'job-2',
				job_type: 'generate_daily_brief',
				status: 'pending',
				scheduled_for: '2026-01-01T00:00:00Z'
			}
		];
		// job-2 was claimed by a worker between the scan and the cancel.
		mocks.cancelledRows = [{ id: 'job-1' }];
	});

	it('only cancels jobs still pending or retrying at write time', async () => {
		const result = await cleanupStaleJobs({
			oldFailedJobsDays: 0,
			completedJobsRetentionDays: 0
		});

		expect(mocks.updates).toHaveLength(1);
		expect(mocks.updates[0]!.payload.status).toBe('cancelled');
		expect(mocks.updates[0]!.filters).toContainEqual(['status', ['pending', 'retrying']]);
		expect(result.staleCancelled).toBe(1);
	});
});
