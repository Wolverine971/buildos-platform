// apps/web/src/lib/services/admin/chat-session-audit-payload.ts
import { formatNumber, prettyJson } from './chat-session-audit-formatters';

export function payloadField(payload: Record<string, unknown>, key: string): unknown {
	return payload ? payload[key] : undefined;
}

export function stringValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	return String(value);
}

export function toNumericValue(value: unknown): number | null {
	const numericValue = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(numericValue) ? numericValue : null;
}

export function recordFromUnknown(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function firstNonEmptyString(...values: unknown[]): string {
	for (const value of values) {
		const text = stringValue(value);
		if (text) return text;
	}
	return '';
}

export function metadataEntries(record: Record<string, unknown>): Array<[string, unknown]> {
	return Object.entries(record).filter(([, value]) => {
		if (value === null || value === undefined || value === '') return false;
		return true;
	});
}

export function metadataValueLabel(value: unknown): string {
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return formatNumber(value);
	if (typeof value === 'string') return value;
	return prettyJson(value);
}

export function recordArray(value: unknown): Record<string, unknown>[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is Record<string, unknown> => {
		return !!entry && typeof entry === 'object' && !Array.isArray(entry);
	});
}

export function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map(stringValue).filter(Boolean);
}

export function numberArray(value: unknown): number[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((entry) => toNumericValue(entry))
		.filter((entry): entry is number => entry !== null);
}
