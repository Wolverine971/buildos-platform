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
});
