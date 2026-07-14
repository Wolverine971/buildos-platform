// apps/web/src/lib/utils/date-only-semantics.test.ts
import { describe, expect, it } from 'vitest';
import { getDateOnlyCalendarDate, isDateOnlyTaskTimestamp } from './date-only-semantics';

describe('date-only task timestamp semantics', () => {
	it('recognizes start and end sentinels in API and Postgres timestamp formats', () => {
		expect(getDateOnlyCalendarDate('2026-07-15T00:00:00.000Z', 'start')).toBe('2026-07-15');
		expect(getDateOnlyCalendarDate('2026-07-15T23:59:59+00:00', 'end')).toBe('2026-07-15');
		expect(isDateOnlyTaskTimestamp('2026-07-15T00:00:00Z')).toBe(true);
		expect(isDateOnlyTaskTimestamp('2026-07-15T00:00:00+00')).toBe(true);
		expect(isDateOnlyTaskTimestamp('2026-07-15T23:59:59.000000+00:00')).toBe(true);
	});

	it('applies the sentinel convention to the correct task boundary only', () => {
		// A midnight due time is still a real clock time; date-only due values use end-of-day.
		expect(getDateOnlyCalendarDate('2026-07-15T00:00:00Z', 'end')).toBeNull();
		// Likewise, an end-of-day start time is timed; date-only starts use midnight.
		expect(getDateOnlyCalendarDate('2026-07-15T23:59:59Z', 'start')).toBeNull();
	});

	it('does not hide clock times that merely occur on the same date', () => {
		expect(getDateOnlyCalendarDate('2026-07-15T09:30:00.000Z', 'start')).toBeNull();
		expect(isDateOnlyTaskTimestamp('2026-07-15T09:30:00.000Z')).toBe(false);
		expect(isDateOnlyTaskTimestamp('2026-07-15T23:59:59-04:00')).toBe(false);
	});
});
