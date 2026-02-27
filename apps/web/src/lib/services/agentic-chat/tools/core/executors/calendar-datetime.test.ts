// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-datetime.test.ts
import { describe, expect, it } from 'vitest';
import {
	hasExplicitTimezone,
	normalizeCalendarDateTimeInput,
	isValidIanaTimezone
} from './calendar-datetime';

describe('calendar datetime normalization', () => {
	it('detects explicit timezone suffixes', () => {
		expect(hasExplicitTimezone('2026-03-04T18:00:00Z')).toBe(true);
		expect(hasExplicitTimezone('2026-03-04T18:00:00-05:00')).toBe(true);
		expect(hasExplicitTimezone('2026-03-04T18:00:00-0500')).toBe(true);
		expect(hasExplicitTimezone('2026-03-04T18:00:00')).toBe(false);
	});

	it('accepts valid IANA timezone names', () => {
		expect(isValidIanaTimezone('America/New_York')).toBe(true);
		expect(isValidIanaTimezone('Invalid/Timezone')).toBe(false);
	});

	it('keeps explicit UTC timestamps stable', () => {
		const result = normalizeCalendarDateTimeInput(
			'2026-03-04T18:00:00.000Z',
			'America/New_York'
		);
		expect(result.iso).toBe('2026-03-04T18:00:00.000Z');
		expect(result.hadExplicitTimezone).toBe(true);
		expect(result.assumedTimezone).toBeNull();
	});

	it('converts explicit offset timestamps to UTC', () => {
		const result = normalizeCalendarDateTimeInput(
			'2026-03-04T14:00:00-05:00',
			'America/Denver'
		);
		expect(result.iso).toBe('2026-03-04T19:00:00.000Z');
		expect(result.hadExplicitTimezone).toBe(true);
	});

	it('converts naive local timestamps using provided timezone', () => {
		const result = normalizeCalendarDateTimeInput('2026-03-04T14:00:00', 'America/New_York');
		expect(result.iso).toBe('2026-03-04T19:00:00.000Z');
		expect(result.hadExplicitTimezone).toBe(false);
		expect(result.assumedTimezone).toBe('America/New_York');
	});

	it('converts date-only inputs with start/end boundaries', () => {
		const start = normalizeCalendarDateTimeInput('2026-03-04', 'America/New_York', {
			dateBoundary: 'start'
		});
		const end = normalizeCalendarDateTimeInput('2026-03-04', 'America/New_York', {
			dateBoundary: 'end'
		});

		expect(start.iso).toBe('2026-03-04T05:00:00.000Z');
		expect(end.iso).toBe('2026-03-05T04:59:59.000Z');
	});

	it('throws for invalid datetime strings', () => {
		expect(() =>
			normalizeCalendarDateTimeInput('not-a-date', 'America/New_York', {
				fieldName: 'start_at'
			})
		).toThrow('start_at');
	});
});
