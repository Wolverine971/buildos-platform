// apps/worker/tests/briefNotificationSchedule.test.ts
import { describe, expect, it } from 'vitest';

import {
	getFutureNotificationScheduledFor,
	resolveImmediateBriefNotification
} from '../src/workers/brief/briefNotificationSchedule';

describe('brief notification scheduling', () => {
	it('returns the preferred send time when it is still in the future', () => {
		const scheduledFor = getFutureNotificationScheduledFor({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			now: new Date('2026-07-06T10:00:00.000Z')
		});

		expect(scheduledFor?.toISOString()).toBe('2026-07-06T13:00:00.000Z');
	});

	it('returns undefined after the preferred send time has passed', () => {
		const scheduledFor = getFutureNotificationScheduledFor({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			now: new Date('2026-07-06T14:00:00.000Z')
		});

		expect(scheduledFor).toBeUndefined();
	});

	it('returns undefined for inactive preferences', () => {
		const scheduledFor = getFutureNotificationScheduledFor({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			isActive: false,
			now: new Date('2026-07-06T10:00:00.000Z')
		});

		expect(scheduledFor).toBeUndefined();
	});

	it('uses 09:00 when the preference has no time of day', () => {
		const scheduledFor = getFutureNotificationScheduledFor({
			briefDate: '2026-07-06',
			timezone: 'America/Los_Angeles',
			now: new Date('2026-07-06T12:00:00.000Z')
		});

		expect(scheduledFor?.toISOString()).toBe('2026-07-06T16:00:00.000Z');
	});

	it('keeps an app-open catch-up quiet after the preferred send time', () => {
		const decision = resolveImmediateBriefNotification({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			now: new Date('2026-07-06T14:00:00.000Z'),
			suppressIfPastPreferredTime: true
		});

		expect(decision).toEqual({
			suppressNotification: true,
			reason: 'preferred_time_passed'
		});
	});

	it('schedules an app-open catch-up for the preferred time when it is still pending', () => {
		const decision = resolveImmediateBriefNotification({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			now: new Date('2026-07-06T10:00:00.000Z'),
			suppressIfPastPreferredTime: true
		});

		expect(decision.suppressNotification).toBe(false);
		expect(decision.reason).toBe('preferred_time_pending');
		expect(decision.notificationScheduledFor?.toISOString()).toBe('2026-07-06T13:00:00.000Z');
	});

	it('preserves immediate notifications for explicit immediate generation', () => {
		const decision = resolveImmediateBriefNotification({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			now: new Date('2026-07-06T14:00:00.000Z')
		});

		expect(decision).toEqual({
			suppressNotification: false,
			reason: 'notify_immediately'
		});
	});

	it('suppresses notifications when daily briefs are inactive', () => {
		const decision = resolveImmediateBriefNotification({
			briefDate: '2026-07-06',
			timeOfDay: '09:00:00',
			timezone: 'America/New_York',
			isActive: false,
			now: new Date('2026-07-06T10:00:00.000Z')
		});

		expect(decision).toEqual({
			suppressNotification: true,
			reason: 'inactive_preference'
		});
	});
});
