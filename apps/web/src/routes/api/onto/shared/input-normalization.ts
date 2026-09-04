// apps/web/src/routes/api/onto/shared/input-normalization.ts
import {
	CivilDateError,
	isDateOnlyValue,
	normalizeDateOnlyInput,
	resolveUserCivilTimezone
} from '@buildos/shared-agent-ops';
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

/**
 * True when this value needs a user timezone to be interpreted. Routes call it
 * before paying for the `users.timezone` read.
 */
export function needsCivilTimezone(...values: unknown[]): boolean {
	return values.some((value) => isDateOnlyValue(value));
}

/** Re-exported so routes resolve the same timezone source as the gateway. */
export { resolveUserCivilTimezone };

export type CalendarSyncMode = 'auto' | 'none';

/**
 * Explicit switch for task calendar side effects on create/update. Default
 * 'auto' preserves today's behavior; 'none' means the caller asked for no
 * calendar events or time blocks, so nothing is created or enqueued.
 */
export function normalizeCalendarSyncInput(value: unknown): Normalized<CalendarSyncMode> {
	if (value === undefined || value === null || value === '') return ok('auto');
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'auto' || normalized === 'none') return ok(normalized);
	}
	return err('calendar_sync must be one of: auto, none');
}

export type TaskCalendarEventReceipt = {
	id: string;
	title: string;
	start_at: string;
	end_at: string;
};

/**
 * What the calendar side of a task write actually did. Included in the API
 * response so a tool receipt states real side effects instead of inferring
 * them from the task row alone.
 */
export type TaskCalendarSyncReceipt = {
	calendar_sync: 'synced' | 'skipped' | 'unchanged' | 'failed';
	calendar_events?: TaskCalendarEventReceipt[];
	removed_calendar_event_count?: number;
};

export function toTaskCalendarSyncReceipt(result: unknown): TaskCalendarSyncReceipt {
	if (!result || typeof result !== 'object' || !Array.isArray((result as any).events)) {
		return { calendar_sync: 'synced', calendar_events: [] };
	}
	const summary = result as {
		events: TaskCalendarEventReceipt[];
		removed_event_count?: number;
	};
	return {
		calendar_sync: 'synced',
		calendar_events: summary.events,
		...(typeof summary.removed_event_count === 'number' && summary.removed_event_count > 0
			? { removed_calendar_event_count: summary.removed_event_count }
			: {})
	};
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

/**
 * A bare `YYYY-MM-DD` is a civil day in the user's timezone: `start` opens it,
 * `end` closes it at 23:59:59 local. Passing no timezone falls back to UTC,
 * which is what this route did for every user before timezones were threaded in.
 */
export function normalizeDateTimeInput(
	value: unknown,
	field: string,
	boundary: DateBoundary,
	timezone?: string | null
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

	try {
		return ok(
			normalizeDateOnlyInput(trimmed, {
				boundary,
				timezone,
				datetimeOutput: 'iso'
			})
		);
	} catch (error) {
		if (error instanceof CivilDateError) {
			return err(`${field} must be a valid date`);
		}
		throw error;
	}
}
