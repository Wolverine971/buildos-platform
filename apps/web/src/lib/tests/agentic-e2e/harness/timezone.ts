// apps/web/src/lib/tests/agentic-e2e/harness/timezone.ts
//
// The single zone the harness user is provisioned in AND the zone every
// date-bearing assertion resolves "today"/"friday" in. The prompt clock reads
// `users.timezone`, so seeding the user with this constant and asserting in it
// keeps the model and the scenario on the same calendar day regardless of the
// wall-clock hour the paid run happens to start at.
export const HARNESS_TIMEZONE = 'America/New_York';

/** Offset (ms) that `timeZone` was running at the given instant. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(instant);
	const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	// `hour` is 24-hour but renders midnight as "24" in some ICU versions.
	const hour = value.hour === '24' ? '00' : value.hour;
	const asUtc = Date.parse(
		`${value.year}-${value.month}-${value.day}T${hour}:${value.minute}:${value.second}Z`
	);
	return asUtc - instant.getTime();
}

/**
 * Resolve a civil date + civil time in `timeZone` to the exact UTC instant.
 *
 * Fixtures and oracles in this suite are written as New York civil days ("due
 * September 18"), but every column stores an instant. Hard-coding -04:00 breaks
 * the moment a case crosses the November DST boundary — which the Cedar House
 * battery does (its project runs September 14 → November 20). Two passes settle
 * the offset correctly on either side of a transition.
 */
export function zonedInstant(
	civilDate: string,
	civilTime: string,
	timeZone = HARNESS_TIMEZONE
): string {
	const naive = Date.parse(`${civilDate}T${civilTime}Z`);
	if (Number.isNaN(naive)) {
		throw new Error(`[agentic-e2e] invalid civil timestamp ${civilDate}T${civilTime}`);
	}
	const firstGuess = new Date(naive - zoneOffsetMs(new Date(naive), timeZone));
	const settled = new Date(naive - zoneOffsetMs(firstGuess, timeZone));
	return settled.toISOString();
}

/** The last representable instant of a civil day in `timeZone` (23:59:59.000 local). */
export function zonedEndOfDay(civilDate: string, timeZone = HARNESS_TIMEZONE): string {
	return zonedInstant(civilDate, '23:59:59.000', timeZone);
}

/** The first instant of a civil day in `timeZone` (00:00:00.000 local). */
export function zonedStartOfDay(civilDate: string, timeZone = HARNESS_TIMEZONE): string {
	return zonedInstant(civilDate, '00:00:00.000', timeZone);
}
