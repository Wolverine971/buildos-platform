// apps/mobile/src/lib/web-pages.ts
/**
 * Web pages inside the app. Settings, billing, exports and account deletion stay on the
 * website; the phone opens them signed in through a one-time handoff (`POST /api/auth/handoff`
 * → `/auth/handoff?code=`), and the page renders in app mode (no site chrome). The in-app
 * browser's Done key brings the person back. Pure: the caller passes the API, browser and
 * session pieces (see components/kit/account-key.tsx), so this stays testable in Node.
 */
import { isBuildOsApiError } from '@buildos/api-client';

export const WEB_PAGES = {
	/** Profile → Account: email, password, exports and "Delete My Account" (App Review 5.1.1). */
	account: '/profile?tab=account'
} as const;

/** Opens a same-origin path signed in, and resolves when the in-app browser closes. */
export async function openWebPage(
	path: string,
	deps: {
		createHandoff: (input: { next: string }) => Promise<{ url: string }>;
		open: (url: string) => Promise<unknown>;
	}
): Promise<void> {
	const { url } = await deps.createHandoff({ next: path });
	await deps.open(url);
}

/** The server answers a scheduled-for-deletion account with no user at all: a plain 401. */
export function isAccountGoneError(error: unknown): boolean {
	return isBuildOsApiError(error) && error.status === 401;
}

/**
 * After the account page closes: if the person asked to delete their account, the website
 * locked it, but this device still holds a token that will now answer 401 forever
 * (hooks.server.ts leaves bearer clients to notice). One refresh rules out an expired token;
 * a second 401 means the account is gone, so the phone signs out locally.
 */
export async function signOutIfAccountGone(deps: {
	check: () => Promise<unknown>;
	refresh: () => Promise<unknown>;
	signOut: () => Promise<unknown>;
}): Promise<boolean> {
	try {
		await deps.check();
		return false;
	} catch (first) {
		if (!isAccountGoneError(first)) return false;
	}
	try {
		await deps.refresh();
		await deps.check();
		return false;
	} catch (second) {
		if (!isAccountGoneError(second)) return false;
	}
	await deps.signOut();
	return true;
}
