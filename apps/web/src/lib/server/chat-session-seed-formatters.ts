// apps/web/src/lib/server/chat-session-seed-formatters.ts
export type CompactSeedTextOptions = {
	trimTruncatedEnd?: boolean;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readTrimmedString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readFiniteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Collapse seed text to one line and truncate it with an ellipsis.
 *
 * Most seed surfaces trim whitespace at the truncation boundary. The inbox
 * surface historically preserved that boundary, so callers can opt out while
 * sharing the rest of the formatter behavior.
 */
export function compactSeedText(
	value: unknown,
	maxLength: number,
	options: CompactSeedTextOptions = {}
): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxLength) return normalized;

	const prefix = normalized.slice(0, Math.max(0, maxLength - 3));
	return `${options.trimTruncatedEnd === false ? prefix : prefix.trimEnd()}...`;
}

export function appendSeedSection(
	lines: string[],
	title: string,
	body: string | string[] | null | undefined
): void {
	const values = Array.isArray(body) ? body.filter(Boolean) : body ? [body] : [];
	if (values.length === 0) return;
	lines.push('', `## ${title}`, ...values);
}

export function normalizeRecordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter((item): item is Record<string, unknown> => isRecord(item))
		: [];
}
