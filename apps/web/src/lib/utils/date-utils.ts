// apps/web/src/lib/utils/date-utils.ts
/**
 * Centralized date utility functions for consistent UTC date handling
 * All dates from Supabase are in UTC format (timestamptz)
 */
import { format, parseISO, isToday, isTomorrow, isBefore, startOfDay, addDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

/**
 * Format a UTC date string for display (date only)
 * @param dateString - ISO date string from database
 * @returns Formatted date string (e.g., "Jul 24, 2025")
 */
export function formatDateForDisplay(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		// For YYYY-MM-DD format dates, parse them in local timezone to avoid timezone shift
		if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
			// Parse as local date by adding time component
			const date = new Date(dateString + 'T12:00:00');
			if (isNaN(date.getTime())) return '';

			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric'
			});
		}

		// For other date formats, use standard parsing
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	} catch (error) {
		console.warn('Failed to format date:', dateString, error);
		return '';
	}
}

/**
 * Format a UTC date string for display (date and time)
 * @param dateString - ISO date string from database
 * @returns Formatted date/time string (e.g., "Jul 24, 2025, 3:30 PM")
 */
export function formatDateTimeForDisplay(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		// Use local time components for display
		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const month = months[date.getMonth()];
		const day = date.getDate();
		const year = date.getFullYear();
		let hours = date.getHours();
		const minutes = date.getMinutes();
		const ampm = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12 || 12;

		return `${month} ${day}, ${year}, ${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
	} catch (error) {
		console.warn('Failed to format datetime:', dateString, error);
		return '';
	}
}

/**
 * Convert datetime-local input to UTC ISO string
 * @param datetimeLocal - Value from datetime-local input (YYYY-MM-DDTHH:mm)
 * @returns ISO string in UTC or null
 */
export function convertDatetimeLocalToUTC(datetimeLocal: string | null | undefined): string | null {
	if (!datetimeLocal) return null;

	try {
		// Let Date parse as local time automatically
		const date = new Date(datetimeLocal);

		if (isNaN(date.getTime())) return null;

		return date.toISOString();
	} catch (error) {
		console.warn('Failed to convert from datetime-local:', datetimeLocal, error);
		return null;
	}
}

/**
 * Convert UTC ISO string to datetime-local input value
 * @param isoString - ISO date string from database
 * @returns Formatted string for datetime-local input (YYYY-MM-DDTHH:mm)
 */
export function convertUTCToDatetimeLocal(isoString: string | null | undefined): string {
	if (!isoString) return '';

	try {
		const date = new Date(isoString);
		if (isNaN(date.getTime())) return '';

		// Get local components for display in input
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${year}-${month}-${day}T${hours}:${minutes}`;
	} catch (error) {
		console.warn('Failed to convert to datetime-local:', isoString, error);
		return '';
	}
}

/**
 * Convert date-only input to UTC ISO string (start of day)
 * @param dateOnly - Value from date input (YYYY-MM-DD)
 * @returns ISO string in UTC or null
 */
export function convertDateOnlyToUTC(dateOnly: string | null | undefined): string | null {
	if (!dateOnly) return null;

	try {
		// Create a date in the user's local timezone at midnight
		// This ensures the date represents the start of that day in the user's timezone
		const localDate = new Date(dateOnly + 'T00:00:00');

		if (isNaN(localDate.getTime())) return null;

		// Convert to UTC ISO string
		return localDate.toISOString();
	} catch (error) {
		console.warn('Failed to convert from date-only:', dateOnly, error);
		return null;
	}
}

/**
 * Convert UTC ISO string to date-only input value
 * @param isoString - ISO date string from database
 * @returns Formatted string for date input (YYYY-MM-DD)
 */
export function convertUTCToDateOnly(isoString: string | null | undefined): string {
	if (!isoString) return '';

	try {
		// If already in YYYY-MM-DD format, return as-is
		if (typeof isoString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(isoString)) {
			return isoString;
		}

		const date = new Date(isoString);
		if (isNaN(date.getTime())) return '';

		// Use UTC date parts to avoid timezone conversion issues
		const year = date.getUTCFullYear();
		const month = String(date.getUTCMonth() + 1).padStart(2, '0');
		const day = String(date.getUTCDate()).padStart(2, '0');

		return `${year}-${month}-${day}`;
	} catch (error) {
		console.warn('Failed to convert to date-only:', isoString, error);
		return '';
	}
}

/**
 * Check if a date is in the past (comparing dates in user's timezone)
 * @param dateString - ISO date string from database
 * @returns true if the date is before today
 */
export function isDateInPast(dateString: string | null | undefined): boolean {
	if (!dateString) return false;

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return false;

		// Compare dates in user's local timezone
		const today = new Date();
		const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
		const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

		return dateOnly < todayOnly;
	} catch (error) {
		console.warn('Failed to check if date is in past:', dateString, error);
		return false;
	}
}

/**
 * Get the number of days between two dates
 * @param startDate - ISO date string
 * @param endDate - ISO date string
 * @returns Number of days between dates
 */
export function getDaysBetween(
	startDate: string | null | undefined,
	endDate: string | null | undefined
): number {
	if (!startDate || !endDate) return 0;

	try {
		const start = new Date(startDate);
		const end = new Date(endDate);

		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

		return diffDays;
	} catch (error) {
		console.warn('Failed to calculate days between:', startDate, endDate, error);
		return 0;
	}
}

/**
 * Format a UTC date for Google Calendar API
 * Preserves the UTC time while formatting for calendar events
 */
// Replace your function with this more explicit approach:
export function formatDateForGoogleCalendar(dateString: string): string {
	if (!dateString) {
		throw new Error('Date string is required');
	}

	const date = new Date(dateString);
	if (isNaN(date.getTime())) {
		throw new Error('Invalid date string provided');
	}

	return date.toISOString();
}

/**
 * Calculate end time for a calendar event in UTC
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
	const start = new Date(startTime);
	if (isNaN(start.getTime())) return '';

	// Add duration in milliseconds
	const endTime = new Date(start.getTime() + durationMinutes * 60 * 1000);
	return endTime.toISOString();
}

/**
 * Get today's date at midnight UTC
 * @returns Date object set to midnight UTC
 */
export function getTodayUTC(): Date {
	const today = new Date();
	const todayUTC = new Date(today.toISOString().split('T')[0] + 'T00:00:00Z');
	return todayUTC;
}

/**
 * Add days to a date (preserving UTC)
 * @param dateString - ISO date string
 * @param days - Number of days to add (can be negative)
 * @returns ISO string of the new date
 */
export function addDaysToDate(dateString: string | null | undefined, days: number): string | null {
	if (!dateString) return null;

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return null;

		date.setDate(date.getDate() + days);
		return date.toISOString();
	} catch (error) {
		console.warn('Failed to add days to date:', dateString, days, error);
		return null;
	}
}

// Legacy functions - updated to use UTC properly

// Helper function to check if a task is overdue
export function isTaskOverdue(startDate: string, timezone?: string): boolean {
	if (!startDate) return false;
	return isDateBeforeToday(startDate, timezone);
}

// Helper function to get days overdue (only for actually overdue tasks)
export function getDaysOverdue(startDate: string, timezone?: string): number {
	if (!isTaskOverdue(startDate, timezone)) return 0;

	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const taskDate = toZonedTime(parseISO(startDate), tz);
	const today = toZonedTime(new Date(), tz);

	const diffTime = startOfDay(today).getTime() - startOfDay(taskDate).getTime();
	const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

	return Math.max(0, diffDays);
}

// Helper function to categorize task by date

export function categorizeTaskByDate(startDate: string | null, timezone?: string): string {
	if (!startDate) return 'unscheduled';

	if (isDateBeforeToday(startDate, timezone)) return 'overdue';
	if (isDateToday(startDate, timezone)) return 'today';
	if (isDateTomorrow(startDate, timezone)) return 'tomorrow';
	return 'upcoming';
}

/**
 * Format time only from UTC date string
 * @param dateString - ISO date string from database
 * @returns Formatted time string (e.g., "3:30 PM")
 */
export function formatTimeOnly(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		let hours = date.getHours();
		const minutes = date.getMinutes();
		const ampm = hours >= 12 ? 'PM' : 'AM';
		hours = hours % 12 || 12;

		return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
	} catch (error) {
		console.warn('Failed to format time:', dateString, error);
		return '';
	}
}

/**
 * Format date in short format
 * @param dateString - ISO date string from database
 * @returns Formatted short date (e.g., "Jul 24")
 */
export function formatDateShort(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const months = [
			'Jan',
			'Feb',
			'Mar',
			'Apr',
			'May',
			'Jun',
			'Jul',
			'Aug',
			'Sep',
			'Oct',
			'Nov',
			'Dec'
		];
		const month = months[date.getMonth()];
		const day = date.getDate();

		return `${month} ${day}`;
	} catch (error) {
		console.warn('Failed to format short date:', dateString, error);
		return '';
	}
}

/**
 * Format date for mobile display
 * @param dateString - ISO date string from database
 * @returns Formatted mobile date (e.g., "7/24")
 */
export function formatDateMobile(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const month = date.getMonth() + 1;
		const day = date.getDate();

		return `${month}/${day}`;
	} catch (error) {
		console.warn('Failed to format mobile date:', dateString, error);
		return '';
	}
}

/**
 * Format date with time in a compact format
 * @param dateString - ISO date string from database
 * @returns Formatted date with time (e.g., "Jul 24 at 3:30 PM")
 */
export function formatDateWithTime(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const dateStr = formatDateShort(dateString);
		const timeStr = formatTimeOnly(dateString);

		return `${dateStr} at ${timeStr}`;
	} catch (error) {
		console.warn('Failed to format date with time:', dateString, error);
		return '';
	}
}

/**
 * Format relative time (e.g., "2 hours ago", "3 days ago")
 * @param dateString - ISO date string from database
 * @returns Formatted relative time string
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
	if (!dateString) return '';

	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';

		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffSecs = Math.floor(diffMs / 1000);
		const diffMins = Math.floor(diffSecs / 60);
		const diffHours = Math.floor(diffMins / 60);
		const diffDays = Math.floor(diffHours / 24);

		if (diffSecs < 60) {
			return 'just now';
		} else if (diffMins < 60) {
			return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
		} else if (diffHours < 24) {
			return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
		} else if (diffDays < 7) {
			return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
		} else {
			return formatDateForDisplay(dateString);
		}
	} catch (error) {
		console.warn('Failed to format relative time:', dateString, error);
		return formatDateForDisplay(dateString);
	}
}

/**
 * Format date for input field (converts from database format to input format)
 * @param dateString - ISO date string from database
 * @returns Formatted string for date input (YYYY-MM-DD)
 */
export function formatDateForInput(dateString: string | null | undefined): string {
	return convertUTCToDateOnly(dateString);
}

/**
 * Format datetime for input field
 * @param dateString - ISO date string from database
 * @returns Formatted string for datetime-local input (YYYY-MM-DDTHH:mm)
 */
export function formatDateTimeForInput(dateString: string | null | undefined): string {
	return convertUTCToDatetimeLocal(dateString);
}

/**
 * Parse date from input field to database format
 * @param inputValue - Value from date input (YYYY-MM-DD)
 * @returns ISO string in UTC or null
 */
export function parseDateFromInput(inputValue: string | null | undefined): string | null {
	return convertDateOnlyToUTC(inputValue);
}

/**
 * Parse datetime from input field to database format
 * @param inputValue - Value from datetime-local input (YYYY-MM-DDTHH:mm)
 * @returns ISO string in UTC or null
 */
export function parseDateTimeFromInput(inputValue: string | null | undefined): string | null {
	return convertDatetimeLocalToUTC(inputValue);
}

/**
 * Simplified date utilities for Supabase timestamptz handling
 * Key principle: Supabase timestamptz is always stored in UTC,
 * but we need to handle user's local timezone for display and comparison
 */

/**
 * Get today's date in user's timezone as YYYY-MM-DD
 */
export function getTodayInUserTimezone(timezone?: string): string {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const now = new Date();
	const zonedDate = toZonedTime(now, tz);
	return format(startOfDay(zonedDate), 'yyyy-MM-dd');
}

/**
 * Get tomorrow's date in user's timezone as YYYY-MM-DD
 */
export function getTomorrowInUserTimezone(): string {
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	return (
		tomorrow.getFullYear() +
		'-' +
		String(tomorrow.getMonth() + 1).padStart(2, '0') +
		'-' +
		String(tomorrow.getDate()).padStart(2, '0')
	);
}

/**
 * Get date N days from today in user's timezone as YYYY-MM-DD
 */
export function getDatePlusDays(days: number, timezone?: string): string {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const now = new Date();
	const zonedDate = toZonedTime(now, tz);
	const futureDate = addDays(startOfDay(zonedDate), days);
	return format(futureDate, 'yyyy-MM-dd');
}

/**
 * Convert a timestamptz from Supabase to user's local date (YYYY-MM-DD)
 * This accounts for timezone differences
 */
export function timestamptzToLocalDate(timestamptz: string, timezone?: string): string {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const date = parseISO(timestamptz);
	const zonedDate = toZonedTime(date, tz);
	return format(startOfDay(zonedDate), 'yyyy-MM-dd');
}

/**
 * Check if a timestamptz date is before today in user's timezone
 */
export function isDateBeforeToday(dateString: string, timezone?: string): boolean {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const date = parseISO(dateString);
	const zonedDate = toZonedTime(date, tz);
	const today = toZonedTime(new Date(), tz);
	return isBefore(startOfDay(zonedDate), startOfDay(today));
}

/**
 * Check if a timestamptz date is today in user's timezone
 */
export function isDateToday(dateString: string, timezone?: string): boolean {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const date = parseISO(dateString);
	const zonedDate = toZonedTime(date, tz);
	const todayInTz = toZonedTime(new Date(), tz);

	// Compare year, month, and day in the target timezone
	return (
		zonedDate.getFullYear() === todayInTz.getFullYear() &&
		zonedDate.getMonth() === todayInTz.getMonth() &&
		zonedDate.getDate() === todayInTz.getDate()
	);
}

/**
 * Check if a timestamptz date is tomorrow in user's timezone
 * CRITICAL FIX: Must use startOfDay() + addDays() for timezone-safe date manipulation
 * Calling setDate() on toZonedTime() result corrupts the timezone offset!
 */
export function isDateTomorrow(dateString: string, timezone?: string): boolean {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const date = parseISO(dateString);
	const zonedDate = toZonedTime(date, tz);
	const todayInTz = toZonedTime(new Date(), tz);

	// FIXED: Use addDays() + startOfDay() instead of setDate() to preserve timezone offset
	const tomorrowInTz = addDays(startOfDay(todayInTz), 1);

	// Compare year, month, and day in the target timezone
	return (
		zonedDate.getFullYear() === tomorrowInTz.getFullYear() &&
		zonedDate.getMonth() === tomorrowInTz.getMonth() &&
		zonedDate.getDate() === tomorrowInTz.getDate()
	);
}

/**
 * Get date ranges for queries (in user's timezone)
 */
export function getTaskDateRanges(timezone?: string) {
	const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
	const now = new Date();
	const zonedNow = toZonedTime(now, tz);
	const today = format(startOfDay(zonedNow), 'yyyy-MM-dd');
	const weekEnd = format(addDays(startOfDay(zonedNow), 7), 'yyyy-MM-dd');

	return {
		today,
		weekEnd
	};
}

/**
 * Format full date for display (e.g., "Friday, January 24th, 2025")
 * @param date - Date object or ISO string
 * @returns Formatted full date string
 */
export function formatFullDate(date: Date | string): string {
	try {
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		if (isNaN(dateObj.getTime())) return '';

		const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		const months = [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December'
		];

		const dayName = days[dateObj.getDay()];
		const monthName = months[dateObj.getMonth()];
		const day = dateObj.getDate();
		const year = dateObj.getFullYear();

		// Add ordinal suffix
		let suffix = 'th';
		if (day === 1 || day === 21 || day === 31) suffix = 'st';
		else if (day === 2 || day === 22) suffix = 'nd';
		else if (day === 3 || day === 23) suffix = 'rd';

		return `${dayName}, ${monthName} ${day}${suffix}, ${year}`;
	} catch (error) {
		console.warn('Failed to format full date:', date, error);
		return '';
	}
}

/**
 * Calculate difference in days between two dates
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of days difference
 */
export function differenceInDays(startDate: Date | string, endDate: Date | string): number {
	try {
		const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
		const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		return diffDays;
	} catch (error) {
		console.warn('Failed to calculate days difference:', startDate, endDate, error);
		return 0;
	}
}

/**
 * Calculate difference in hours between two dates
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of hours difference
 */
export function differenceInHours(startDate: Date | string, endDate: Date | string): number {
	try {
		const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
		const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

		if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

		const diffTime = Math.abs(end.getTime() - start.getTime());
		const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

		return diffHours;
	} catch (error) {
		console.warn('Failed to calculate hours difference:', startDate, endDate, error);
		return 0;
	}
}

// Add this to your existing date-utils.ts file

export function isWithinLast24Hours(dateString: string | null): boolean {
	if (!dateString) return false;

	try {
		const date = new Date(dateString);
		const now = new Date();
		const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

		return date > twentyFourHoursAgo;
	} catch (error) {
		return false;
	}
}

export function getHoursAgo(dateString: string): number {
	try {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		return Math.floor(diffMs / (1000 * 60 * 60));
	} catch (error) {
		return -1;
	}
}

export function getTimeAgoText(dateString: string): string {
	const hours = getHoursAgo(dateString);

	if (hours < 0) return '';
	if (hours === 0) return 'Just now';
	if (hours === 1) return '1 hour ago';
	if (hours < 24) return `${hours} hours ago`;

	const days = Math.floor(hours / 24);
	if (days === 1) return '1 day ago';
	return `${days} days ago`;
}

/**
 * Parse natural language date expressions into YYYY-MM-DD format
 * Used by brain dump processor to convert human-readable dates
 * @param dateExpression - Natural language date like "30 days", "next week", etc.
 * @param referenceDate - Base date to calculate from (defaults to today)
 * @returns YYYY-MM-DD string or null if not parseable
 */
export function parseNaturalLanguageDate(
	dateExpression: string,
	referenceDate?: Date
): string | null {
	if (!dateExpression) return null;

	const today = referenceDate || new Date();
	const expr = dateExpression.toLowerCase().trim();

	try {
		// Handle "today"
		if (expr === 'today') {
			return formatDateForInput(today.toISOString());
		}

		// Handle "tomorrow"
		if (expr === 'tomorrow') {
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);
			return formatDateForInput(tomorrow.toISOString());
		}

		// Handle "next week" - defaults to next Monday
		if (expr.includes('next week')) {
			const nextMonday = new Date(today);
			const daysUntilMonday = (1 - today.getDay() + 7) % 7 || 7;
			nextMonday.setDate(today.getDate() + daysUntilMonday);
			return formatDateForInput(nextMonday.toISOString());
		}

		// Handle "next [day]" - next Monday, next Friday, etc.
		const nextDayMatch = expr.match(
			/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
		);
		if (nextDayMatch) {
			const targetDay = nextDayMatch[1];
			const dayMap = {
				monday: 1,
				tuesday: 2,
				wednesday: 3,
				thursday: 4,
				friday: 5,
				saturday: 6,
				sunday: 0
			};
			const targetDayIndex = dayMap[targetDay as keyof typeof dayMap];

			const nextTargetDay = new Date(today);
			const daysUntilTarget = (targetDayIndex - today.getDay() + 7) % 7 || 7;
			nextTargetDay.setDate(today.getDate() + daysUntilTarget);
			return formatDateForInput(nextTargetDay.toISOString());
		}

		// Handle "in X days/weeks/months"
		const inTimeMatch = expr.match(/in\s+(\d+)\s+(days?|weeks?|months?)/);
		if (inTimeMatch) {
			const amountStr = inTimeMatch[1];
			const unit = inTimeMatch[2];
			if (!amountStr || !unit) {
				return null;
			}

			const amount = parseInt(amountStr, 10);
			const futureDate = new Date(today);

			if (unit.startsWith('day')) {
				futureDate.setDate(today.getDate() + amount);
			} else if (unit.startsWith('week')) {
				futureDate.setDate(today.getDate() + amount * 7);
			} else if (unit.startsWith('month')) {
				futureDate.setMonth(today.getMonth() + amount);
			}

			return formatDateForInput(futureDate.toISOString());
		}

		// Handle "X days/weeks/months" (without "in")
		const timeAmountMatch = expr.match(/^(\d+)\s+(days?|weeks?|months?)$/);
		if (timeAmountMatch) {
			const amountStr = timeAmountMatch[1];
			const unit = timeAmountMatch[2];
			if (!amountStr || !unit) {
				return null;
			}

			const amount = parseInt(amountStr, 10);
			const futureDate = new Date(today);

			if (unit.startsWith('day')) {
				futureDate.setDate(today.getDate() + amount);
			} else if (unit.startsWith('week')) {
				futureDate.setDate(today.getDate() + amount * 7);
			} else if (unit.startsWith('month')) {
				futureDate.setMonth(today.getMonth() + amount);
			}

			return formatDateForInput(futureDate.toISOString());
		}

		// Handle "by end of month"
		if (expr.includes('end of month') || expr.includes('end of the month')) {
			const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
			return formatDateForInput(endOfMonth.toISOString());
		}

		// Handle quarters
		if (expr.includes('q1') || expr.includes('quarter 1')) {
			return `${today.getFullYear()}-03-31`;
		}
		if (expr.includes('q2') || expr.includes('quarter 2')) {
			return `${today.getFullYear()}-06-30`;
		}
		if (expr.includes('q3') || expr.includes('quarter 3')) {
			return `${today.getFullYear()}-09-30`;
		}
		if (expr.includes('q4') || expr.includes('quarter 4')) {
			return `${today.getFullYear()}-12-31`;
		}

		// Handle specific dates like "by Christmas", "by New Year"
		if (expr.includes('christmas')) {
			return `${today.getFullYear()}-12-25`;
		}
		if (expr.includes('new year')) {
			return `${today.getFullYear() + 1}-01-01`;
		}

		// Handle "this Friday", "this Monday", etc.
		const thisDayMatch = expr.match(
			/this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
		);
		if (thisDayMatch) {
			const targetDay = thisDayMatch[1];
			const dayMap = {
				monday: 1,
				tuesday: 2,
				wednesday: 3,
				thursday: 4,
				friday: 5,
				saturday: 6,
				sunday: 0
			};
			const targetDayIndex = dayMap[targetDay as keyof typeof dayMap];

			const thisTargetDay = new Date(today);
			const daysDiff = targetDayIndex - today.getDay();

			// If target day already passed this week, get next week's
			if (daysDiff < 0) {
				thisTargetDay.setDate(today.getDate() + daysDiff + 7);
			} else {
				thisTargetDay.setDate(today.getDate() + daysDiff);
			}

			return formatDateForInput(thisTargetDay.toISOString());
		}

		// Handle "starting tomorrow/next week" etc.
		if (expr.includes('starting')) {
			const startingMatch = expr.match(/starting\s+(.+)/);
			if (startingMatch) {
				const [, startingExpr] = startingMatch;
				if (startingExpr) {
					return parseNaturalLanguageDate(startingExpr, referenceDate);
				}
			}
		}

		// Handle "due Friday", "by Friday", etc.
		const dueDateMatch = expr.match(
			/(due|by)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/
		);
		if (dueDateMatch) {
			const targetDay = dueDateMatch[2];
			return parseNaturalLanguageDate(`this ${targetDay}`, referenceDate);
		}

		// Try to parse as a regular date if none of the patterns match
		const attemptParse = new Date(dateExpression);
		if (!isNaN(attemptParse.getTime())) {
			return formatDateForInput(attemptParse.toISOString());
		}

		return null;
	} catch (error) {
		console.warn('Failed to parse natural language date:', dateExpression, error);
		return null;
	}
}

/**
 * Extract timeline information from brain dump text
 * Looks for common patterns that indicate project timelines
 * @param brainDumpText - The brain dump content
 * @returns Object with parsed start and end dates
 */
export function extractTimelineFromText(brainDumpText: string): {
	startDate: string | null;
	endDate: string | null;
	detectedPhrases: string[];
} {
	if (!brainDumpText) {
		return { startDate: null, endDate: null, detectedPhrases: [] };
	}

	const text = brainDumpText.toLowerCase();
	const detectedPhrases: string[] = [];
	let startDate: string | null = null;
	let endDate: string | null = null;

	// Timeline patterns to look for
	const timelinePatterns = [
		// Duration patterns
		/(\d+)\s+(days?|weeks?|months?)\s+(long|duration|timeline)/gi,
		/(for|over)\s+(\d+)\s+(days?|weeks?|months?)/gi,

		// End date patterns
		/(by|due|complete\s+by|finish\s+by|done\s+by)\s+([^.!?\n]+)/gi,
		/(deadline|due\s+date|end\s+date|completion)\s*:?\s*([^.!?\n]+)/gi,

		// Start date patterns
		/(start|begin|starting|launch)\s+(next\s+week|tomorrow|on\s+[^.!?\n]+)/gi,

		// Duration from now patterns
		/(in|within)\s+the\s+next\s+(\d+)\s+(days?|weeks?|months?)/gi,
		/(next|this)\s+(\d+)\s+(days?|weeks?|months?)/gi
	];

	// Extract potential date phrases
	for (const pattern of timelinePatterns) {
		const matches = Array.from(text.matchAll(pattern));
		for (const match of matches) {
			const fullMatch = match[0];
			detectedPhrases.push(fullMatch);

			// Try to parse the date phrase
			let datePhrase = '';
			if (match[2]) {
				datePhrase = match[2].trim();
			} else if (match[1]) {
				datePhrase = match[1].trim();
			}

			if (datePhrase) {
				const parsedDate = parseNaturalLanguageDate(datePhrase);
				if (parsedDate) {
					// Determine if this is likely a start or end date based on context
					const context = fullMatch.toLowerCase();
					if (
						context.includes('by') ||
						context.includes('due') ||
						context.includes('complete') ||
						context.includes('deadline') ||
						context.includes('finish') ||
						context.includes('done')
					) {
						endDate = parsedDate;
					} else if (
						context.includes('start') ||
						context.includes('begin') ||
						context.includes('launch')
					) {
						startDate = parsedDate;
					} else {
						// Default to end date for duration patterns
						endDate = parsedDate;
					}
				}
			}
		}
	}

	// If we don't have a start date but have an end date, set start to today
	if (!startDate && endDate) {
		startDate = formatDateForInput(new Date().toISOString());
	}

	return {
		startDate,
		endDate,
		detectedPhrases
	};
}
