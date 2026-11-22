// apps/web/src/lib/components/today/today-two-weeks.ts
// The two-week calendar on Today: this week (Sunday to Saturday) and the next, with each
// event placed on the days it covers in the person's timezone. Pure rules, no requests.
import { formatInTimeZone } from 'date-fns-tz';
import type { CalendarItem } from '$lib/types/calendar-items';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
export const TWO_WEEK_DAYS = 14;
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Move a YYYY-MM-DD calendar date by whole days. */
export function shiftDate(date: string, days: number): string {
	return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Sunday that opens the week holding `date` (YYYY-MM-DD in the person's timezone). */
export function twoWeekStart(date: string): string {
	const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
	return shiftDate(date, -weekday);
}

export interface TwoWeekEvent {
	id: string;
	title: string;
	/** "9a", "2:30p"; null for all-day events and days an event only continues into. */
	time: string | null;
	/** "9:00 AM – 10:00 AM", "All day". */
	when: string;
	allDay: boolean;
	/** The connected calendar's colour, when it has one. */
	color: string | null;
	/** Where the event lives ("Work · you@example.com", "BuildOS"). */
	source: string | null;
	/** Opens the event where it lives (Google Calendar). */
	href: string | null;
	taskId: string | null;
	projectId: string | null;
	sortMs: number;
}

export interface TwoWeekDay {
	/** YYYY-MM-DD */
	date: string;
	dayOfMonth: number;
	/** "Nov" on the first cell and on the 1st of a month. */
	month: string | null;
	/** "Tuesday, November 24" */
	label: string;
	isToday: boolean;
	isPast: boolean;
	events: TwoWeekEvent[];
}

function utcMidnightDate(value: string): string | null {
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	const iso = new Date(ms).toISOString();
	return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : null;
}

/**
 * The first and last calendar day an item covers. All-day items carry dates, not instants
 * (Google sends YYYY-MM-DD, BuildOS stores the date at UTC midnight), so those are read as
 * dates and never shifted into the previous evening. Their end is the day after the last one.
 */
export function itemDaySpan(
	item: Pick<CalendarItem, 'start_at' | 'end_at' | 'all_day'>,
	timezone: string
): { first: string; last: string } | null {
	const allDay = Boolean(item.all_day);
	const startDate = DATE_ONLY.test(item.start_at)
		? item.start_at
		: allDay
			? utcMidnightDate(item.start_at)
			: null;
	const startMs = Date.parse(item.start_at);
	if (!startDate && !Number.isFinite(startMs)) return null;
	const first = startDate ?? formatInTimeZone(new Date(startMs), timezone, 'yyyy-MM-dd');

	let last = first;
	if (item.end_at) {
		const endDate = DATE_ONLY.test(item.end_at)
			? item.end_at
			: allDay
				? utcMidnightDate(item.end_at)
				: null;
		if (endDate) {
			last = shiftDate(endDate, -1);
		} else {
			const endMs = Date.parse(item.end_at);
			if (Number.isFinite(endMs) && Number.isFinite(startMs) && endMs > startMs) {
				last = formatInTimeZone(new Date(endMs - 1), timezone, 'yyyy-MM-dd');
			}
		}
	}
	return { first, last: last < first ? first : last };
}

function compactTime(date: Date, timezone: string): string {
	const [hour, minute, period] = formatInTimeZone(date, timezone, 'h:mm:a').split(':');
	return `${hour}${minute === '00' ? '' : `:${minute}`}${(period ?? '').charAt(0).toLowerCase()}`;
}

function whenLabel(item: CalendarItem, timezone: string): string {
	if (item.all_day || DATE_ONLY.test(item.start_at)) return 'All day';
	const start = formatInTimeZone(new Date(item.start_at), timezone, 'h:mm a');
	if (!item.end_at) return start;
	const endMs = Date.parse(item.end_at);
	if (!Number.isFinite(endMs) || endMs <= Date.parse(item.start_at)) return start;
	return `${start} – ${formatInTimeZone(new Date(endMs), timezone, 'h:mm a')}`;
}

function externalLink(item: CalendarItem): string | null {
	const link = item.props?.external_link;
	return typeof link === 'string' && /^https:\/\//i.test(link) ? link : null;
}

/**
 * Fourteen days from `start` (a Sunday), each with its events in the order a day reads:
 * all-day and carried-over events first, then by start time.
 */
export function buildTwoWeeks({
	start,
	today,
	timezone,
	items
}: {
	/** YYYY-MM-DD of the first Sunday. */
	start: string;
	/** YYYY-MM-DD today in the person's timezone. */
	today: string;
	timezone: string;
	items: readonly CalendarItem[];
}): TwoWeekDay[] {
	const days: TwoWeekDay[] = [];
	const byDate = new Map<string, TwoWeekDay>();
	for (let index = 0; index < TWO_WEEK_DAYS; index += 1) {
		const date = shiftDate(start, index);
		const noon = new Date(`${date}T12:00:00Z`);
		const dayOfMonth = noon.getUTCDate();
		const day: TwoWeekDay = {
			date,
			dayOfMonth,
			month: index === 0 || dayOfMonth === 1 ? formatInTimeZone(noon, 'UTC', 'MMM') : null,
			label: formatInTimeZone(noon, 'UTC', 'EEEE, MMMM d'),
			isToday: date === today,
			isPast: date < today,
			events: []
		};
		days.push(day);
		byDate.set(date, day);
	}
	const lastDate = shiftDate(start, TWO_WEEK_DAYS - 1);

	const seen = new Set<string>();
	for (const item of items) {
		if (item.item_type !== 'event' || item.state_key === 'cancelled') continue;
		if (seen.has(item.calendar_item_id)) continue;
		seen.add(item.calendar_item_id);
		const span = itemDaySpan(item, timezone);
		if (!span || span.last < start || span.first > lastDate) continue;

		const allDay = Boolean(item.all_day) || DATE_ONLY.test(item.start_at);
		const startMs = Date.parse(item.start_at);
		const base = {
			id: item.calendar_item_id,
			title: item.title?.trim() || 'Untitled event',
			when: whenLabel(item, timezone),
			allDay,
			color:
				item.calendar_source_color && HEX_COLOR.test(item.calendar_source_color)
					? item.calendar_source_color
					: null,
			source: item.calendar_source_label ?? null,
			href: externalLink(item),
			taskId: item.task_id,
			projectId: item.project_id
		};
		for (
			let date = span.first < start ? start : span.first;
			date <= span.last && date <= lastDate;
			date = shiftDate(date, 1)
		) {
			const startsHere = date === span.first;
			byDate.get(date)?.events.push({
				...base,
				time: allDay || !startsHere ? null : compactTime(new Date(startMs), timezone),
				// All-day and carried-over events lead the day.
				sortMs: allDay || !startsHere ? Number.NEGATIVE_INFINITY : startMs
			});
		}
	}

	for (const day of days) {
		day.events.sort((a, b) => a.sortMs - b.sortMs || a.title.localeCompare(b.title));
	}
	return days;
}

/**
 * What the strip needs from a BuildOS calendar item: its dates, links, and the Google
 * identity that keeps a live Google read from showing the same event twice. Descriptions,
 * guests and the rest of `props` stay on the server.
 */
const KEPT_PROPS = [
	'external_link',
	'provider_event_id',
	'external_event_id',
	'calendar_event_id',
	'calendar_source_id',
	'calendar_source_ids',
	'external_calendar_source_id'
] as const;

export function slimCalendarItem(item: CalendarItem): CalendarItem {
	const props: Record<string, unknown> = {};
	for (const key of KEPT_PROPS) {
		const value = item.props?.[key];
		if (value !== undefined && value !== null) props[key] = value;
	}
	return { ...item, props };
}

/** Same overlap rule as the `list_calendar_items` database function. */
export function itemOverlaps(
	item: Pick<CalendarItem, 'start_at' | 'end_at'>,
	startMs: number,
	endMs: number
): boolean {
	const itemStart = Date.parse(item.start_at);
	if (!Number.isFinite(itemStart)) return false;
	const itemEnd = item.end_at ? Date.parse(item.end_at) : itemStart;
	return (
		itemStart < endMs &&
		Math.max(Number.isFinite(itemEnd) ? itemEnd : itemStart, itemStart + 1) > startMs
	);
}
