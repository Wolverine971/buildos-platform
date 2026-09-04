// packages/agentic-chat-runtime/src/tools/read-result-timezone.ts
//
// Read-side civil-date rendering. The write side already resolves a bare
// `YYYY-MM-DD` to a civil-day boundary in the user's zone
// (`civilDateBoundaryInstant`), so a New York user's "due September 22" is
// stored as `2026-09-23T03:59:59+00:00`. Read tools handed that raw instant
// back to the model, and a cheap model reads the UTC calendar day — so every
// date-only due date came back one day late.
//
// This module is the inverse projection: after a read runs, every scheduling
// instant in its payload is re-rendered as wall-clock time in the user's zone
// with an explicit offset (`2026-09-22T23:59:59-04:00`). The model then reads
// the same calendar day the user typed, and the offset keeps the value an
// unambiguous instant for any downstream re-send.
//
// Two hard rules keep this from corrupting payloads:
//   1. Only SCHEDULE-shaped keys are eligible (`*_at`, `*_date`, `*_time`,
//      `*_min`, `*_max`, or exactly start/end/due/deadline/when). Prose fields
//      are explicitly denied even if a future key would match by suffix.
//   2. Only STRICT ISO instants are rewritten. A bare `YYYY-MM-DD` is a civil
//      date and a naive datetime names no instant — neither is touched.
//
// With no resolvable timezone the input is returned byte-identically (same
// reference), so hosts without a timezone keep today's behavior exactly.

import {
	instantToZonedIso,
	isIsoInstantString,
	isValidIanaTimezone
} from '@buildos/shared-agent-ops/dates/civil-date';

/** Key suffixes that mark a schedule field rather than content. */
const SCHEDULE_KEY_SUFFIXES = ['_at', '_date', '_time', '_min', '_max'] as const;

/** Whole keys that mark a schedule field. */
const SCHEDULE_KEY_NAMES: ReadonlySet<string> = new Set([
	'start',
	'end',
	'due',
	'deadline',
	'when'
]);

/**
 * Content keys that must never be rewritten. The suffix allowlist already
 * excludes every one of them; this guard exists so a future `description_at`
 * or `summary_time` style key cannot start rewriting prose.
 */
const CONTENT_KEYS: ReadonlySet<string> = new Set([
	'content',
	'body_markdown',
	'markdown',
	'body',
	'text',
	'description',
	'summary',
	'snippet',
	'title',
	'name',
	'id'
]);

/** Read payloads are shallow JSON; this only bounds pathological nesting. */
const MAX_DEPTH = 24;

function isScheduleKey(key: string): boolean {
	if (CONTENT_KEYS.has(key) || key.endsWith('_id')) return false;
	if (SCHEDULE_KEY_NAMES.has(key)) return true;
	for (const suffix of SCHEDULE_KEY_SUFFIXES) {
		if (key.endsWith(suffix)) return true;
	}
	return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function projectValue(
	value: unknown,
	key: string | null,
	timezone: string,
	depth: number
): unknown {
	if (typeof value === 'string') {
		// Never walk into strings; only a schedule key can license a rewrite.
		if (key === null || !isScheduleKey(key) || !isIsoInstantString(value)) return value;
		return instantToZonedIso(value, timezone) ?? value;
	}
	if (depth >= MAX_DEPTH) return value;

	if (Array.isArray(value)) {
		let copy: unknown[] | null = null;
		for (let index = 0; index < value.length; index += 1) {
			const original = value[index];
			const next = projectValue(original, key, timezone, depth + 1);
			if (next !== original) {
				if (copy === null) copy = value.slice();
				copy[index] = next;
			}
		}
		return copy ?? value;
	}

	if (isPlainObject(value)) {
		let copy: Record<string, unknown> | null = null;
		for (const entryKey of Object.keys(value)) {
			const original = value[entryKey];
			const next = projectValue(original, entryKey, timezone, depth + 1);
			if (next !== original) {
				// Spread preserves key order; only changed paths allocate.
				if (copy === null) copy = { ...value };
				copy[entryKey] = next;
			}
		}
		return copy ?? value;
	}

	return value;
}

/**
 * Re-render every scheduling instant in a read result as wall-clock time in
 * `timezone`. Pure: the input is never mutated, and containers are copied only
 * along paths that actually changed. Returns the input reference unchanged when
 * `timezone` is missing or not a usable IANA zone.
 */
export function projectReadResultInstantsToTimezone<TResult>(
	result: TResult,
	timezone: string | null | undefined
): TResult {
	if (!isValidIanaTimezone(timezone)) return result;
	return projectValue(result, null, timezone.trim(), 0) as TResult;
}
