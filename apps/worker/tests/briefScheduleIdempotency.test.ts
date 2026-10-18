// apps/worker/tests/briefScheduleIdempotency.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startScheduler } from '../src/scheduler';

const mocks = vi.hoisted(() => ({
	from: vi.fn(),
	add: vi.fn(),
	cancel: vi.fn(),
	schedule: vi.fn()
}));
vi.mock('../src/lib/supabase', () => ({ supabase: { from: mocks.from } }));
vi.mock('../src/lib/queue', () => ({
	queue: { add: mocks.add, cancelBriefJobsForDate: mocks.cancel }
}));
vi.mock('node-cron', () => ({ default: { schedule: mocks.schedule, validate: () => true } }));
vi.mock('../src/workers/brief/dailyBriefEligibility', () => ({
	getDailyBriefEligibleUserIds: async (ids: string[]) => new Set(ids)
}));
vi.mock('../src/lib/briefBackoffCalculator', () => ({
	BriefBackoffCalculator: class {
		async shouldSendDailyBriefBatch(ids: string[]) {
			return new Map(
				ids.map((id) => [
					id,
					{
						shouldSend: true,
						isReengagement: false,
						daysSinceLastLogin: 0,
						engagementStage: 'standard'
					}
				])
			);
		}
	}
}));

import {
	getBlockingBriefScheduleKeys,
	getBriefScheduleKey
} from '../src/workers/brief/briefScheduleIdempotency';

type QueryResult = { data: unknown; error: unknown };
function query(result: Promise<QueryResult>) {
	return Object.assign(result, {
		select() {
			return this;
		},
		eq() {
			return this;
		},
		in() {
			return this;
		},
		contains() {
			return this;
		},
		single() {
			return this;
		}
	});
}

describe('brief scheduler admission', () => {
	let tick: () => Promise<void>;
	let timeOfDay: string;
	let preferenceResult: () => Promise<QueryResult>;
	const preference = () => ({ user_id: 'user-1', frequency: 'daily', time_of_day: timeOfDay });

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-18T14:00:00Z'));
		timeOfDay = '09:45:00';
		preferenceResult = async () => ({ data: [preference()], error: null });
		mocks.from.mockImplementation((table: string) => {
			if (table === 'user_brief_preferences') return query(preferenceResult());
			if (table === 'users') {
				const users = query(
					Promise.resolve({
						data: [
							{ id: 'user-1', timezone: 'America/New_York', deletion_status: null }
						],
						error: null
					})
				);
				return {
					...users,
					select: () => ({
						in: () => users,
						eq: () => ({
							single: async () => ({
								data: { timezone: 'America/New_York' },
								error: null
							})
						})
					})
				};
			}
			if (table === 'queue_jobs') return query(Promise.resolve({ data: [], error: null }));
			throw new Error(`Unexpected table: ${table}`);
		});
		mocks.add.mockResolvedValue({ queue_job_id: 'brief-job-1' });
		mocks.cancel.mockResolvedValue({ count: 0 });
		startScheduler();
		tick = mocks.schedule.mock.calls.find(([expression]) => expression === '0 * * * *')![1];
	});

	afterEach(() => {
		vi.clearAllTimers();
		vi.useRealTimers();
	});

	it('coalesces overlapping ticks until scheduling finishes, then accepts a later tick', async () => {
		let release!: (result: QueryResult) => void;
		const pending = new Promise<QueryResult>((resolve) => {
			release = resolve;
		});
		preferenceResult = () => pending;
		const first = tick();
		const overlap = tick();
		try {
			expect(
				mocks.from.mock.calls.filter(([table]) => table === 'user_brief_preferences')
			).toHaveLength(1);
		} finally {
			release({ data: [preference()], error: null });
			await Promise.all([first, overlap]);
		}
		expect(mocks.add).toHaveBeenCalledTimes(1);
		await tick();
		expect(
			mocks.from.mock.calls.filter(([table]) => table === 'user_brief_preferences')
		).toHaveLength(2);
	});

	it.each([
		['missed-run backfill', '2026-10-18T14:00:00Z', '09:45:00', '2026-10-18'],
		['one minute past the hour', '2026-10-18T14:00:00Z', '10:01:00', '2026-10-18'],
		['two minutes past the hour', '2026-10-18T14:00:00Z', '10:02:00', '2026-10-18'],
		['three minutes past the hour', '2026-10-18T14:00:00Z', '10:03:00', '2026-10-18'],
		['scheduled future run', '2026-10-18T14:00:00Z', '10:30:00', '2026-10-18'],
		['generation before local midnight', '2026-10-18T03:59:00Z', '00:01:00', '2026-10-18']
	])(
		'uses stable date deduplication without cancelling a %s',
		async (_label, now, time, date) => {
			vi.setSystemTime(new Date(now));
			timeOfDay = time;
			// The preflight read may be stale on another replica; admission must use
			// the database's same pending/processing dedup key on both invocations.
			await tick();
			vi.setSystemTime(new Date(Date.now() + 1_001));
			await tick();
			expect(mocks.add).toHaveBeenCalledTimes(2);
			for (const call of mocks.add.mock.calls) {
				expect(call[2].briefDate).toBe(date);
				expect(call[3].dedupKey).toBe(`brief-user-1-${date}`);
			}
			expect(mocks.cancel).not.toHaveBeenCalled();
		}
	);

	it('releases the scheduling guard after a database failure', async () => {
		preferenceResult = async () => {
			throw new Error('Database unavailable');
		};
		await tick();
		preferenceResult = async () => ({ data: [preference()], error: null });
		await tick();
		expect(mocks.add).toHaveBeenCalledTimes(1);
	});
});

describe('brief scheduler date idempotency', () => {
	it.each(['pending', 'processing', 'retrying'] as const)(
		'blocks a second automatic job when the same-date job is %s',
		(status) => {
			const keys = getBlockingBriefScheduleKeys([
				{
					user_id: 'user-1',
					status,
					metadata: { briefDate: '2026-08-15' }
				}
			]);

			expect(keys.has(getBriefScheduleKey('user-1', '2026-08-15'))).toBe(true);
		}
	);

	it('blocks a later scheduler backfill after a completed quiet catch-up', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: {
					briefDate: '2026-08-15',
					options: { suppressNotification: true }
				}
			}
		]);

		expect(keys.has(getBriefScheduleKey('user-1', '2026-08-15'))).toBe(true);
	});

	it('allows one recovery pass after a completed scheduled job', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: { briefDate: '2026-08-15' }
			}
		]);

		expect(keys.size).toBe(0);
	});

	it('blocks a completed scheduled job after durable notification emission', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: {
					briefDate: '2026-08-15',
					notificationOutcome: 'emitted'
				}
			}
		]);

		expect(keys.has(getBriefScheduleKey('user-1', '2026-08-15'))).toBe(true);
	});

	it('allows notification recovery when the completed job recorded an emission failure', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: {
					briefDate: '2026-08-15',
					notificationOutcome: 'failed'
				}
			}
		]);

		expect(keys.size).toBe(0);
	});

	it('does not let another date or another user create a false conflict', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: { briefDate: '2026-08-14' }
			}
		]);

		expect(keys.has(getBriefScheduleKey('user-1', '2026-08-15'))).toBe(false);
		expect(keys.has(getBriefScheduleKey('user-2', '2026-08-14'))).toBe(false);
	});

	it('allows a cancelled same-date job to be rescheduled', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'cancelled',
				metadata: { briefDate: '2026-08-15' }
			}
		]);

		expect(keys.size).toBe(0);
	});

	it('allows a failed same-date job to be retried by a later scheduler tick', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'failed',
				metadata: { briefDate: '2026-08-15' }
			}
		]);

		expect(keys.size).toBe(0);
	});

	it('does not turn a failed quiet catch-up into an out-of-window scheduler delivery', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'failed',
				metadata: {
					briefDate: '2026-08-15',
					options: { suppressNotification: true }
				}
			}
		]);

		expect(keys.has(getBriefScheduleKey('user-1', '2026-08-15'))).toBe(true);
	});

	it('ignores legacy jobs without an explicit brief date', () => {
		const keys = getBlockingBriefScheduleKeys([
			{
				user_id: 'user-1',
				status: 'completed',
				metadata: null
			}
		]);

		expect(keys.size).toBe(0);
	});
});
