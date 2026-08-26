// packages/shared-agent-ops/src/calendar/calendar-event-timing.ts
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyAgentCalendarInput(value: string): boolean {
	return DATE_ONLY_PATTERN.test(value.trim());
}

export interface NormalizedAgentCalendarEventTiming {
	allDay: boolean;
	startAt: string;
	endAt: string | null;
	googleEndAt: string;
	providerStartDate: string | null;
	providerEndDate: string | null;
}

function parseDateTime(value: string, fieldName: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		throw new Error(`${fieldName} is required`);
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`${fieldName} must be a valid date/time`);
	}
	return parsed.toISOString();
}

function parseDateOnly(value: string, fieldName: string): string {
	const trimmed = value.trim();
	if (!DATE_ONLY_PATTERN.test(trimmed)) {
		throw new Error(`${fieldName} must be a valid ISO 8601 date`);
	}
	const parsed = new Date(`${trimmed}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
		throw new Error(`${fieldName} must be a valid ISO 8601 date`);
	}
	return trimmed;
}

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

function startOfDateInTimezone(value: string, timezone: string): string {
	const [year, month, day] = value.split('-').map(Number);
	const wallClockUtc = Date.UTC(year, month - 1, day);
	let candidate = wallClockUtc - timeZoneOffsetMs(new Date(wallClockUtc), timezone);
	// A second pass handles dates close to a daylight-saving offset transition.
	candidate = wallClockUtc - timeZoneOffsetMs(new Date(candidate), timezone);
	return new Date(candidate).toISOString();
}

function nextUtcDate(value: string): string {
	const parsed = new Date(`${value}T00:00:00.000Z`);
	parsed.setUTCDate(parsed.getUTCDate() + 1);
	return parsed.toISOString().slice(0, 10);
}

/**
 * Normalize Agent Run event input without turning date-only values into timed
 * midnight-UTC events. Google all-day end dates are exclusive, so an input end
 * date is treated as the user's inclusive final day and advanced by one day.
 */
export function normalizeAgentCalendarEventTiming(
	rawStartAt: string,
	rawEndAt: string | null,
	defaultDurationMs: number,
	timezone: string
): NormalizedAgentCalendarEventTiming {
	const startIsDateOnly = isDateOnlyAgentCalendarInput(rawStartAt);
	const endIsDateOnly = rawEndAt ? isDateOnlyAgentCalendarInput(rawEndAt) : false;

	if (startIsDateOnly) {
		if (rawEndAt && !endIsDateOnly) {
			throw new Error('end_at must also be date-only when start_at is date-only');
		}

		const startDate = parseDateOnly(rawStartAt, 'start_at');
		const inclusiveEndDate = rawEndAt ? parseDateOnly(rawEndAt, 'end_at') : startDate;
		if (inclusiveEndDate < startDate) {
			throw new Error('end_at must be on or after start_at');
		}

		const exclusiveEndDate = nextUtcDate(inclusiveEndDate);
		const exclusiveEndAt = startOfDateInTimezone(exclusiveEndDate, timezone);
		return {
			allDay: true,
			startAt: startOfDateInTimezone(startDate, timezone),
			endAt: rawEndAt ? exclusiveEndAt : null,
			googleEndAt: exclusiveEndAt,
			providerStartDate: startDate,
			providerEndDate: exclusiveEndDate
		};
	}

	if (endIsDateOnly) {
		throw new Error('end_at cannot be date-only when start_at includes a time');
	}

	const startAt = parseDateTime(rawStartAt, 'start_at');
	const endAt = rawEndAt ? parseDateTime(rawEndAt, 'end_at') : null;
	const googleEndAt = endAt ?? new Date(Date.parse(startAt) + defaultDurationMs).toISOString();
	if (Date.parse(googleEndAt) <= Date.parse(startAt)) {
		throw new Error('end_at must be after start_at');
	}

	return {
		allDay: false,
		startAt,
		endAt,
		googleEndAt,
		providerStartDate: null,
		providerEndDate: null
	};
}
