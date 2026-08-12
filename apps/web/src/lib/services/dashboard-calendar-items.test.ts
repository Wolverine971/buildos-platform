// apps/web/src/lib/services/dashboard-calendar-items.test.ts
import { describe, expect, it } from 'vitest';
import type { CalendarItem } from '$lib/types/calendar-items';
import type { GoogleCalendarSourceSummary } from '$lib/types/google-calendar-integration';
import {
	BUILDOS_CALENDAR_SOURCE_ID,
	decorateDashboardCalendarItems,
	getCalendarSourceIds,
	isConnectedGoogleCalendarItem,
	isDashboardCalendarItemVisible,
	mapConnectedGoogleEvent,
	mergeDashboardCalendarItems
} from './dashboard-calendar-items';

function source(
	id: string
): GoogleCalendarSourceSummary & { emailAddress: string; connectionLabel: string } {
	return {
		id,
		emailAddress: 'djwayne3@gmail.com',
		connectionLabel: 'DJ Wayne 3',
		providerCalendarId: 'djwayne3@gmail.com',
		summary: 'DJ Wayne 3',
		summaryOverride: null,
		timezone: 'America/New_York',
		colorId: '5',
		backgroundColor: '#7986cb',
		foregroundColor: '#ffffff',
		accessRole: 'owner',
		isPrimary: true,
		isHidden: false,
		isSelectedInGoogle: true,
		readEnabled: true,
		availabilityEnabled: true,
		analysisEnabled: true,
		syncEnabled: true,
		providerDeletedAt: null,
		lastSeenAt: '2026-08-12T19:46:08.000Z',
		isDefaultWriteSource: false
	};
}

function item(overrides: Partial<CalendarItem>): CalendarItem {
	return {
		calendar_item_id: 'internal-1',
		item_type: 'event',
		item_kind: 'event',
		source_table: 'onto_events',
		title: 'Internal event',
		start_at: '2026-08-13T14:00:00.000Z',
		end_at: '2026-08-13T15:00:00.000Z',
		all_day: false,
		timezone: 'America/New_York',
		project_id: null,
		owner_entity_type: 'standalone',
		owner_entity_id: null,
		task_id: null,
		event_id: 'event-1',
		state_key: 'scheduled',
		type_key: 'meeting',
		props: {},
		created_at: '2026-08-12T12:00:00.000Z',
		updated_at: '2026-08-12T12:00:00.000Z',
		...overrides
	};
}

describe('dashboard connected calendar items', () => {
	it('maps provider events with source identity, color, and Google details', () => {
		const mapped = mapConnectedGoogleEvent(
			{
				summary: 'Family dinner',
				description: 'Bring dessert',
				location: 'Home',
				htmlLink: 'https://calendar.google.com/calendar/event?eid=one',
				start: { dateTime: '2026-08-13T18:00:00-04:00' },
				end: { dateTime: '2026-08-13T19:00:00-04:00' },
				calendarSourceId: 'source-a',
				contributingCalendarSourceIds: ['source-a'],
				connectionId: 'connection-a',
				connectionLabel: 'djwayne3',
				calendarSummary: 'DJ Wayne 3',
				providerCalendarId: 'djwayne3@gmail.com',
				providerEventId: 'provider-event-1'
			},
			new Map([['source-a', source('source-a')]])
		);

		expect(mapped).toMatchObject({
			source_table: 'google_calendar',
			title: 'Family dinner',
			calendar_source_id: 'source-a',
			calendar_source_ids: ['source-a'],
			calendar_source_label: 'DJ Wayne 3 · djwayne3@gmail.com',
			calendar_connection_label: 'djwayne3@gmail.com',
			calendar_source_color: '#7986cb',
			props: {
				provider_event_id: 'provider-event-1',
				description: 'Bring dessert',
				location: 'Home'
			}
		});
	});

	it('labels BuildOS-only items and source-aware internal events for filtering', () => {
		const buildOsItem = item({ title: 'BuildOS planning session' });
		const syncedItem = item({
			title: 'Shared Google meeting',
			props: { external_calendar_source_id: 'source-a' }
		});

		const decorated = decorateDashboardCalendarItems(
			[buildOsItem, syncedItem],
			new Map([['source-a', source('source-a')]])
		);

		expect(decorated[0]).toMatchObject({
			calendar_source_label: 'BuildOS'
		});
		expect(isConnectedGoogleCalendarItem(decorated[0]!)).toBe(false);
		expect(decorated[1]).toMatchObject({
			calendar_source_id: 'source-a',
			calendar_source_ids: ['source-a'],
			calendar_source_label: 'DJ Wayne 3 · djwayne3@gmail.com',
			calendar_connection_label: 'djwayne3@gmail.com',
			calendar_source_color: '#7986cb'
		});
		expect(isConnectedGoogleCalendarItem(decorated[1]!)).toBe(true);

		expect(
			decorated.filter((entry) =>
				isDashboardCalendarItemVisible(entry, new Set([BUILDOS_CALENDAR_SOURCE_ID]))
			)
		).toEqual([decorated[1]]);
		expect(
			decorated.filter((entry) =>
				isDashboardCalendarItemVisible(entry, new Set(['source-a']))
			)
		).toEqual([decorated[0]]);
	});

	it('prefers an internal BuildOS item over its provider duplicate', () => {
		const internal = item({
			props: {
				external_event_id: 'provider-event-1',
				external_calendar_source_id: 'source-a'
			}
		});
		const provider = item({
			calendar_item_id: 'google:source-a:provider-event-1',
			source_table: 'google_calendar',
			event_id: null,
			calendar_source_id: 'source-a',
			calendar_source_ids: ['source-a'],
			props: { provider_event_id: 'provider-event-1' }
		});

		expect(mergeDashboardCalendarItems([internal], [provider])).toEqual([internal]);
	});

	it('keeps same-id events from a different calendar source and exposes all source ids', () => {
		const internal = item({
			props: {
				external_event_id: 'shared-provider-id',
				external_calendar_source_id: 'source-a'
			}
		});
		const provider = item({
			calendar_item_id: 'google:source-b:shared-provider-id',
			source_table: 'google_calendar',
			event_id: null,
			calendar_source_id: 'source-b',
			calendar_source_ids: ['source-b', 'source-c'],
			props: { provider_event_id: 'shared-provider-id' }
		});

		expect(getCalendarSourceIds(provider)).toEqual(['source-b', 'source-c']);
		expect(mergeDashboardCalendarItems([internal], [provider])).toHaveLength(2);
	});
});
