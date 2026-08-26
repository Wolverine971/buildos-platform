// packages/shared-agent-ops/src/calendar/calendar-event-timing.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeAgentCalendarEventTiming } from './calendar-event-timing';

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
