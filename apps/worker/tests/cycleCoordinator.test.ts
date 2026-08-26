// apps/worker/tests/cycleCoordinator.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	runDueCycleCoordinator,
	type ClaimedCycleTrigger,
	type CycleTriggerCoordinatorStore
} from '../src/workers/cycle/cycleCoordinator';

const CLAIM_TOKEN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function dailyClaim(overrides: Partial<ClaimedCycleTrigger> = {}): ClaimedCycleTrigger {
	return {
		trigger_id: '11111111-1111-4111-8111-111111111111',
		cycle_id: '22222222-2222-4222-8222-222222222222',
		user_id: '33333333-3333-4333-8333-333333333333',
		kind: 'daily_brief',
		policy: { overlap: 'skip', misfire: 'run_once', max_attempts: 3 },
		scheduled_for: '2026-08-25T13:00:00.000Z',
		spec: {
			type: 'schedule',
			schedule: { type: 'daily', time_of_day: '09:00', timezone: 'America/New_York' }
		},
		claim_token: CLAIM_TOKEN,
		claim_expires_at: '2026-08-25T13:02:00.000Z',
		...overrides
	};
}

function fakeStore(claims: ClaimedCycleTrigger[]) {
	const store: CycleTriggerCoordinatorStore = {
		claimDue: vi.fn().mockResolvedValue(claims),
		admitClaimed: vi.fn().mockResolvedValue({
			disposition: 'admitted',
			cycle_run_id: '44444444-4444-4444-8444-444444444444',
			queue_job_record_id: '55555555-5555-4555-8555-555555555555',
			queue_job_id: 'cycle-job'
		}),
		skipClaimed: vi.fn().mockResolvedValue({
			disposition: 'skipped_misfire',
			cycle_run_id: '77777777-7777-4777-8777-777777777777',
			queue_job_record_id: null,
			queue_job_id: null
		}),
		release: vi.fn().mockResolvedValue(true)
	};
	return store;
}

describe('runDueCycleCoordinator', () => {
	it('materializes and atomically admits a claimed Daily Brief occurrence', async () => {
		const store = fakeStore([dailyClaim()]);
		const now = new Date('2026-08-25T13:00:05.000Z');

		const summary = await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(summary).toEqual({
			claimed: 1,
			admitted: 1,
			alreadyAdmitted: 0,
			skippedOverlap: 0,
			skippedMisfire: 0,
			failed: 0,
			oldestScheduledFor: '2026-08-25T13:00:00.000Z',
			maxDueLatencyMs: 5_000,
			averageDueLatencyMs: 5_000,
			errors: []
		});
		expect(store.claimDue).toHaveBeenCalledWith({
			claimToken: CLAIM_TOKEN,
			dueThrough: now.toISOString(),
			limit: 25,
			leaseSeconds: 120,
			kinds: ['daily_brief']
		});
		expect(store.admitClaimed).toHaveBeenCalledWith({
			triggerId: '11111111-1111-4111-8111-111111111111',
			claimToken: CLAIM_TOKEN,
			executionInput: {
				mode: 'scheduled',
				brief_date: '2026-08-25',
				timezone: 'America/New_York',
				force_regenerate: false,
				use_ontology: true
			},
			deliveryIntent: {
				mode: 'evaluate',
				not_before: '2026-08-25T13:00:00.000Z'
			},
			nextTriggerAt: '2026-08-26T13:00:00.000Z',
			triggeredAt: now.toISOString()
		});
		expect(store.release).not.toHaveBeenCalled();
	});

	it('admits an early-leased occurrence while preserving its nominal schedule', async () => {
		const store = fakeStore([dailyClaim()]);
		const now = new Date('2026-08-25T12:58:00.000Z');

		const summary = await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(summary.admitted).toBe(1);
		expect(summary.maxDueLatencyMs).toBe(0);
		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({
				executionInput: expect.objectContaining({
					mode: 'scheduled',
					brief_date: '2026-08-25'
				}),
				deliveryIntent: {
					mode: 'evaluate',
					not_before: '2026-08-25T13:00:00.000Z'
				},
				nextTriggerAt: '2026-08-26T13:00:00.000Z',
				triggeredAt: now.toISOString()
			})
		);
	});

	it.each(['skip', 'allow'] as const)(
		'admits one catch-up when a delayed %s-overlap Cycle uses run_once',
		async (overlap) => {
			const store = fakeStore([
				dailyClaim({ policy: { overlap, misfire: 'run_once', max_attempts: 3 } })
			]);
			const now = new Date('2026-08-25T13:06:00.000Z');

			const summary = await runDueCycleCoordinator({
				store,
				now,
				claimToken: CLAIM_TOKEN
			});

			expect(summary.admitted).toBe(1);
			expect(summary.skippedMisfire).toBe(0);
			expect(store.skipClaimed).not.toHaveBeenCalled();
			expect(store.admitClaimed).toHaveBeenCalledWith(
				expect.objectContaining({
					executionInput: expect.objectContaining({ mode: 'catch_up' })
				})
			);
		}
	);

	it('treats an occurrence exactly at the grace boundary as on time', async () => {
		const store = fakeStore([
			dailyClaim({ policy: { overlap: 'skip', misfire: 'skip', max_attempts: 3 } })
		]);
		const now = new Date('2026-08-25T13:05:00.000Z');

		const summary = await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(summary.admitted).toBe(1);
		expect(summary.skippedMisfire).toBe(0);
		expect(store.skipClaimed).not.toHaveBeenCalled();
		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({
				executionInput: expect.objectContaining({ mode: 'scheduled' })
			})
		);
	});

	it.each(['skip', 'allow'] as const)(
		'skips queue admission when a delayed %s-overlap Cycle uses misfire skip',
		async (overlap) => {
			const store = fakeStore([
				dailyClaim({ policy: { overlap, misfire: 'skip', max_attempts: 3 } })
			]);
			const now = new Date('2026-08-25T13:06:00.000Z');

			const summary = await runDueCycleCoordinator({
				store,
				now,
				claimToken: CLAIM_TOKEN
			});

			expect(summary.skippedMisfire).toBe(1);
			expect(summary.admitted).toBe(0);
			expect(store.admitClaimed).not.toHaveBeenCalled();
			expect(store.skipClaimed).toHaveBeenCalledWith(
				expect.objectContaining({
					executionInput: expect.objectContaining({ mode: 'catch_up' })
				})
			);
		}
	);

	it('counts a database overlap skip separately from a misfire skip', async () => {
		const store = fakeStore([dailyClaim()]);
		vi.mocked(store.admitClaimed).mockResolvedValueOnce({
			disposition: 'skipped_overlap',
			cycle_run_id: '88888888-8888-4888-8888-888888888888',
			queue_job_record_id: null,
			queue_job_id: null
		});

		const summary = await runDueCycleCoordinator({
			store,
			now: new Date('2026-08-25T13:00:05.000Z'),
			claimToken: CLAIM_TOKEN
		});

		expect(summary.skippedOverlap).toBe(1);
		expect(summary.skippedMisfire).toBe(0);
	});

	it('releases a lease when materialization or admission fails', async () => {
		const store = fakeStore([
			dailyClaim({ scheduled_for: 'not-a-date' }),
			dailyClaim({ trigger_id: '66666666-6666-4666-8666-666666666666' })
		]);
		vi.mocked(store.admitClaimed).mockRejectedValueOnce(new Error('database unavailable'));

		const summary = await runDueCycleCoordinator({
			store,
			now: new Date('2026-08-25T13:00:05.000Z'),
			claimToken: CLAIM_TOKEN
		});

		expect(summary.failed).toBe(2);
		expect(store.release).toHaveBeenCalledTimes(2);
		expect(summary.errors).toHaveLength(2);
	});
});
