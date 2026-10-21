// apps/web/src/lib/server/auth-redirects.ts
import { redirect } from '@sveltejs/kit';
import { normalizeRedirectPath } from '$lib/utils/auth-redirect';

/** Keep the page and its chat link through password and OAuth sign-in. */
export function redirectToLogin(url: URL): never {
	throw redirect(303, `/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`);
}

// Top-level aliases that forward to an `/auth/*` screen.
const LEGACY_AUTH_PATHS = new Set([
	'/login',
	'/register',
	'/signup',
	'/forgot-password',
	'/reset-password'
]);

/** Whether a normalized path lands on a sign-in screen (structural path check). */
function isAuthPath(path: string): boolean {
	const rawPathname = path.split(/[?#]/, 1)[0] ?? '';
	let pathname: string;
	try {
		pathname = decodeURIComponent(rawPathname);
	} catch {
		return true;
	}
	return pathname === '/auth' || pathname.startsWith('/auth/') || LEGACY_AUTH_PATHS.has(pathname);
}

/**
 * A `?redirect=` value reduced to a same-origin path that is not a sign-in screen, or null.
 * Sign-in screens are refused so a signed-in visitor can never bounce between them.
 */
export function postLoginRedirectPath(candidate: string | null | undefined): string | null {
	const target = normalizeRedirectPath(candidate);
	return target && !isAuthPath(target) ? target : null;
}

/** Where `/auth/login` and `/auth/register` send someone who is already signed in. */
export function signedInRedirectTarget(url: URL): string {
	return postLoginRedirectPath(url.searchParams.get('redirect')) ?? '/today';
}

/**
 * The post-login path the sign-in page put in the Google OAuth `state` (base64url JSON with a
 * `redirect` field), normalized to a same-origin path, or null.
 */
export function decodeOAuthStateRedirect(state: string | null | undefined): string | null {
	if (!state) return null;

	try {
		const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
		if (parsed && typeof parsed.redirect === 'string') {
			return normalizeRedirectPath(parsed.redirect);
		}
	} catch {
		return null;
	}

	return null;
}

/**
 * Add the validated post-login target to a sign-in or sign-up status path
 * (`/auth/login?error=…`), so a retry after a failed attempt still lands on the link.
 */
export function withPostLoginRedirect(path: string, candidate: string | null | undefined): string {
	const target = postLoginRedirectPath(candidate);
	if (!target) return path;
	return `${path}${path.includes('?') ? '&' : '?'}redirect=${encodeURIComponent(target)}`;
}
