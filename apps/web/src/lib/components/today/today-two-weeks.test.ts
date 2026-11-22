// apps/web/src/lib/components/today/today-two-weeks.test.ts
import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '$lib/types/calendar-items';
import {
	buildTwoWeeks,
	itemDaySpan,
	itemOverlaps,
	slimCalendarItem,
	twoWeekStart
} from './today-two-weeks';

const NY = 'America/New_York';

function item(overrides: Partial<CalendarItem>): CalendarItem {
	return {
		calendar_item_id: 'event-1',
		item_type: 'event',
		item_kind: 'event',
		source_table: 'onto_events',
		title: 'Standup',
		start_at: '2026-11-23T14:00:00+00:00',
		end_at: '2026-11-23T14:30:00+00:00',
		all_day: false,
		timezone: null,
		project_id: null,
		owner_entity_type: null,
		owner_entity_id: null,
		task_id: null,
		event_id: null,
		state_key: null,
		type_key: null,
		props: null,
		created_at: '2026-11-01T00:00:00Z',
		updated_at: '2026-11-01T00:00:00Z',
		...overrides
	};
}

function eventsOn(days: ReturnType<typeof buildTwoWeeks>, date: string) {
	return days.find((day) => day.date === date)?.events.map((event) => event.title) ?? [];
}

describe('twoWeekStart', () => {
	it('opens on the Sunday of the current week, whatever today is', () => {
		expect(twoWeekStart('2026-11-21')).toBe('2026-11-15'); // Saturday
		expect(twoWeekStart('2026-11-23')).toBe('2026-11-22'); // Monday
		expect(twoWeekStart('2026-11-22')).toBe('2026-11-22'); // Sunday
		expect(twoWeekStart('2027-01-01')).toBe('2026-12-27'); // Friday, across a year
	});
});

describe('buildTwoWeeks', () => {
	const base = { start: '2026-11-15', today: '2026-11-21', timezone: NY };

	it('lays out fourteen days from Sunday, marking today and the days behind it', () => {
		const days = buildTwoWeeks({ ...base, items: [] });
		expect(days).toHaveLength(14);
		expect(days[0]).toMatchObject({ date: '2026-11-15', month: 'Nov', isPast: true });
		expect(days[6]).toMatchObject({ date: '2026-11-21', isToday: true, isPast: false });
		expect(days[13]).toMatchObject({ date: '2026-11-28', isToday: false, isPast: false });
		expect(days[13]?.label).toBe('Saturday, November 28');
	});

	it("places a timed event on the person's local day, not the UTC day", () => {
		// 9:30 PM Monday in New York is already Tuesday in UTC.
		const days = buildTwoWeeks({
			...base,
			items: [
				item({
					title: 'Late call',
					start_at: '2026-11-24T02:30:00+00:00',
					end_at: '2026-11-24T03:00:00+00:00'
				})
			]
		});
		expect(eventsOn(days, '2026-11-23')).toEqual(['Late call']);
		expect(eventsOn(days, '2026-11-24')).toEqual([]);
		expect(days.find((day) => day.date === '2026-11-23')?.events[0]).toMatchObject({
			time: '9:30p',
			when: '9:30 PM – 10:00 PM'
		});
	});

	it('keeps an all-day event on its own date in a timezone behind UTC', () => {
		const days = buildTwoWeeks({
			...base,
			items: [
				// Google all-day: date strings, end is the day after.
				item({
					calendar_item_id: 'g',
					title: 'Offsite',
					start_at: '2026-11-25',
					end_at: '2026-11-27',
					all_day: true
				}),
				// BuildOS all-day: the date stored at UTC midnight.
				item({
					calendar_item_id: 'b',
					title: 'Launch day',
					start_at: '2026-11-24T00:00:00+00:00',
					end_at: '2026-11-25T00:00:00+00:00',
					all_day: true
				})
			]
		});
		expect(eventsOn(days, '2026-11-23')).toEqual([]);
		expect(eventsOn(days, '2026-11-24')).toEqual(['Launch day']);
		expect(eventsOn(days, '2026-11-25')).toEqual(['Offsite']);
		expect(eventsOn(days, '2026-11-26')).toEqual(['Offsite']);
		expect(eventsOn(days, '2026-11-27')).toEqual([]);
	});

	it('orders a day: all-day first, then by start time', () => {
		const days = buildTwoWeeks({
			...base,
			items: [
				item({
					calendar_item_id: 'a',
					title: 'Afternoon',
					start_at: '2026-11-23T19:00:00Z',
					end_at: null
				}),
				item({
					calendar_item_id: 'm',
					title: 'Morning',
					start_at: '2026-11-23T14:00:00Z',
					end_at: null
				}),
				item({
					calendar_item_id: 'd',
					title: 'Holiday',
					start_at: '2026-11-23',
					end_at: '2026-11-24',
					all_day: true
				})
			]
		});
		expect(eventsOn(days, '2026-11-23')).toEqual(['Holiday', 'Morning', 'Afternoon']);
	});

	it('leaves out cancelled events, task markers, repeats, and anything outside the window', () => {
		const days = buildTwoWeeks({
			...base,
			items: [
				item({ calendar_item_id: 'x', title: 'Cancelled', state_key: 'cancelled' }),
				item({
					calendar_item_id: 't',
					title: 'Due: thing',
					item_type: 'task',
					item_kind: 'due'
				}),
				item({ calendar_item_id: 'dup', title: 'Once' }),
				item({ calendar_item_id: 'dup', title: 'Once' }),
				item({
					calendar_item_id: 'far',
					title: 'Later',
					start_at: '2026-11-29T15:00:00Z',
					end_at: null
				})
			]
		});
		expect(days.flatMap((day) => day.events.map((event) => event.title))).toEqual(['Once']);
	});

	it('clips an event that began before the window to the days shown', () => {
		const days = buildTwoWeeks({
			...base,
			items: [
				item({ title: 'Trip', start_at: '2026-11-13', end_at: '2026-11-17', all_day: true })
			]
		});
		expect(eventsOn(days, '2026-11-15')).toEqual(['Trip']);
		expect(eventsOn(days, '2026-11-16')).toEqual(['Trip']);
		expect(eventsOn(days, '2026-11-17')).toEqual([]);
	});
});

describe('itemDaySpan', () => {
	it('ends a timed event that stops at midnight on the day it started', () => {
		expect(
			itemDaySpan(
				{
					start_at: '2026-11-24T02:00:00Z',
					end_at: '2026-11-24T05:00:00Z',
					all_day: false
				},
				NY
			)
		).toEqual({ first: '2026-11-23', last: '2026-11-23' });
	});
});

describe('itemOverlaps', () => {
	const dayStart = Date.parse('2026-11-21T05:00:00Z');
	const dayEnd = Date.parse('2026-11-22T05:00:00Z');

	it('matches the database rule: touches the window, end exclusive, instants count', () => {
		const at = (start_at: string, end_at: string | null) => ({ start_at, end_at });
		expect(
			itemOverlaps(at('2026-11-21T15:00:00Z', '2026-11-21T16:00:00Z'), dayStart, dayEnd)
		).toBe(true);
		expect(itemOverlaps(at('2026-11-21T05:00:00Z', null), dayStart, dayEnd)).toBe(true);
		expect(
			itemOverlaps(at('2026-11-21T04:00:00Z', '2026-11-21T05:00:00Z'), dayStart, dayEnd)
		).toBe(false);
		expect(
			itemOverlaps(at('2026-11-22T05:00:00Z', '2026-11-22T06:00:00Z'), dayStart, dayEnd)
		).toBe(false);
		expect(
			itemOverlaps(at('2026-11-20T15:00:00Z', '2026-11-23T15:00:00Z'), dayStart, dayEnd)
		).toBe(true);
	});
});

describe('slimCalendarItem', () => {
	it('keeps the link and Google identity and drops the rest of props', () => {
		const slim = slimCalendarItem(
			item({
				props: {
					external_link: 'https://calendar.google.com/x',
					provider_event_id: 'abc',
					description: 'Private notes',
					attendees: [{ email: 'someone@example.com' }]
				}
			})
		);
		expect(slim.props).toEqual({
			external_link: 'https://calendar.google.com/x',
			provider_event_id: 'abc'
		});
	});
});
