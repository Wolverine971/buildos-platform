// apps/worker/tests/briefNotificationSchedule.test.ts
import { describe, expect, it } from 'vitest';

import { getFutureNotificationScheduledFor } from '../src/workers/brief/briefNotificationSchedule';

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
});
