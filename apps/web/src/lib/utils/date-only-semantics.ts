// apps/web/src/lib/utils/date-only-semantics.ts
const UTC_SUFFIX_PATTERN = '(?:Z|\\+00(?::00)?)';
const DATE_ONLY_START_PATTERN = new RegExp(
	`^(\\d{4}-\\d{2}-\\d{2})T00:00:00(?:\\.0+)?${UTC_SUFFIX_PATTERN}$`
);
const DATE_ONLY_END_PATTERN = new RegExp(
	`^(\\d{4}-\\d{2}-\\d{2})T23:59:59(?:\\.0+)?${UTC_SUFFIX_PATTERN}$`
);

export type DateOnlyBoundary = 'start' | 'end';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function wallClockParts(value: string, timezone: string): { date: string; time: string } | null {
	const instant = new Date(value);
	if (Number.isNaN(instant.getTime())) return null;
	let formatter = formatterCache.get(timezone);
	if (!formatter) {
		try {
			formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hourCycle: 'h23'
			});
		} catch {
			return null;
		}
		formatterCache.set(timezone, formatter);
	}
	const parts = Object.fromEntries(
		formatter.formatToParts(instant).map((part) => [part.type, part.value])
	);
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: `${parts.hour}:${parts.minute}:${parts.second}`
	};
}

/**
 * A date-only task boundary represents a calendar date, not an instant that
 * should be shifted into the viewer's timezone. Two encodings exist:
 *
 * - Legacy rows (before 2026-09-03) store UTC sentinels: `T00:00:00Z` for a
 *   start, `T23:59:59Z` for a due date.
 * - Current rows store the same boundaries in the user's own timezone
 *   (`2026-09-18` due in America/New_York → `2026-09-19T03:59:59Z`), so the
 *   day reads correctly everywhere. Pass that timezone to recognize them.
 */
export function getDateOnlyCalendarDate(
	value: string | null | undefined,
	boundary: DateOnlyBoundary,
	timezone?: string | null
): string | null {
	if (!value) return null;
	const pattern = boundary === 'start' ? DATE_ONLY_START_PATTERN : DATE_ONLY_END_PATTERN;
	const legacy = pattern.exec(value)?.[1];
	if (legacy) return legacy;
	if (!timezone) return null;
	const wall = wallClockParts(value, timezone);
	if (!wall) return null;
	const expected = boundary === 'start' ? '00:00:00' : '23:59:59';
	return wall.time === expected ? wall.date : null;
}

export function isDateOnlyTaskTimestamp(
	value: string | null | undefined,
	timezone?: string | null
): boolean {
	return (
		getDateOnlyCalendarDate(value, 'start', timezone) !== null ||
		getDateOnlyCalendarDate(value, 'end', timezone) !== null
	);
}
