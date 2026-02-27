// apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-datetime.ts
import { fromZonedTime } from 'date-fns-tz';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIMEZONE_SUFFIX_PATTERN = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

export type DateBoundary = 'start' | 'end';

export interface NormalizedCalendarDateTime {
	iso: string;
	hadExplicitTimezone: boolean;
	assumedTimezone: string | null;
}

function normalizeOffset(value: string): string {
	return value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
}

export function hasExplicitTimezone(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed.includes('T')) {
		return false;
	}
	return TIMEZONE_SUFFIX_PATTERN.test(trimmed);
}

export function isValidIanaTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export function normalizeCalendarDateTimeInput(
	rawValue: string,
	timezone: string,
	options: {
		fieldName?: string;
		dateBoundary?: DateBoundary;
	} = {}
): NormalizedCalendarDateTime {
	const value = rawValue.trim();
	const fieldName = options.fieldName ?? 'datetime';
	const dateBoundary = options.dateBoundary ?? 'start';

	if (!value) {
		throw new Error(`${fieldName} is required`);
	}

	try {
		const normalizedValue = normalizeOffset(value);

		if (hasExplicitTimezone(normalizedValue)) {
			const parsed = new Date(normalizedValue);
			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
			}
			return {
				iso: parsed.toISOString(),
				hadExplicitTimezone: true,
				assumedTimezone: null
			};
		}

		if (DATE_ONLY_PATTERN.test(normalizedValue)) {
			const localDateTime =
				dateBoundary === 'end'
					? `${normalizedValue}T23:59:59`
					: `${normalizedValue}T00:00:00`;
			const parsed = fromZonedTime(localDateTime, timezone);

			if (Number.isNaN(parsed.getTime())) {
				throw new Error(`${fieldName} must be a valid ISO 8601 date`);
			}

			return {
				iso: parsed.toISOString(),
				hadExplicitTimezone: false,
				assumedTimezone: timezone
			};
		}

		const parsed = fromZonedTime(normalizedValue, timezone);
		if (Number.isNaN(parsed.getTime())) {
			throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
		}

		return {
			iso: parsed.toISOString(),
			hadExplicitTimezone: false,
			assumedTimezone: timezone
		};
	} catch (error) {
		if (error instanceof Error) {
			throw error;
		}
		throw new Error(`${fieldName} must be a valid ISO 8601 datetime`);
	}
}
