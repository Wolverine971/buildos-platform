// apps/worker/tests/smsTimeController.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { TimeController } from './integration/sms-event-scheduling/helpers';

describe('SMS integration clock', () => {
	const clock = new TimeController();
	afterEach(() => clock.reset());

	it('freezes and advances Date while preserving explicit dates and real timers', async () => {
		clock.setTime('2026-09-05T12:00:00.000Z');
		expect(new Date().toISOString()).toBe('2026-09-05T12:00:00.000Z');
		expect(Date.now()).toBe(Date.parse('2026-09-05T12:00:00.000Z'));
		expect(new Date(0).toISOString()).toBe('1970-01-01T00:00:00.000Z');
		expect(new Date(2026, 0, 2).getDate()).toBe(2);

		clock.advanceMinutes(15);
		expect(new Date().toISOString()).toBe('2026-09-05T12:15:00.000Z');
		await new Promise<void>((resolve) => setTimeout(resolve, 1));
	});

	it('restores the real Date constructor', () => {
		const realDate = Date;
		clock.setTime(0);
		clock.reset();
		expect(Date).toBe(realDate);
	});
});
