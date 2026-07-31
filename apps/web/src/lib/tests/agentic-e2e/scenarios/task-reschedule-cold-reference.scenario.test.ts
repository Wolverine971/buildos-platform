// apps/web/src/lib/tests/agentic-e2e/scenarios/task-reschedule-cold-reference.scenario.test.ts
import { describe, expect, it } from 'vitest';
import { buildRescheduleFixtureDates } from './task-reschedule-cold-reference.scenario';

describe('task reschedule cold-reference fixture', () => {
	it.each([new Date('2026-07-30T16:00:00.000Z'), new Date('2026-07-31T16:00:00.000Z')])(
		'always starts the target on a date other than the requested Friday (%s)',
		(now) => {
			const dates = buildRescheduleFixtureDates(now);

			expect(dates.targetDueAt.slice(0, 10)).not.toBe(dates.expectedFriday);
			expect(dates.controlDueAt).not.toBe(dates.targetDueAt);
		}
	);
});
