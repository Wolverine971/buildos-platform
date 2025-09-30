// apps/web/src/lib/utils/timezone.ts

/**
 * Get the user's timezone from various sources
 */
export function getUserTimezone(): string {
	// Try to get from browser
	if (typeof window !== 'undefined') {
		try {
			return Intl.DateTimeFormat().resolvedOptions().timeZone;
		} catch (e) {
			console.warn('Failed to get browser timezone:', e);
		}
	}

	// Default to UTC
	return 'UTC';
}

/**
 * Format a date in the user's timezone
 */
export function formatInTimezone(
	date: Date | string,
	timezone: string,
	options?: Intl.DateTimeFormatOptions
): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date;

	try {
		return new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			...options
		}).format(dateObj);
	} catch (err) {
		console.error('Error formatting date in timezone:', err);
		// Fallback to local formatting
		return dateObj.toLocaleString('en-US', options);
	}
}

/**
 * Get current date string in timezone (YYYY-MM-DD format)
 */
export function getCurrentDateInTimezone(timezone: string): string {
	try {
		const formatter = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		});

		return formatter.format(new Date());
	} catch (err) {
		console.error('Error getting current date in timezone:', err);
		// Fallback to UTC
		return new Date().toISOString().split('T')[0];
	}
}

/**
 * Check if a date is today in the given timezone
 */
export function isTodayInTimezone(dateString: string, timezone: string): boolean {
	const today = getCurrentDateInTimezone(timezone);
	return dateString === today;
}

/**
 * Format time in user's timezone with sensible defaults
 */
export function formatTimeInTimezone(
	date: Date | string,
	timezone: string,
	options?: Intl.DateTimeFormatOptions
): string {
	return formatInTimezone(date, timezone, {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		...options
	});
}

/**
 * Format date in user's timezone with sensible defaults
 */
export function formatDateInTimezone(
	date: Date | string,
	timezone: string,
	options?: Intl.DateTimeFormatOptions
): string {
	return formatInTimezone(date, timezone, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		...options
	});
}

/**
 * Format full date and time in user's timezone
 */
export function formatDateTimeInTimezone(
	date: Date | string,
	timezone: string,
	options?: Intl.DateTimeFormatOptions
): string {
	return formatInTimezone(date, timezone, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
		...options
	});
}

/**
 * Get a relative time string (e.g., "2 hours ago", "in 3 days")
 */
export function getRelativeTime(date: Date | string, timezone: string): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	const now = new Date();
	const diffMs = now.getTime() - dateObj.getTime();
	const diffSecs = Math.floor(diffMs / 1000);
	const diffMins = Math.floor(diffSecs / 60);
	const diffHours = Math.floor(diffMins / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (Math.abs(diffSecs) < 60) {
		return 'just now';
	} else if (Math.abs(diffMins) < 60) {
		const mins = Math.abs(diffMins);
		return diffMs < 0
			? `in ${mins} minute${mins !== 1 ? 's' : ''}`
			: `${mins} minute${mins !== 1 ? 's' : ''} ago`;
	} else if (Math.abs(diffHours) < 24) {
		const hours = Math.abs(diffHours);
		return diffMs < 0
			? `in ${hours} hour${hours !== 1 ? 's' : ''}`
			: `${hours} hour${hours !== 1 ? 's' : ''} ago`;
	} else if (Math.abs(diffDays) < 7) {
		const days = Math.abs(diffDays);
		return diffMs < 0
			? `in ${days} day${days !== 1 ? 's' : ''}`
			: `${days} day${days !== 1 ? 's' : ''} ago`;
	} else {
		// For older dates, show the actual date
		return formatDateInTimezone(dateObj, timezone);
	}
}

/**
 * Parse a date string considering timezone
 */
export function parseDateInTimezone(dateString: string, timezone: string): Date {
	// If it's just a date (YYYY-MM-DD), append midnight in the target timezone
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
		// Create a date at midnight in the target timezone
		const [year, month, day] = dateString.split('-').map(Number);

		// Create a date string with timezone info
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});

		// Create a date at noon to avoid DST issues
		const noonDate = new Date(year, month - 1, day, 12, 0, 0);

		return noonDate;
	}

	// Otherwise, parse normally
	return new Date(dateString);
}

/**
 * Get timezone abbreviation (e.g., "PST", "EDT")
 */
export function getTimezoneAbbreviation(timezone: string): string {
	try {
		const date = new Date();
		const formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			timeZoneName: 'short'
		});

		const parts = formatter.formatToParts(date);
		const timeZonePart = parts.find((part) => part.type === 'timeZoneName');

		return timeZonePart?.value || timezone;
	} catch (err) {
		console.error('Error getting timezone abbreviation:', err);
		return timezone;
	}
}

/**
 * Store timezone preference
 */
export function storeTimezonePreference(timezone: string): void {
	if (typeof window !== 'undefined' && window.localStorage) {
		try {
			localStorage.setItem('userTimezone', timezone);
		} catch (e) {
			console.warn('Failed to store timezone preference:', e);
		}
	}
}

/**
 * Get stored timezone preference
 */
export function getStoredTimezonePreference(): string | null {
	if (typeof window !== 'undefined' && window.localStorage) {
		try {
			return localStorage.getItem('userTimezone');
		} catch (e) {
			console.warn('Failed to get stored timezone preference:', e);
		}
	}
	return null;
}

/**
 * Get the best available timezone
 */
export function getBestTimezone(): string {
	// First, check stored preference
	const stored = getStoredTimezonePreference();
	if (stored) return stored;

	// Then, get from browser
	return getUserTimezone();
}
