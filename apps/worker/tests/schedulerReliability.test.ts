// apps/worker/tests/schedulerReliability.test.ts
import { describe, it, expect, vi } from 'vitest';

const schedulerMocks = vi.hoisted(() => ({
	cleanupStaleJobs: vi.fn(),
	supabaseFrom: vi.fn(),
	supabaseRpc: vi.fn(),
	runAgentRunCostReconciliation: vi.fn(),
	agentRunCostReconciliationEnabled: vi.fn(() => false)
}));

// Mock the imports (same pattern as scheduler.test.ts)
vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: schedulerMocks.supabaseFrom,
		rpc: schedulerMocks.supabaseRpc
	}
}));

vi.mock('../src/lib/utils/queueCleanup', () => ({
	cleanupStaleJobs: schedulerMocks.cleanupStaleJobs
}));

vi.mock('../src/workers/agent-run/agentRunCostReconciler', () => ({
	runAgentRunCostReconciliation: schedulerMocks.runAgentRunCostReconciliation,
	agentRunCostReconciliationEnabled: schedulerMocks.agentRunCostReconciliationEnabled
}));

vi.mock('../src/lib/queue', () => ({
	queue: {
		add: vi.fn(),
		cancelBriefJobsForDate: vi.fn()
	}
}));

import {
	isOperativeScheduleLockClaimable,
	isMissedRunSchedulable,
	loadSchedulingUserProfiles,
	STALE_OPERATIVE_LOCK_MS,
	MISSED_BRIEF_LOOKBACK_MS
} from '../src/scheduler';

describe('Scheduler Reliability', () => {
	describe('isOperativeScheduleLockClaimable (F3 - stale lock reclaim)', () => {
		it('is claimable when there is no lock at all', () => {
			expect(isOperativeScheduleLockClaimable(null, new Date('2024-01-15T10:00:00Z'))).toBe(
				true
			);
		});

		it('is claimable when the lock is older than 15 minutes (stale, likely a crashed worker)', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const lockedAt = new Date('2024-01-15T09:44:00Z').toISOString(); // 16 minutes old

			expect(isOperativeScheduleLockClaimable(lockedAt, now)).toBe(true);
		});

		it('is NOT claimable when the lock is fresh (held less than 15 minutes)', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const lockedAt = new Date('2024-01-15T09:50:00Z').toISOString(); // 10 minutes old

			expect(isOperativeScheduleLockClaimable(lockedAt, now)).toBe(false);
		});

		it('treats a lock exactly at the staleness threshold as claimable', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const lockedAt = new Date(now.getTime() - STALE_OPERATIVE_LOCK_MS).toISOString();

			expect(isOperativeScheduleLockClaimable(lockedAt, now)).toBe(true);
		});

		it('respects a custom staleness threshold', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const lockedAt = new Date('2024-01-15T09:58:00Z').toISOString(); // 2 minutes old

			expect(isOperativeScheduleLockClaimable(lockedAt, now, 60 * 1000)).toBe(true);
			expect(isOperativeScheduleLockClaimable(lockedAt, now, 5 * 60 * 1000)).toBe(false);
		});
	});

	describe('isMissedRunSchedulable (N5 - missed-tick brief backfill)', () => {
		it('treats a run time 30 minutes in the past as schedulable (within the lookback)', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const runTime = new Date('2024-01-15T09:30:00Z'); // 30 minutes ago

			expect(isMissedRunSchedulable(runTime, now)).toBe(true);
		});

		it('treats a run time 90 minutes in the past as NOT schedulable (outside the lookback)', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const runTime = new Date('2024-01-15T08:30:00Z'); // 90 minutes ago

			expect(isMissedRunSchedulable(runTime, now)).toBe(false);
		});

		it('does not schedule a run time that is still in the future', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const runTime = new Date('2024-01-15T10:30:00Z'); // 30 minutes from now

			expect(isMissedRunSchedulable(runTime, now)).toBe(false);
		});

		it('respects a custom lookback window', () => {
			const now = new Date('2024-01-15T10:00:00Z');
			const runTime = new Date('2024-01-15T09:30:00Z'); // 30 minutes ago

			expect(isMissedRunSchedulable(runTime, now, 15 * 60 * 1000)).toBe(false);
			expect(isMissedRunSchedulable(runTime, now, MISSED_BRIEF_LOOKBACK_MS)).toBe(true);
		});
	});

	describe('loadSchedulingUserProfiles (fail closed on user lookup errors)', () => {
		function usersQuery(result: { data: unknown; error: unknown }) {
			const builder: any = {
				select: vi.fn(() => builder),
				in: vi.fn(async () => result)
			};
			return builder;
		}

		it('returns null rather than letting every user fall back to UTC', async () => {
			schedulerMocks.supabaseFrom.mockReturnValueOnce(
				usersQuery({ data: null, error: { message: 'statement timeout' } })
			);

			await expect(loadSchedulingUserProfiles(['user-1'])).resolves.toBeNull();
		});

		it('maps timezones and display names when the lookup succeeds', async () => {
			schedulerMocks.supabaseFrom.mockReturnValueOnce(
				usersQuery({
					data: [
						{
							id: 'user-1',
							timezone: 'America/New_York',
							name: 'Ada',
							email: 'a@x.test'
						},
						{ id: 'user-2', timezone: null, name: null, email: 'b@x.test' }
					],
					error: null
				})
			);

			const profiles = await loadSchedulingUserProfiles(['user-1', 'user-2']);

			expect(profiles?.timezoneByUserId.get('user-1')).toBe('America/New_York');
			expect(profiles?.timezoneByUserId.has('user-2')).toBe(false);
			expect(profiles?.nameByUserId.get('user-2')).toBe('b@x.test');
		});
	});
});
