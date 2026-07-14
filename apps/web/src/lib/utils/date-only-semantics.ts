// apps/web/src/lib/utils/date-only-semantics.ts
const UTC_SUFFIX_PATTERN = '(?:Z|\\+00(?::00)?)';
const DATE_ONLY_START_PATTERN = new RegExp(
	`^(\\d{4}-\\d{2}-\\d{2})T00:00:00(?:\\.0+)?${UTC_SUFFIX_PATTERN}$`
);
const DATE_ONLY_END_PATTERN = new RegExp(
	`^(\\d{4}-\\d{2}-\\d{2})T23:59:59(?:\\.0+)?${UTC_SUFFIX_PATTERN}$`
);

export type DateOnlyBoundary = 'start' | 'end';

/**
 * BuildOS stores date-only task boundaries as UTC sentinels. They represent a
 * calendar date, not an instant that should be shifted into the viewer's timezone.
 */
export function getDateOnlyCalendarDate(
	value: string | null | undefined,
	boundary: DateOnlyBoundary
): string | null {
	if (!value) return null;
	const pattern = boundary === 'start' ? DATE_ONLY_START_PATTERN : DATE_ONLY_END_PATTERN;
	return pattern.exec(value)?.[1] ?? null;
}

export function isDateOnlyTaskTimestamp(value: string | null | undefined): boolean {
	return (
		getDateOnlyCalendarDate(value, 'start') !== null ||
		getDateOnlyCalendarDate(value, 'end') !== null
	);
}
