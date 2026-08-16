// apps/worker/tests/briefScheduleIdempotency.test.ts
import { describe, expect, it } from 'vitest';

import {
	getBlockingBriefScheduleKeys,
	getBriefScheduleKey
} from '../src/workers/brief/briefScheduleIdempotency';

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
