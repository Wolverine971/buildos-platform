// apps/worker/src/http/queueMetadata.ts
import type { Json } from '@buildos/shared-types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withoutUndefinedValues(record: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

/**
 * Merge request metadata into an existing deduplicated queue job without
 * erasing scheduler-owned values when an optional request field is undefined.
 */
export function mergeQueueMetadata(
	existingMetadata: unknown,
	requestMetadata: Record<string, unknown>
): Json {
	const existing = isRecord(existingMetadata) ? existingMetadata : {};
	const existingOptions = isRecord(existing.options) ? existing.options : {};
	const requestOptions = isRecord(requestMetadata.options) ? requestMetadata.options : {};

	return {
		...existing,
		...withoutUndefinedValues(requestMetadata),
		options: {
			...existingOptions,
			...withoutUndefinedValues(requestOptions)
		}
	} as Json;
}
