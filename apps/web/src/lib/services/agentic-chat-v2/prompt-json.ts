import type { Json } from '@buildos/shared-types';

/** Convert prompt evaluation and observability values to the database JSON shape. */
export function toJsonValue(value: unknown): Json | null {
	if (value === undefined) return null;
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value as Json;
	}
	if (Array.isArray(value) || typeof value === 'object') {
		return JSON.parse(JSON.stringify(value)) as Json;
	}
	return String(value) as Json;
}
