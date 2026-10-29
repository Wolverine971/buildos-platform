// apps/web/src/lib/server/bearer-auth.ts
/**
 * Bearer sign-in for native clients.
 *
 * The web app signs in with cookies. The iPhone app keeps its Supabase session on the device
 * and sends `Authorization: Bearer <Supabase access token>` instead. The server hook uses this
 * helper to decide which path a request takes.
 *
 * Only a token shaped like a JWT is treated as a user session. Agent credentials (`boca_…`,
 * `bo_…`) and other opaque tokens travel in the same header but are authenticated by their own
 * routes, so they must fall through to the ordinary cookie path untouched. This is a structural
 * check on a credential format, not a classification of prose.
 */

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Return the Supabase access token from an `Authorization: Bearer …` header, or null when the
 * request carries no bearer credential or one that is not a JWT.
 */
export function readUserBearerToken(request: Request): string | null {
	const header = request.headers.get('authorization');
	if (!header) return null;

	const space = header.indexOf(' ');
	if (space === -1) return null;
	if (header.slice(0, space).toLowerCase() !== 'bearer') return null;

	const token = header.slice(space + 1).trim();
	if (!token || !JWT_SHAPE.test(token)) return null;
	return token;
}

/**
 * Read the `exp` claim from a JWT without verifying it. Only for session metadata on a token
 * that Auth has already verified; never use it to decide whether a token is valid.
 */
export function readUnverifiedJwtExpiry(token: string): number | null {
	const payload = token.split('.')[1];
	if (!payload) return null;
	try {
		const json = JSON.parse(base64UrlDecode(payload)) as { exp?: unknown };
		return typeof json.exp === 'number' && Number.isFinite(json.exp) ? json.exp : null;
	} catch {
		return null;
	}
}

function base64UrlDecode(value: string): string {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	if (typeof atob === 'function') {
		return atob(padded);
	}
	return Buffer.from(padded, 'base64').toString('utf8');
}
