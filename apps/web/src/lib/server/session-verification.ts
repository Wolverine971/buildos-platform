// apps/web/src/lib/server/session-verification.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { VerifiedSession } from '$lib/types/verified-session';

type AuthClient = Pick<SupabaseClient<Database>['auth'], 'getSession' | 'getUser' | 'getClaims'>;
type Measure = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

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

/** Refresh the session when needed, then verify the exact token used for data access.
 * getClaims uses cached public keys for asymmetric tokens and falls back to Auth
 * for legacy symmetric tokens, so this can deploy before the signing-key rotation.
 */
export async function getVerifiedSession(
	auth: AuthClient,
	options: { requireLiveUser: boolean; measure?: Measure }
): Promise<VerifiedSession | null> {
	const measure: Measure = options.measure ?? ((_name, fn) => fn());
	const {
		data: { session },
		error: sessionError
	} = await measure('auth.session', () => auth.getSession());
	if (sessionError || !session) return null;

	if (options.requireLiveUser) {
		const {
			data: { user },
			error
		} = await measure('auth.user', () => auth.getUser(session.access_token));
		if (error || !user) return null;
		return { ...session, user };
	}

	const { data, error } = await measure('auth.claims', () =>
		auth.getClaims(session.access_token)
	);
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

	// Do not spread session.user: cookies can supply forged IDs, email, metadata,
	// or admin flags even when their access token is valid for a different user.
	return {
		...session,
		user: {
			id: claims.sub,
			...(typeof claims.email === 'string' ? { email: claims.email } : {})
		}
	};
}
