// apps/web/src/lib/services/recurrence-pattern.service.test.ts
import { describe, expect, it } from 'vitest';
import { recurrencePatternBuilder } from './recurrence-pattern.service';

// 2026-09-22T23:30:00-04:00 is Tuesday evening in New York but Wednesday in UTC.
const TUESDAY_EVENING_NY = '2026-09-23T03:30:00.000Z';

describe('recurrencePatternBuilder.buildRRule timezone anchoring', () => {
	it('derives BYDAY from the start day in the event timezone', () => {
		expect(
			recurrencePatternBuilder.buildRRule({
				pattern: { type: 'weekly' },
				endOption: { type: 'never' },
				startDate: TUESDAY_EVENING_NY,
				timeZone: 'America/New_York'
			})
		).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU');
		expect(
			recurrencePatternBuilder.buildRRule({
				pattern: { type: 'biweekly' },
				endOption: { type: 'never' },
				startDate: TUESDAY_EVENING_NY,
				timeZone: 'America/New_York'
			})
		).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU');
	});

	it('derives BYMONTHDAY from the start day in the event timezone', () => {
		expect(
			recurrencePatternBuilder.buildRRule({
				pattern: { type: 'monthly' },
				endOption: { type: 'never' },
				startDate: TUESDAY_EVENING_NY,
				timeZone: 'America/New_York'
			})
		).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=22');
	});

	it('falls back to UTC without a timezone and keeps bare dates literal', () => {
		expect(
			recurrencePatternBuilder.buildRRule({
				pattern: { type: 'weekly' },
				endOption: { type: 'never' },
				startDate: TUESDAY_EVENING_NY
			})
		).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE');
		expect(
			recurrencePatternBuilder.buildRRule({
				pattern: { type: 'quarterly' },
				endOption: { type: 'never' },
				startDate: '2026-09-22',
				timeZone: 'America/New_York'
			})
		).toBe('RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=22');
	});
});
