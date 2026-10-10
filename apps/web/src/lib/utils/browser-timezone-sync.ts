// apps/web/src/lib/utils/browser-timezone-sync.ts
import { dev } from '$app/environment';

const USER_TIMEZONE_SYNC_ENDPOINT = '/api/users/timezone';
let browserTimezoneSyncStarted = false;

/** The browser's IANA zone, or null when unavailable or plain UTC (nothing to learn). */
export function resolveBrowserTimezone(): string | null {
	try {
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim() ?? '';
		if (!timezone || timezone === 'UTC' || timezone === 'Etc/UTC') return null;
		return timezone;
	} catch {
		return null;
	}
}

/**
 * Teach the server the browser's timezone so everything that reads
 * `users.timezone` (the agentic prompt clock, the daily brief schedule) runs
 * on the user's local day. Fire-and-forget: runs at most once per page load,
 * never throws, and never blocks the caller. The server only fills in a
 * null/UTC stored zone, so a deliberately chosen zone is never overwritten.
 *
 * Called from the root layout on every signed-in page load (so a new account
 * has its zone before its first morning brief) and when the chat opens.
 */
export async function syncBrowserTimezone(
	options: { timezone?: string | null; force?: boolean } = {}
): Promise<boolean> {
	if (browserTimezoneSyncStarted && !options.force) return false;
	browserTimezoneSyncStarted = true;
	const timezone =
		options.timezone === undefined ? resolveBrowserTimezone() : (options.timezone ?? null);
	if (!timezone || timezone === 'UTC' || timezone === 'Etc/UTC') return false;
	try {
		const response = await fetch(USER_TIMEZONE_SYNC_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timezone }),
			keepalive: true
		});
		return response.ok;
	} catch (err) {
		if (dev) {
			console.warn('[Timezone] Browser timezone sync failed:', err);
		}
		return false;
	}
}
