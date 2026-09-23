// apps/web/src/lib/server/csrf.ts
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

const CROSS_ORIGIN_FORM_POST_ALLOWED_PATHS = new Set(['/oauth/token', '/oauth/revoke']);

// Machine callers that never carry a browser Origin and never authenticate with the session
// cookie, so there is no cross-site request to forge: provider webhooks (Twilio posts
// form-encoded status callbacks; each route verifies its own signature or secret) and RFC 8058
// one-click unsubscribe, which mailbox providers POST without an Origin and which is
// authorized by the tracking id in the path.
const CROSS_ORIGIN_FORM_POST_ALLOWED_PREFIXES = ['/api/webhooks/', '/webhooks/'];
const ONE_CLICK_UNSUBSCRIBE_PATH = /^\/api\/email-tracking\/[^/]+\/unsubscribe$/;

function isCrossOriginFormPostAllowed(pathname: string): boolean {
	return (
		CROSS_ORIGIN_FORM_POST_ALLOWED_PATHS.has(pathname) ||
		CROSS_ORIGIN_FORM_POST_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
		ONE_CLICK_UNSUBSCRIBE_PATH.test(pathname)
	);
}

function isFormContentType(contentType: string | null): boolean {
	if (!contentType) return false;
	const normalized = contentType.split(';', 1)[0]?.trim().toLowerCase();
	return (
		normalized === 'application/x-www-form-urlencoded' ||
		normalized === 'multipart/form-data' ||
		normalized === 'text/plain'
	);
}

/**
 * Reapply SvelteKit's same-origin form guard for every route except the OAuth
 * endpoints that intentionally accept native cross-origin clients and the
 * cookie-less machine endpoints above.
 *
 * SvelteKit treats a missing Origin as a failed same-origin check. Keep that
 * fail-closed behavior here: sandboxed/legacy clients must not bypass CSRF
 * protection simply by omitting the header.
 */
export function createCrossSiteFormPostResponse(event: RequestEvent): Response | null {
	const method = event.request.method.toUpperCase();
	if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH' && method !== 'DELETE') {
		return null;
	}

	if (!isFormContentType(event.request.headers.get('content-type'))) {
		return null;
	}

	if (isCrossOriginFormPostAllowed(event.url.pathname)) {
		return null;
	}

	const origin = event.request.headers.get('origin');
	if (origin === event.url.origin) {
		return null;
	}

	return json(
		{ message: `Cross-site ${method} form submissions are forbidden` },
		{ status: 403 }
	);
}
