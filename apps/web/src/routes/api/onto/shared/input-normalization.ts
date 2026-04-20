// apps/web/src/routes/api/onto/shared/input-normalization.ts
import { isValidTypeKey } from '$lib/types/onto';

type Normalized<T> = { ok: true; value: T } | { ok: false; error: string };

type DateBoundary = 'start' | 'end';

const PRIORITY_LABELS: Record<string, number> = {
	urgent: 1,
	high: 1,
	medium: 3,
	normal: 3,
	low: 5
};

function ok<T>(value: T): Normalized<T> {
	return { ok: true, value };
}

function err<T = never>(error: string): Normalized<T> {
	return { ok: false, error };
}

function clampPriority(value: number): number {
	return Math.min(5, Math.max(1, Math.round(value)));
}

function parseDateOnly(value: string, boundary: DateBoundary): string | null {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return null;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const hour = boundary === 'end' ? 23 : 0;
	const minute = boundary === 'end' ? 59 : 0;
	const second = boundary === 'end' ? 59 : 0;
	const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}

	return date.toISOString();
}

export function normalizeRequiredString(value: unknown, field: string): Normalized<string> {
	if (typeof value !== 'string') {
		return err(`${field} is required`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return err(`${field} is required`);
	}

	return ok(trimmed);
}

export function normalizeOptionalString(value: unknown): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;
	if (typeof value !== 'string') return undefined;

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export function normalizeTypeKeyInput(value: unknown, scope: string, fallback: string): string {
	if (typeof value !== 'string') {
		return fallback;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}

	return isValidTypeKey(trimmed, scope) ? trimmed : fallback;
}

export function normalizePriorityInput(
	value: unknown,
	options: { defaultValue?: number; allowNull?: boolean } = {}
): Normalized<number | null | undefined> {
	if (value === undefined) {
		return ok(options.defaultValue);
	}

	if (value === null || value === '') {
		return ok(options.allowNull ? null : options.defaultValue);
	}

	if (typeof value === 'number') {
		return Number.isFinite(value) ? ok(clampPriority(value)) : err('priority must be a number');
	}

	if (typeof value === 'string') {
		const trimmed = value.trim().toLowerCase();
		if (!trimmed) {
			return ok(options.allowNull ? null : options.defaultValue);
		}

		const labelValue = PRIORITY_LABELS[trimmed];
		if (labelValue !== undefined) {
			return ok(labelValue);
		}

		const numericValue = Number(trimmed);
		if (Number.isFinite(numericValue)) {
			return ok(clampPriority(numericValue));
		}
	}

	return err('priority must be a number from 1 to 5');
}

export function normalizeDateTimeInput(
	value: unknown,
	field: string,
	boundary: DateBoundary
): Normalized<string | null | undefined> {
	if (value === undefined) {
		return ok(undefined);
	}

	if (value === null) {
		return ok(null);
	}

	if (value instanceof Date) {
		return Number.isNaN(value.getTime())
			? err(`${field} must be a valid date`)
			: ok(value.toISOString());
	}

	if (typeof value !== 'string') {
		return err(`${field} must be a valid date`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return ok(null);
	}

	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const dateOnly = parseDateOnly(trimmed, boundary);
		return dateOnly ? ok(dateOnly) : err(`${field} must be a valid date`);
	}

	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime())
		? err(`${field} must be a valid date`)
		: ok(parsed.toISOString());
}
