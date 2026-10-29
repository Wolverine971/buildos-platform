// apps/web/src/lib/server/session-verification.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { VerifiedSession } from '$lib/types/verified-session';
import { readUnverifiedJwtExpiry } from '$lib/server/bearer-auth';

type AuthClient = Pick<SupabaseClient<Database>['auth'], 'getSession' | 'getUser' | 'getClaims'>;
type Measure = <T>(name: string, fn: () => Promise<T>) => Promise<T>;
type VerifyOptions = { requireLiveUser: boolean; measure?: Measure };
type VerifiedIdentity = VerifiedSession['user'];

// These route families need immediate server-side revocation detection, including
// their SvelteKit /__data.json requests. Match URL segments, not user prose.
const LIVE_AUTH_PATHS = [
	'/admin',
	'/api/admin',
	'/auth',
	'/api/auth',
	'/profile',
	'/api/profile',
	'/api/account',
	'/billing',
	'/api/billing',
	'/api/stripe',
	'/oauth',
	'/api/sms/metrics'
];

export function requiresLiveAuthCheck(route: string, method: string): boolean {
	// Keep the stronger check for every mutation, including form actions.
	if (method !== 'GET' && method !== 'HEAD') return true;
	// Prefer SvelteKit's resolved route ID so encoded URL segments cannot avoid
	// the check. Route groups such as /(app)/profile don't appear in public URLs.
	const pathname = route
		.split('/')
		.filter((segment) => !segment.startsWith('('))
		.join('/');
	return LIVE_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Verify one access token and return the identity it proves, or null.
 *
 * Live mode asks Auth for the user (detects revocation); otherwise the signature and the
 * standard claims are checked locally. getClaims uses cached public keys for asymmetric tokens
 * and falls back to Auth for legacy symmetric tokens, so this can deploy before the signing-key
 * rotation.
 */
async function verifyAccessToken(
	auth: AuthClient,
	accessToken: string,
	options: VerifyOptions
): Promise<VerifiedIdentity | null> {
	const measure: Measure = options.measure ?? ((_name, fn) => fn());

	if (options.requireLiveUser) {
		const {
			data: { user },
			error
		} = await measure('auth.user', () => auth.getUser(accessToken));
		if (error || !user) return null;
		// The live Auth record is trustworthy, so callers keep its full shape.
		return user;
	}

	const { data, error } = await measure('auth.claims', () => auth.getClaims(accessToken));
	if (error || !data) return null;

	const { claims } = data;
	const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
	if (
		typeof claims.sub !== 'string' ||
		!claims.sub ||
		claims.role !== 'authenticated' ||
		!audience.includes('authenticated')
	) {
		return null;
	}

	return {
		id: claims.sub,
		...(typeof claims.email === 'string' ? { email: claims.email } : {})
	};
}

/** Refresh the cookie session when needed, then verify the exact token used for data access. */
export async function getVerifiedSession(
	auth: AuthClient,
	options: VerifyOptions
): Promise<VerifiedSession | null> {
	const measure: Measure = options.measure ?? ((_name, fn) => fn());
	const {
		data: { session },
		error: sessionError
	} = await measure('auth.session', () => auth.getSession());
	if (sessionError || !session) return null;

	const identity = await verifyAccessToken(auth, session.access_token, options);
	if (!identity) return null;

	// Do not spread session.user: cookies can supply forged IDs, email, metadata,
	// or admin flags even when their access token is valid for a different user.
	return { ...session, user: identity };
}

/**
 * Verify a bearer access token presented by a native client (no cookies, no refresh token on
 * the server). The device owns refreshing; the server only ever sees the current access token.
 * An invalid or expired token yields null and never falls back to cookies.
 */
export async function getVerifiedBearerSession(
	auth: AuthClient,
	accessToken: string,
	options: VerifyOptions
): Promise<VerifiedSession | null> {
	const identity = await verifyAccessToken(auth, accessToken, options);
	if (!identity) return null;

	const expiresAt = readUnverifiedJwtExpiry(accessToken);
	const expiresIn = expiresAt ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) : 0;

	return {
		access_token: accessToken,
		refresh_token: '',
		token_type: 'bearer',
		expires_in: expiresIn,
		...(expiresAt ? { expires_at: expiresAt } : {}),
		user: identity
	};
}
