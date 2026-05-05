// apps/worker/tests/calendarBriefFormatting.test.ts
import { describe, expect, it } from 'vitest';

import {
	formatCalendarBriefItem,
	formatCalendarSection
} from '../src/workers/brief/calendarBriefFormatting';
import type {
	CalendarBriefItem,
	CalendarBriefSection
} from '../src/workers/brief/ontologyBriefTypes';

function createCalendarItem(overrides: Partial<CalendarBriefItem> = {}): CalendarBriefItem {
	return {
		id: 'calendar-1',
		title: 'Due: LinkedIn Post 2',
		startAt: '2026-05-07T12:30:00.000Z',
		endAt: '2026-05-07T13:00:00.000Z',
		allDay: false,
		timezone: 'America/New_York',
		projectId: 'project-1',
		projectName: 'BuildOS',
		taskId: 'task-1',
		eventId: 'event-1',
		itemType: 'task',
		itemKind: 'due',
		stateKey: 'scheduled',
		source: 'google_unconfirmed',
		sourceLabel: 'Google Calendar (unconfirmed)',
		lastSyncedAt: '2026-05-07T00:00:00.000Z',
		syncAgeMinutes: 750,
		syncFreshness: 'stale',
		googleEventId: 'google-event-1',
		googleCalendarId: 'primary',
		externalLink: 'https://calendar.google.com/calendar/event?eid=google-event-1',
		displayTime: '8:30 AM-9:00 AM',
		displayDate: 'Thu May 7',
		...overrides
	};
}

function createCalendarSection(item: CalendarBriefItem): CalendarBriefSection {
	return {
		allItems: [item],
		today: [],
		upcoming: [item],
		todayTotal: 0,
		upcomingTotal: 1,
		hiddenTodayCount: 0,
		hiddenUpcomingCount: 0,
		counts: {
			today: {
				total: 0,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 0,
				staleGoogle: 0
			},
			upcoming: {
				total: 1,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 1,
				staleGoogle: 1
			},
			all: {
				total: 1,
				google: 0,
				internal: 0,
				syncIssue: 0,
				unconfirmedGoogle: 1,
				staleGoogle: 1
			}
		}
	};
}

describe('calendar brief formatting', () => {
	it('links confirmed calendar and task targets in calendar item details', () => {
		const item = createCalendarItem({
			source: 'google',
			sourceLabel: 'Google Calendar',
			syncFreshness: 'fresh'
		});

		expect(formatCalendarBriefItem(item, true)).toBe(
			'- Thu May 7, 8:30 AM-9:00 AM - Due: LinkedIn Post 2 - [Google Calendar](https://calendar.google.com/calendar/event?eid=google-event-1) / [Task](/projects/project-1/tasks/task-1) / Task due / BuildOS'
		);
	});

	it('does not link unconfirmed Google labels', () => {
		const item = createCalendarItem();

		expect(formatCalendarBriefItem(item, true)).toBe(
			'- Thu May 7, 8:30 AM-9:00 AM - Due: LinkedIn Post 2 - Google Calendar (unconfirmed) / [Task](/projects/project-1/tasks/task-1) / stale sync / Task due / BuildOS'
		);
	});

	it('keeps non-link details when links are unavailable', () => {
		const item = createCalendarItem({
			externalLink: null,
			taskId: null,
			source: 'internal',
			sourceLabel: 'Internal only',
			syncFreshness: 'not_synced'
		});

		expect(formatCalendarBriefItem(item, false)).toBe(
			'- 8:30 AM-9:00 AM - Due: LinkedIn Post 2 - Internal only / Task due / BuildOS'
		);
	});

	it('includes links in the generated calendar section', () => {
		const item = createCalendarItem({
			source: 'google',
			sourceLabel: 'Google Calendar'
		});

		expect(formatCalendarSection(createCalendarSection(item))).toContain(
			'[Task](/projects/project-1/tasks/task-1)'
		);
		expect(formatCalendarSection(createCalendarSection(item))).toContain(
			'[Google Calendar](https://calendar.google.com/calendar/event?eid=google-event-1)'
		);
	});
});
