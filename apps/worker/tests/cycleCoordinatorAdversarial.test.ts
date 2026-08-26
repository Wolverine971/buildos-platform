// apps/worker/tests/cycleCoordinatorAdversarial.test.ts
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
			schedule: {
				type: 'daily',
				time_of_day: '09:00',
				timezone: 'America/New_York'
			}
		},
		claim_token: CLAIM_TOKEN,
		claim_expires_at: '2026-08-25T13:02:00.000Z',
		...overrides
	};
}

function fakeStore(claims: ClaimedCycleTrigger[]): CycleTriggerCoordinatorStore {
	return {
		claimDue: vi.fn(async () => claims),
		admitClaimed: vi.fn(async () => ({
			disposition: 'admitted',
			cycle_run_id: '44444444-4444-4444-8444-444444444444',
			queue_job_record_id: '55555555-5555-4555-8555-555555555555',
			queue_job_id: 'run_cycle_1'
		})),
		skipClaimed: vi.fn(async () => ({
			disposition: 'skipped_misfire',
			cycle_run_id: '66666666-6666-4666-8666-666666666666',
			queue_job_record_id: null,
			queue_job_id: null
		})),
		release: vi.fn(async () => true)
	};
}

describe('Cycle coordinator adversarial boundaries', () => {
	it('isolates a corrupt claim and still admits the remaining leased occurrence', async () => {
		const invalidTriggerId = '77777777-7777-4777-8777-777777777777';
		const validTriggerId = '88888888-8888-4888-8888-888888888888';
		const store = fakeStore([
			dailyClaim({ trigger_id: invalidTriggerId, scheduled_for: 'not-a-date' }),
			dailyClaim({ trigger_id: validTriggerId })
		]);

		const summary = await runDueCycleCoordinator({
			store,
			now: new Date('2026-08-25T13:00:05.000Z'),
			claimToken: CLAIM_TOKEN
		});

		expect(summary).toMatchObject({ claimed: 2, admitted: 1, failed: 1 });
		expect(store.release).toHaveBeenCalledWith({
			triggerId: invalidTriggerId,
			claimToken: CLAIM_TOKEN
		});
		expect(store.admitClaimed).toHaveBeenCalledTimes(1);
		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({ triggerId: validTriggerId })
		);
	});

	it.each([
		[
			'a different Cycle kind',
			dailyClaim({
				kind: 'project_audit',
				trigger_id: '77777777-7777-4777-8777-777777777777'
			})
		],
		[
			'a different claim token',
			dailyClaim({
				claim_token: '99999999-9999-4999-8999-999999999999',
				trigger_id: '88888888-8888-4888-8888-888888888888'
			})
		]
	] as const)('rejects and releases a claim returned with %s', async (_label, claim) => {
		const store = fakeStore([claim]);

		const summary = await runDueCycleCoordinator({
			store,
			now: new Date('2026-08-25T13:00:05.000Z'),
			claimToken: CLAIM_TOKEN
		});

		expect(summary).toMatchObject({ claimed: 1, admitted: 0, failed: 1 });
		expect(store.admitClaimed).not.toHaveBeenCalled();
		expect(store.skipClaimed).not.toHaveBeenCalled();
		expect(store.release).toHaveBeenCalledWith({
			triggerId: claim.trigger_id,
			claimToken: CLAIM_TOKEN
		});
	});

	it('records a release failure without hiding the original materialization failure', async () => {
		const store = fakeStore([dailyClaim({ scheduled_for: 'invalid' })]);
		vi.mocked(store.release).mockRejectedValueOnce(new Error('lease database unavailable'));

		const summary = await runDueCycleCoordinator({
			store,
			now: new Date('2026-08-25T13:00:05.000Z'),
			claimToken: CLAIM_TOKEN
		});

		expect(summary.failed).toBe(1);
		expect(summary.errors).toEqual([
			expect.stringContaining('invalid scheduled_for'),
			expect.stringContaining('failed to release claim: lease database unavailable')
		]);
	});

	it('turns a multi-day outage into one catch-up and advances beyond coordinator time', async () => {
		const store = fakeStore([dailyClaim({ scheduled_for: '2026-08-22T13:00:00.000Z' })]);
		const now = new Date('2026-08-25T15:10:00.000Z');

		const summary = await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(summary).toMatchObject({ claimed: 1, admitted: 1, skippedMisfire: 0 });
		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({
				executionInput: expect.objectContaining({
					mode: 'catch_up',
					brief_date: '2026-08-22'
				}),
				deliveryIntent: {
					mode: 'evaluate',
					not_before: '2026-08-22T13:00:00.000Z'
				},
				nextTriggerAt: '2026-08-26T13:00:00.000Z',
				triggeredAt: now.toISOString()
			})
		);
	});

	it('advances a missed weekly occurrence to the first matching day after now', async () => {
		const store = fakeStore([
			dailyClaim({
				scheduled_for: '2026-08-24T13:00:00.000Z',
				spec: {
					type: 'schedule',
					schedule: {
						type: 'weekly',
						days_of_week: [1],
						time_of_day: '09:00',
						timezone: 'America/New_York'
					}
				}
			})
		]);
		const now = new Date('2026-08-25T15:10:00.000Z');

		await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({
				executionInput: expect.objectContaining({
					mode: 'catch_up',
					brief_date: '2026-08-24'
				}),
				nextTriggerAt: '2026-08-31T13:00:00.000Z'
			})
		);
	});

	it('materializes interval schedules in UTC and skips accumulated interval backlog', async () => {
		const store = fakeStore([
			dailyClaim({
				scheduled_for: '2026-08-25T12:00:00.000Z',
				spec: {
					type: 'schedule',
					schedule: {
						type: 'interval',
						every_minutes: 60,
						anchor_at: '2026-08-25T00:00:00.000Z'
					}
				}
			})
		]);
		const now = new Date('2026-08-25T12:06:00.000Z');

		await runDueCycleCoordinator({ store, now, claimToken: CLAIM_TOKEN });

		expect(store.admitClaimed).toHaveBeenCalledWith(
			expect.objectContaining({
				executionInput: {
					mode: 'catch_up',
					brief_date: '2026-08-25',
					timezone: 'UTC',
					force_regenerate: false,
					use_ontology: true
				},
				nextTriggerAt: '2026-08-25T13:00:00.000Z'
			})
		);
	});

	it('counts mixed admission dispositions independently in one batch', async () => {
		const triggerIds = [
			'11111111-1111-4111-8111-111111111111',
			'22222222-2222-4222-8222-222222222222',
			'33333333-3333-4333-8333-333333333333'
		];
		const store = fakeStore(
			triggerIds.map((triggerId, index) =>
				dailyClaim({
					trigger_id: triggerId,
					cycle_id: `${index + 4}4444444-4444-4444-8444-444444444444`
				})
			)
		);
		vi.mocked(store.admitClaimed)
			.mockResolvedValueOnce({
				disposition: 'admitted',
				cycle_run_id: '44444444-4444-4444-8444-444444444444',
				queue_job_record_id: '55555555-5555-4555-8555-555555555555',
				queue_job_id: 'run_cycle_1'
			})
			.mockResolvedValueOnce({
				disposition: 'already_admitted',
				cycle_run_id: '66666666-6666-4666-8666-666666666666',
				queue_job_record_id: '77777777-7777-4777-8777-777777777777',
				queue_job_id: 'run_cycle_2'
			})
			.mockResolvedValueOnce({
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

		expect(summary).toMatchObject({
			claimed: 3,
			admitted: 1,
			alreadyAdmitted: 1,
			skippedOverlap: 1,
			failed: 0
		});
	});

	it('does not attempt per-trigger release when the atomic batch claim itself fails', async () => {
		const store = fakeStore([]);
		vi.mocked(store.claimDue).mockRejectedValueOnce(new Error('database unavailable'));

		await expect(
			runDueCycleCoordinator({
				store,
				now: new Date('2026-08-25T13:00:05.000Z'),
				claimToken: CLAIM_TOKEN
			})
		).rejects.toThrow('database unavailable');
		expect(store.release).not.toHaveBeenCalled();
	});
});
