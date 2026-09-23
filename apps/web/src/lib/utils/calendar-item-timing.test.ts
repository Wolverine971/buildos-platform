// apps/web/src/lib/utils/calendar-item-timing.test.ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
	describeCalendarItemTiming,
	formatDurationMinutes,
	formatTimeRange,
	htmlToPlainText,
	planQuickReschedule
} from './calendar-item-timing';

const NOW = new Date(2026, 8, 22, 10, 0); // Tue, Sep 22 2026, 10:00 local

describe('formatDurationMinutes', () => {
	it('reads naturally across scales', () => {
		expect(formatDurationMinutes(45)).toBe('45m');
		expect(formatDurationMinutes(60)).toBe('1h');
		expect(formatDurationMinutes(90)).toBe('1h 30m');
		expect(formatDurationMinutes(26 * 60)).toBe('1d 2h');
	});
});

describe('formatTimeRange', () => {
	it('shares the meridiem when it can', () => {
		expect(formatTimeRange(new Date(2026, 8, 22, 14), new Date(2026, 8, 22, 15, 30))).toBe(
			'2:00 – 3:30 PM'
		);
		expect(formatTimeRange(new Date(2026, 8, 22, 11), new Date(2026, 8, 22, 13))).toBe(
			'11:00 AM – 1:00 PM'
		);
	});
});

describe('describeCalendarItemTiming', () => {
	it('gives a timed event its range, duration, and countdown', () => {
		const timing = describeCalendarItemTiming(
			{
				kind: 'event',
				start: new Date(2026, 8, 22, 14),
				end: new Date(2026, 8, 22, 15, 30)
			},
			NOW
		);
		expect(timing).toEqual({
			dateLabel: 'Tue, Sep 22',
			timeLabel: '2:00 – 3:30 PM',
			durationLabel: '1h 30m',
			relativeLabel: 'Starts in 4 hours',
			tone: 'soon'
		});
	});

	it('marks an event in progress with time left', () => {
		const timing = describeCalendarItemTiming(
			{
				kind: 'event',
				start: new Date(2026, 8, 22, 9, 30),
				end: new Date(2026, 8, 22, 10, 25)
			},
			NOW
		);
		expect(timing.relativeLabel).toBe('Happening now · 25 minutes left');
		expect(timing.tone).toBe('now');
	});

	it('shows the real deadline for due markers, not the synthetic block', () => {
		const future = describeCalendarItemTiming(
			{ kind: 'due', start: new Date(2026, 8, 23, 23, 59) },
			NOW
		);
		expect(future.timeLabel).toBe('Due 11:59 PM');
		expect(future.relativeLabel).toBe('Due tomorrow');
		expect(future.durationLabel).toBeNull();

		const late = describeCalendarItemTiming(
			{ kind: 'due', start: new Date(2026, 8, 19, 17) },
			NOW
		);
		expect(late.relativeLabel).toBe('Overdue by 3 days');
		expect(late.tone).toBe('overdue');

		const done = describeCalendarItemTiming(
			{
				kind: 'due',
				start: new Date(2026, 8, 19, 17),
				completedAt: new Date(2026, 8, 21, 10)
			},
			NOW
		);
		expect(done.tone).toBe('done');
		expect(done.relativeLabel).toBe('Completed yesterday');

		const today = describeCalendarItemTiming(
			{ kind: 'due', start: new Date(2026, 8, 22, 17) },
			NOW
		);
		expect(today.relativeLabel).toBe('Due in 7 hours');
		expect(today.tone).toBe('soon');
	});

	it('pairs each date with its time for timed events that span days', () => {
		const timing = describeCalendarItemTiming(
			{
				kind: 'event',
				start: new Date(2026, 7, 30, 20),
				end: new Date(2026, 8, 1, 19, 59)
			},
			NOW
		);
		expect(timing).toMatchObject({
			dateLabel: 'Sun, Aug 30, 8:00 PM',
			timeLabel: 'to Tue, Sep 1, 7:59 PM',
			durationLabel: '1d 23h',
			relativeLabel: 'Ended 21 days ago',
			tone: 'past'
		});
	});

	it('counts multi-day all-day events in days', () => {
		const timing = describeCalendarItemTiming(
			{
				kind: 'event',
				allDay: true,
				start: new Date(2026, 8, 21),
				end: new Date(2026, 8, 24)
			},
			NOW
		);
		expect(timing).toMatchObject({
			dateLabel: 'Mon, Sep 21 – Wed, Sep 23',
			timeLabel: 'All day',
			durationLabel: '3 days',
			relativeLabel: 'Day 2 of 3',
			tone: 'now'
		});
	});
});

describe('planQuickReschedule', () => {
	it('moves the due date to tomorrow and keeps its time', () => {
		const plan = planQuickReschedule(
			{ due_at: new Date(2026, 8, 20, 17, 0).toISOString() },
			'tomorrow',
			NOW
		);
		expect(plan?.days).toBe(3);
		expect(new Date(plan!.patch.due_at!)).toEqual(new Date(2026, 8, 23, 17, 0));
		expect(plan?.patch.start_at).toBeUndefined();
	});

	it('shifts start and due together so the span survives', () => {
		const plan = planQuickReschedule(
			{
				start_at: new Date(2026, 8, 22, 9).toISOString(),
				due_at: new Date(2026, 8, 22, 11).toISOString()
			},
			'nextWeek',
			NOW
		);
		expect(new Date(plan!.patch.start_at!)).toEqual(new Date(2026, 8, 29, 9));
		expect(new Date(plan!.patch.due_at!)).toEqual(new Date(2026, 8, 29, 11));
	});

	it('does nothing when there is no date or it is already there', () => {
		expect(planQuickReschedule({}, 'tomorrow', NOW)).toBeNull();
		expect(
			planQuickReschedule({ due_at: new Date(2026, 8, 23, 8).toISOString() }, 'tomorrow', NOW)
		).toBeNull();
	});
});

describe('htmlToPlainText', () => {
	it('keeps line breaks and drops markup', () => {
		expect(htmlToPlainText('Agenda<br>1. Intro<br/><b>2. Demo</b> &amp; Q&amp;A')).toBe(
			'Agenda\n1. Intro\n2. Demo & Q&A'
		);
	});
});
