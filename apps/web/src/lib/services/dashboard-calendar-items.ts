// apps/web/src/lib/services/dashboard-calendar-items.ts
import type { CalendarItem } from '$lib/types/calendar-items';
import type {
	ConnectedGoogleCalendarEvent,
	GoogleCalendarSourceSummary
} from '$lib/types/google-calendar-integration';

type DashboardCalendarSource = GoogleCalendarSourceSummary & {
	connectionLabel?: string;
	emailAddress?: string;
};

type DashboardCalendarSourceLookup = Map<string, DashboardCalendarSource>;
type CalendarSourceLookup = DashboardCalendarSourceLookup;

export const BUILDOS_CALENDAR_SOURCE_ID = 'buildos';

function stringProp(props: Record<string, unknown> | null, key: string): string | null {
	const value = props?.[key];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringArrayProp(props: Record<string, unknown> | null, key: string): string[] {
	const value = props?.[key];
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
		: [];
}

function providerEventId(item: CalendarItem): string | null {
	return (
		stringProp(item.props, 'provider_event_id') ??
		stringProp(item.props, 'external_event_id') ??
		stringProp(item.props, 'calendar_event_id')
	);
}

export function getCalendarSourceIds(item: CalendarItem): string[] {
	return Array.from(
		new Set(
			[
				...(item.calendar_source_ids ?? []),
				...stringArrayProp(item.props, 'calendar_source_ids'),
				item.calendar_source_id,
				stringProp(item.props, 'calendar_source_id'),
				stringProp(item.props, 'external_calendar_source_id')
			].filter((value): value is string => Boolean(value))
		)
	);
}

function getSourceDisplayName(source: DashboardCalendarSource): string {
	return source.summaryOverride || source.summary || source.emailAddress || 'Google Calendar';
}

function getSourceAccountLabel(
	source: DashboardCalendarSource | undefined,
	fallback?: string | null
): string | null {
	return source?.emailAddress || source?.connectionLabel || fallback || null;
}

function getSourceLabel(source: DashboardCalendarSource, fallback?: string | null): string {
	const calendarName = getSourceDisplayName(source);
	const accountLabel = getSourceAccountLabel(source, fallback);
	if (!accountLabel || calendarName.toLowerCase() === accountLabel.toLowerCase()) {
		return calendarName;
	}
	return `${calendarName} · ${accountLabel}`;
}

export function isConnectedGoogleCalendarItem(item: CalendarItem): boolean {
	return item.source_table === 'google_calendar' || getCalendarSourceIds(item).length > 0;
}

export function isDashboardCalendarItemVisible(
	item: CalendarItem,
	hiddenSourceIds: ReadonlySet<string>
): boolean {
	const sourceIds = getCalendarSourceIds(item);
	if (isConnectedGoogleCalendarItem(item)) {
		return sourceIds.length === 0 || sourceIds.some((id) => !hiddenSourceIds.has(id));
	}
	return !hiddenSourceIds.has(BUILDOS_CALENDAR_SOURCE_ID);
}

/**
 * Internal BuildOS events can retain editing/project context while also carrying a Google source
 * identity. Decorate those records with the same human-readable account metadata as direct
 * provider reads so filtering and labels describe where the event actually lives.
 */
export function decorateDashboardCalendarItems(
	items: CalendarItem[],
	sources: DashboardCalendarSourceLookup
): CalendarItem[] {
	return items.map((item) => {
		const sourceIds = getCalendarSourceIds(item);
		const matchedSources = sourceIds
			.map((sourceId) => sources.get(sourceId))
			.filter((source): source is DashboardCalendarSource => Boolean(source));

		if (matchedSources.length === 0) {
			if (!isConnectedGoogleCalendarItem(item)) {
				return {
					...item,
					calendar_source_label: 'BuildOS'
				};
			}
			return item;
		}

		return {
			...item,
			calendar_source_id: item.calendar_source_id ?? sourceIds[0] ?? null,
			calendar_source_ids: sourceIds,
			calendar_source_label: matchedSources
				.map((source) => getSourceLabel(source, item.calendar_connection_label))
				.join(' + '),
			calendar_connection_label:
				getSourceAccountLabel(matchedSources[0], item.calendar_connection_label) ??
				item.calendar_connection_label ??
				null,
			calendar_source_color:
				matchedSources[0]?.backgroundColor ?? item.calendar_source_color ?? null
		};
	});
}

export function mapConnectedGoogleEvent(
	event: ConnectedGoogleCalendarEvent,
	sources: CalendarSourceLookup
): CalendarItem | null {
	const startAt = event.start?.dateTime ?? event.start?.date;
	if (!startAt) return null;

	const sourceIds = Array.from(
		new Set([event.calendarSourceId, ...event.contributingCalendarSourceIds])
	);
	const source = sources.get(event.calendarSourceId);
	const endAt = event.end?.dateTime ?? event.end?.date ?? null;
	const allDay = Boolean(event.start?.date && !event.start?.dateTime);
	const createdAt = event.created ?? event.updated ?? startAt;
	const updatedAt = event.updated ?? event.created ?? startAt;

	return {
		calendar_item_id: `google:${event.calendarSourceId}:${event.providerEventId}`,
		item_type: 'event',
		item_kind: 'event',
		source_table: 'google_calendar',
		title: event.summary || '(Untitled)',
		start_at: startAt,
		end_at: endAt,
		all_day: allDay,
		timezone: event.start?.timeZone ?? source?.timezone ?? null,
		project_id: null,
		owner_entity_type: null,
		owner_entity_id: null,
		task_id: null,
		event_id: null,
		state_key: event.status ?? null,
		type_key: 'google_calendar_event',
		props: {
			external_link: event.htmlLink ?? null,
			provider_event_id: event.providerEventId,
			provider_calendar_id: event.providerCalendarId,
			calendar_source_id: event.calendarSourceId,
			calendar_source_ids: sourceIds,
			calendar_source_label: source
				? getSourceLabel(source, event.connectionLabel)
				: `${event.calendarSummary} · ${event.connectionLabel}`,
			calendar_connection_label:
				getSourceAccountLabel(source, event.connectionLabel) ?? event.connectionLabel,
			description: event.description ?? null,
			location: event.location ?? null,
			organizer: event.organizer ?? null,
			ical_uid: event.iCalUID ?? null
		},
		calendar_source_id: event.calendarSourceId,
		calendar_source_ids: sourceIds,
		calendar_source_label: source
			? getSourceLabel(source, event.connectionLabel)
			: `${event.calendarSummary} · ${event.connectionLabel}`,
		calendar_connection_label:
			getSourceAccountLabel(source, event.connectionLabel) ?? event.connectionLabel,
		calendar_source_color: source?.backgroundColor ?? null,
		created_at: createdAt,
		updated_at: updatedAt
	};
}

/**
 * Provider reads can contain the same event already represented by an internal BuildOS event.
 * Prefer the internal item because it keeps project/task editing and detail routing intact.
 */
export function mergeDashboardCalendarItems(
	internalItems: CalendarItem[],
	providerItems: CalendarItem[]
): CalendarItem[] {
	const exactInternalIdentities = new Set<string>();
	const providerIdsWithoutSource = new Set<string>();

	for (const item of internalItems) {
		const eventId = providerEventId(item);
		if (!eventId) continue;
		const sourceIds = getCalendarSourceIds(item);
		if (sourceIds.length === 0) {
			providerIdsWithoutSource.add(eventId);
			continue;
		}
		for (const sourceId of sourceIds) {
			exactInternalIdentities.add(`${sourceId}\u0000${eventId}`);
		}
	}

	const dedupedProviderItems = providerItems.filter((item) => {
		const eventId = providerEventId(item);
		if (!eventId) return true;
		if (providerIdsWithoutSource.has(eventId)) return false;
		return !getCalendarSourceIds(item).some((sourceId) =>
			exactInternalIdentities.has(`${sourceId}\u0000${eventId}`)
		);
	});

	return [...internalItems, ...dedupedProviderItems].sort(
		(left, right) => Date.parse(left.start_at) - Date.parse(right.start_at)
	);
}
