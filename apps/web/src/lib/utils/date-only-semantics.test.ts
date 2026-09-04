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

	it('recognizes boundaries stored in the user timezone (rows written after 2026-09-03)', () => {
		const ny = 'America/New_York';
		// "2026-09-18" due, end of day in New York.
		expect(getDateOnlyCalendarDate('2026-09-19T03:59:59.000Z', 'end', ny)).toBe('2026-09-18');
		// "2026-09-18" start, midnight in New York.
		expect(getDateOnlyCalendarDate('2026-09-18T04:00:00.000Z', 'start', ny)).toBe('2026-09-18');
		// Postgres offset form of the same instant.
		expect(getDateOnlyCalendarDate('2026-09-18T23:59:59-04:00', 'end', ny)).toBe('2026-09-18');
		expect(isDateOnlyTaskTimestamp('2026-09-18T23:59:59-04:00', ny)).toBe(true);
		// Winter offset (standard time) resolves too.
		expect(getDateOnlyCalendarDate('2026-12-11T04:59:59.000Z', 'end', ny)).toBe('2026-12-10');
	});

	it('still treats timezone boundaries as clock times when no timezone is given', () => {
		expect(getDateOnlyCalendarDate('2026-09-19T03:59:59.000Z', 'end')).toBeNull();
		expect(isDateOnlyTaskTimestamp('2026-09-18T23:59:59-04:00')).toBe(false);
	});

	it('does not mistake a real clock time in the user timezone for a boundary', () => {
		const ny = 'America/New_York';
		expect(getDateOnlyCalendarDate('2026-09-18T13:30:00.000Z', 'start', ny)).toBeNull();
		expect(getDateOnlyCalendarDate('2026-09-18T04:00:00.000Z', 'end', ny)).toBeNull();
		expect(isDateOnlyTaskTimestamp('2026-09-18T13:30:00.000Z', ny)).toBe(false);
	});

	it('keeps legacy UTC sentinels recognizable regardless of timezone', () => {
		expect(getDateOnlyCalendarDate('2026-07-15T23:59:59Z', 'end', 'America/New_York')).toBe(
			'2026-07-15'
		);
		expect(getDateOnlyCalendarDate('2026-07-15T00:00:00Z', 'start', 'Asia/Tokyo')).toBe(
			'2026-07-15'
		);
	});

	it('ignores an invalid timezone instead of throwing', () => {
		expect(getDateOnlyCalendarDate('2026-09-19T03:59:59.000Z', 'end', 'Not/AZone')).toBeNull();
	});
});
