// packages/shared-agent-ops/src/calendar/calendar-event-timing.test.ts
import { describe, expect, it } from 'vitest';
import {
	normalizeAgentCalendarEventTiming,
	parseAgentCalendarDateTime,
	parseAgentCalendarRangeBound
} from './calendar-event-timing';

const DEFAULT_DURATION_MS = 30 * 60 * 1000;
const NEW_YORK = 'America/New_York';

describe('normalizeAgentCalendarEventTiming', () => {
	it('keeps date-only input as an all-day event on the intended local date', () => {
		expect(
			normalizeAgentCalendarEventTiming('2026-08-25', null, DEFAULT_DURATION_MS, NEW_YORK)
		).toEqual({
			allDay: true,
			startAt: '2026-08-25T04:00:00.000Z',
			endAt: null,
			googleEndAt: '2026-08-26T04:00:00.000Z',
			providerStartDate: '2026-08-25',
			providerEndDate: '2026-08-26'
		});
	});

	it('uses an exclusive provider end for an inclusive date-only range', () => {
		expect(
			normalizeAgentCalendarEventTiming(
				'2026-08-25',
				'2026-08-27',
				DEFAULT_DURATION_MS,
				NEW_YORK
			)
		).toEqual({
			allDay: true,
			startAt: '2026-08-25T04:00:00.000Z',
			endAt: '2026-08-28T04:00:00.000Z',
			googleEndAt: '2026-08-28T04:00:00.000Z',
			providerStartDate: '2026-08-25',
			providerEndDate: '2026-08-28'
		});
	});

	it('keeps the intended date in a positive-offset timezone', () => {
		expect(
			normalizeAgentCalendarEventTiming('2026-08-25', null, DEFAULT_DURATION_MS, 'Asia/Tokyo')
		).toMatchObject({
			startAt: '2026-08-24T15:00:00.000Z',
			providerStartDate: '2026-08-25',
			providerEndDate: '2026-08-26'
		});
	});

	it('preserves timed event normalization and default duration', () => {
		expect(
			normalizeAgentCalendarEventTiming(
				'2026-08-25T14:00:00-04:00',
				null,
				DEFAULT_DURATION_MS,
				NEW_YORK
			)
		).toEqual({
			allDay: false,
			startAt: '2026-08-25T18:00:00.000Z',
			endAt: null,
			googleEndAt: '2026-08-25T18:30:00.000Z',
			providerStartDate: null,
			providerEndDate: null
		});
	});

	it('rejects mixed date-only and timed ranges', () => {
		expect(() =>
			normalizeAgentCalendarEventTiming(
				'2026-08-25',
				'2026-08-25T14:00:00-04:00',
				DEFAULT_DURATION_MS,
				NEW_YORK
			)
		).toThrow('end_at must also be date-only');
	});
});

describe('offset-less calendar datetimes', () => {
	it('schedules a wall-clock start in the user timezone, not the server zone', () => {
		// Kolkata (+05:30) differs from both UTC servers and a US dev machine, so
		// `new Date()`'s host-zone reading cannot pass by coincidence.
		const timing = normalizeAgentCalendarEventTiming(
			'2026-09-23T17:00:00',
			'2026-09-23T18:00:00',
			DEFAULT_DURATION_MS,
			'Asia/Kolkata'
		);
		expect(timing.startAt).toBe('2026-09-23T11:30:00.000Z');
		expect(timing.endAt).toBe('2026-09-23T12:30:00.000Z');
	});

	it('still passes explicit-offset datetimes through as instants', () => {
		expect(parseAgentCalendarDateTime('2026-09-23T17:00:00Z', 'start_at', NEW_YORK)).toBe(
			'2026-09-23T17:00:00.000Z'
		);
		expect(() =>
			parseAgentCalendarDateTime('2026-09-23T25:00:00', 'start_at', NEW_YORK)
		).toThrow('start_at must be a valid date/time');
	});
});

describe('parseAgentCalendarRangeBound', () => {
	it('lets a same-day bare-date range cover that whole civil day', () => {
		const timeMin = parseAgentCalendarRangeBound('2026-09-23', 'time_min', 'start', NEW_YORK);
		const timeMax = parseAgentCalendarRangeBound('2026-09-23', 'time_max', 'end', NEW_YORK);
		expect(timeMin).toBe('2026-09-23T04:00:00.000Z');
		expect(timeMax).toBe('2026-09-24T03:59:59.000Z');
		expect(Date.parse(timeMax)).toBeGreaterThan(Date.parse(timeMin));
	});

	it('resolves an offset-less bound in the user timezone', () => {
		expect(
			parseAgentCalendarRangeBound('2026-09-23T09:00:00', 'time_min', 'start', NEW_YORK)
		).toBe('2026-09-23T13:00:00.000Z');
	});
});
