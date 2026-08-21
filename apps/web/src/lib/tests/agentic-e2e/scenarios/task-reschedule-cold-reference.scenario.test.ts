// apps/web/src/lib/tests/agentic-e2e/scenarios/task-reschedule-cold-reference.scenario.test.ts
import { describe, expect, it } from 'vitest';
import { buildRescheduleFixtureDates } from './task-reschedule-cold-reference.scenario';

describe('task reschedule cold-reference fixture', () => {
	it.each([
		[new Date('2026-07-30T16:00:00.000Z'), '2026-07-31'],
		[new Date('2026-07-31T16:00:00.000Z'), '2026-08-07']
	])('uses the next unambiguous future Friday from %s', (now, expectedFriday) => {
		const dates = buildRescheduleFixtureDates(now);

		expect(dates.expectedFriday).toBe(expectedFriday);
		expect(dates.targetDueAt.slice(0, 10)).not.toBe(dates.expectedFriday);
		expect(dates.controlDueAt).not.toBe(dates.targetDueAt);
	});

	it('evaluates Friday in the scenario timezone rather than UTC', () => {
		const dates = buildRescheduleFixtureDates(new Date('2026-08-01T02:00:00.000Z'));

		expect(dates.expectedFriday).toBe('2026-08-07');
		expect(dates.targetDueAt.slice(0, 10)).not.toBe(dates.expectedFriday);
		expect(dates.controlDueAt).not.toBe(dates.targetDueAt);
	});

	// The live defect: at 20:17 EDT the UTC clock already reads Friday 08-21, so
	// an unpinned prompt resolved "friday" to 08-28 while the scenario (pinned to
	// HARNESS_TIMEZONE) expected 08-21. Both sides now resolve in New York.
	it('treats a Thursday evening in New York as still-before-Friday', () => {
		const dates = buildRescheduleFixtureDates(new Date('2026-08-21T00:17:43.256Z'));

		expect(dates.expectedFriday).toBe('2026-08-21');
	});

	it('rolls a Friday daytime in New York forward to the following Friday', () => {
		const dates = buildRescheduleFixtureDates(new Date('2026-08-21T16:00:00.000Z'));

		expect(dates.expectedFriday).toBe('2026-08-28');
	});
});
