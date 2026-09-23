// apps/web/src/lib/utils/auth-status.ts
/**
 * One-time status that auth redirects hand to the sign-in and sign-up screens.
 *
 * The URL only ever carries a short code (`?error=<code>`, `?notice=<code>`); the words shown
 * live in these tables. Rendering URL text directly would let anyone craft a link such as
 * `/auth/login?message=Your account is locked. Verify at evil.co` that displays as an official
 * BuildOS notice.
 */

export const AUTH_ERROR_COPY = {
	google_cancelled: 'Google sign-in was cancelled. Try again whenever you’re ready.',
	google_unavailable: 'Google sign-in is temporarily unavailable. Please try again in a moment.',
	google_failed: 'Google sign-in didn’t finish. Please try again.',
	state_mismatch: 'That sign-in attempt expired. Please try again.',
	session_failed: 'We couldn’t start your session. Please try again.',
	account_setup_failed: 'Account setup failed. Please try signing in again.',
	policy_unverified: 'We could not verify your policy acceptance. Please try again.',
	timeout: 'Signing in took too long. Please try again.'
} as const;

export const AUTH_NOTICE_COPY = {
	account_exists: 'You already have an account. Sign in instead.',
	password_updated: 'Password updated. You’re signed in.'
} as const;

/** Shown for an `?error=` value that is not a known code (old links, hand-edited URLs). */
export const GENERIC_AUTH_ERROR = 'Something went wrong signing you in. Please try again.';

export type AuthErrorCode = keyof typeof AUTH_ERROR_COPY;
export type AuthNoticeCode = keyof typeof AUTH_NOTICE_COPY;

function lookup<T extends Record<string, string>>(table: T, code: string): string | null {
	// Own keys only, so `?error=constructor` cannot reach Object.prototype.
	return Object.prototype.hasOwnProperty.call(table, code) ? (table[code] ?? null) : null;
}

/** Copy for an `?error=` code. Unknown codes get a generic line, never the URL text. */
export function authErrorMessage(code: string | null | undefined): string | null {
	if (!code) return null;
	return lookup(AUTH_ERROR_COPY, code) ?? GENERIC_AUTH_ERROR;
}

/** Copy for a `?notice=` code. Unknown codes show nothing. */
export function authNoticeMessage(code: string | null | undefined): string | null {
	if (!code) return null;
	return lookup(AUTH_NOTICE_COPY, code);
}

export function authErrorPath(path: '/auth/login' | '/auth/register', code: AuthErrorCode): string {
	return `${path}?error=${code}`;
}

export function authNoticePath(path: '/auth/login', code: AuthNoticeCode): string {
	return `${path}?notice=${code}`;
}

/**
 * Map Google's OAuth `error` parameter (a fixed protocol code such as `access_denied`) to one
 * of ours. Anything unrecognized is a generic Google failure.
 */
export function authErrorCodeForGoogleError(googleError: string): AuthErrorCode {
	if (googleError === 'access_denied') return 'google_cancelled';
	if (googleError === 'server_error' || googleError === 'temporarily_unavailable') {
		return 'google_unavailable';
	}
	return 'google_failed';
}
