// apps/web/src/lib/utils/browser-timezone-sync.ts
import { dev } from '$app/environment';

const USER_TIMEZONE_SYNC_ENDPOINT = '/api/users/timezone';
const SYNCED_KEY = 'buildos:timezone-synced';
let browserTimezoneSyncStarted = false;

// Which account and zone the server last answered for in this browser. The server only
// ever fills in an unset zone, so asking again with the same zone changes nothing.
function syncedMark(): string | null {
	try {
		return localStorage.getItem(SYNCED_KEY);
	} catch {
		return null;
	}
}

function rememberSynced(mark: string): void {
	try {
		localStorage.setItem(SYNCED_KEY, mark);
	} catch {
		// Private windows and blocked storage: it simply asks again next load.
	}
}

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
 * has its zone before its first morning brief) and when the chat opens. With a
 * `userId`, a browser that the server has already answered for this account and
 * zone sends nothing: one request per account and zone, not one per page load.
 */
export async function syncBrowserTimezone(
	options: { timezone?: string | null; force?: boolean; userId?: string | null } = {}
): Promise<boolean> {
	if (browserTimezoneSyncStarted && !options.force) return false;
	browserTimezoneSyncStarted = true;
	const timezone =
		options.timezone === undefined ? resolveBrowserTimezone() : (options.timezone ?? null);
	if (!timezone || timezone === 'UTC' || timezone === 'Etc/UTC') return false;
	const mark = options.userId ? `${options.userId}|${timezone}` : null;
	if (mark && !options.force && syncedMark() === mark) return false;
	try {
		const response = await fetch(USER_TIMEZONE_SYNC_ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ timezone }),
			keepalive: true
		});
		if (response.ok && mark) rememberSynced(mark);
		return response.ok;
	} catch (err) {
		if (dev) {
			console.warn('[Timezone] Browser timezone sync failed:', err);
		}
		return false;
	}
}
