// apps/web/src/lib/server/app-mode.ts
import type { RequestEvent } from '@sveltejs/kit';

/** Cookie that keeps pages in app mode (inside the BuildOS iPhone app) across navigations. */
export const APP_MODE_COOKIE = 'buildos_app';

const APP_MODE_MAX_AGE_SECONDS = 60 * 60 * 24;

/**
 * App mode = the page is open inside the native app's in-app browser, so the web app hides its
 * own site chrome. `?app=1` turns it on (and sets the cookie), `?app=0` turns it off (and clears it).
 */
export function resolveAppMode(
	event: Pick<RequestEvent, 'url' | 'cookies'>,
	options: { secure: boolean }
): boolean {
	const flag = event.url.searchParams.get('app');

	if (flag === '1') {
		event.cookies.set(APP_MODE_COOKIE, '1', {
			path: '/',
			httpOnly: false,
			sameSite: 'lax',
			secure: options.secure,
			maxAge: APP_MODE_MAX_AGE_SECONDS
		});
		return true;
	}

	if (flag === '0') {
		event.cookies.delete(APP_MODE_COOKIE, { path: '/' });
		return false;
	}

	return event.cookies.get(APP_MODE_COOKIE) === '1';
}
