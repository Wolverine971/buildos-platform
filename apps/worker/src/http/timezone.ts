// apps/worker/src/http/timezone.ts

/**
 * Validate timezone string using Intl API.
 */
export function isValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get safe timezone with validation and fallback.
 */
export function getSafeTimezone(timezone: string | null | undefined, userId: string): string {
	if (!timezone) {
		return 'UTC';
	}

	if (isValidTimezone(timezone)) {
		return timezone;
	}

	console.warn(`⚠️ Invalid timezone "${timezone}" for user ${userId}, falling back to UTC`);
	return 'UTC';
}
