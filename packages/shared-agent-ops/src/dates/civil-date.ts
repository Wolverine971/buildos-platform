// packages/shared-agent-ops/src/dates/civil-date.ts
//
// One rule for date-only scheduling input across every BuildOS write path.
//
// A bare `YYYY-MM-DD` is a CIVIL DAY in the user's timezone, never an instant.
// `start_at` date-only resolves to the first moment of that day; `due_at` /
// `end_at` date-only resolves to its last second. Previously the web API baked
// the boundary at midnight/23:59:59 UTC and the shared gateway passed the raw
// string to Postgres (midnight UTC), so "September 18" landed on September 17
// 8:00 PM for a New York user on the worker path and 7:59 PM on the web path.
//
// Full datetimes are validated and passed through; only the date-only shape is
// interpreted. With no resolvable timezone we fall back to UTC — never to the
// midnight-UTC pass-through that produced the off-by-one day.

export type CivilDateBoundary = 'start' | 'end';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const CIVIL_DATE_FALLBACK_TIMEZONE = 'UTC';

export class CivilDateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CivilDateError';
	}
}

/** True when the trimmed value is a bare calendar date (`YYYY-MM-DD`). */
export function isDateOnlyValue(value: unknown): boolean {
	return typeof value === 'string' && DATE_ONLY_PATTERN.test(value.trim());
}

/** True when at least one candidate is a bare calendar date. */
export function hasDateOnlyValue(values: readonly unknown[]): boolean {
	return values.some((value) => isDateOnlyValue(value));
}

export function isValidIanaTimezone(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim()) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
		return true;
	} catch {
		return false;
	}
}

/**
 * Offset (ms) between the wall-clock reading of `date` in `timezone` and the
 * instant itself. Mirrors calendar-event-timing.ts so both agree on DST.
 */
function timeZoneOffsetMs(date: Date, timezone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return (
		Date.UTC(
			Number(values.year),
			Number(values.month) - 1,
			Number(values.day),
			Number(values.hour),
			Number(values.minute),
			Number(values.second)
		) - date.getTime()
	);
}

function parseCivilDateParts(value: string): { year: number; month: number; day: number } {
	const match = DATE_ONLY_PATTERN.exec(value);
	if (!match) {
		throw new CivilDateError(`"${value}" is not a calendar date (YYYY-MM-DD)`);
	}
	const [year, month, day] = value.split('-').map(Number);
	const probe = new Date(Date.UTC(year, month - 1, day));
	if (
		probe.getUTCFullYear() !== year ||
		probe.getUTCMonth() !== month - 1 ||
		probe.getUTCDate() !== day
	) {
		throw new CivilDateError(`"${value}" is not a real calendar date`);
	}
	return { year, month, day };
}

/**
 * Resolve a civil day boundary to an ISO instant.
 *
 * `2026-09-18` + `end` + `America/New_York` -> `2026-09-19T03:59:59.000Z`
 * `2026-09-18` + `start` + `America/New_York` -> `2026-09-18T04:00:00.000Z`
 *
 * An unusable timezone falls back to UTC.
 */
export function civilDateBoundaryInstant(
	value: string,
	boundary: CivilDateBoundary,
	timezone?: string | null
): string {
	const { year, month, day } = parseCivilDateParts(value.trim());
	const wallClockUtc =
		boundary === 'end'
			? Date.UTC(year, month - 1, day, 23, 59, 59, 0)
			: Date.UTC(year, month - 1, day, 0, 0, 0, 0);

	if (!isValidIanaTimezone(timezone)) {
		return new Date(wallClockUtc).toISOString();
	}

	const zone = (timezone as string).trim();
	// Two passes settle the boundary when the first guess lands on the other
	// side of a daylight-saving transition.
	let candidate = wallClockUtc - timeZoneOffsetMs(new Date(wallClockUtc), zone);
	candidate = wallClockUtc - timeZoneOffsetMs(new Date(candidate), zone);
	return new Date(candidate).toISOString();
}

/**
 * Strict ISO-8601 instant: a date, a time, and an EXPLICIT zone designator
 * (`Z` or `±HH:MM` / `±HHMM`). A bare `YYYY-MM-DD` is a civil date, and a
 * naive `YYYY-MM-DDTHH:MM:SS` names no instant at all — neither may be
 * rewritten into a zoned rendering, so both must fail this test.
 */
const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** True only for a string that carries a date, a time, and an explicit UTC offset. */
export function isIsoInstantString(value: unknown): boolean {
	return typeof value === 'string' && ISO_INSTANT_PATTERN.test(value.trim());
}

function pad(value: number, width = 2): string {
	return String(value).padStart(width, '0');
}

/**
 * Render an instant as ISO-8601 wall-clock time in `timezone` with its numeric
 * offset — the inverse of `civilDateBoundaryInstant`.
 *
 * `2026-09-23T03:59:59Z` + `America/New_York` -> `2026-09-22T23:59:59-04:00`
 *
 * Sub-second precision is dropped. Returns null when the value is not a
 * parseable instant (a bare date or a naive datetime is not one). An unusable
 * timezone renders in UTC (`+00:00`).
 */
export function instantToZonedIso(value: string, timezone?: string | null): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!ISO_INSTANT_PATTERN.test(trimmed)) return null;

	const epochMs = Date.parse(trimmed);
	if (Number.isNaN(epochMs)) return null;

	// Truncate to whole seconds BEFORE measuring the offset: `timeZoneOffsetMs`
	// reads the zone's wall clock through Intl, which has no sub-second parts,
	// so a millisecond-bearing instant would otherwise report an offset short by
	// those milliseconds (and render `-00:00` for UTC).
	const secondMs = Math.floor(epochMs / 1000) * 1000;
	const offsetMs = isValidIanaTimezone(timezone)
		? timeZoneOffsetMs(new Date(secondMs), (timezone as string).trim())
		: 0;
	// Zone offsets are whole minutes; rounding keeps the label and the shift in
	// agreement even for the historical zones with second-level offsets.
	const offsetMinutes = Math.round(offsetMs / 60_000);

	// The wall clock in `timezone` read off a UTC calendar shifted by the offset.
	const wall = new Date(secondMs + offsetMinutes * 60_000);
	const absOffsetMinutes = Math.abs(offsetMinutes);
	const offsetLabel = `${offsetMinutes < 0 ? '-' : '+'}${pad(
		Math.floor(absOffsetMinutes / 60)
	)}:${pad(absOffsetMinutes % 60)}`;

	return (
		`${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}` +
		`T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}:${pad(wall.getUTCSeconds())}` +
		offsetLabel
	);
}

export interface NormalizeDateOnlyOptions {
	/** Which end of the civil day a bare date means. */
	boundary: CivilDateBoundary;
	/** IANA timezone of the owning user. Missing/invalid falls back to UTC. */
	timezone?: string | null;
	/**
	 * What to do with an already-timed value. `raw` keeps the caller's string
	 * (the shared gateway contract); `iso` returns the UTC ISO instant (the web
	 * API contract).
	 */
	datetimeOutput?: 'raw' | 'iso';
}

/**
 * Normalize one scheduling input. Date-only values become the requested civil
 * boundary in `timezone`; full datetimes are validated and passed through.
 *
 * Throws CivilDateError when the value is not a usable date.
 */
export function normalizeDateOnlyInput(value: string, options: NormalizeDateOnlyOptions): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new CivilDateError('date value is empty');
	}

	if (DATE_ONLY_PATTERN.test(trimmed)) {
		return civilDateBoundaryInstant(trimmed, options.boundary, options.timezone);
	}

	const parsed = Date.parse(trimmed);
	if (Number.isNaN(parsed)) {
		throw new CivilDateError(`"${trimmed}" is not a valid ISO date`);
	}

	return options.datetimeOutput === 'iso' ? new Date(parsed).toISOString() : trimmed;
}

/** Minimal structural shape of the Supabase client used for the lookup. */
type TimezoneReadClient = {
	from: (table: string) => any;
};

/**
 * The single source of truth for a user's civil timezone is `users.timezone`
 * (the same column calendar sync resolves through). Returns null when it cannot
 * be read or is not a valid IANA zone, which callers treat as "fall back to UTC".
 */
export async function resolveUserCivilTimezone(
	client: TimezoneReadClient | null | undefined,
	userId: string | null | undefined
): Promise<string | null> {
	if (!client || !userId) return null;
	try {
		const { data } = await client
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.maybeSingle();
		const timezone = (data as { timezone?: unknown } | null)?.timezone;
		return isValidIanaTimezone(timezone) ? (timezone as string).trim() : null;
	} catch {
		return null;
	}
}
