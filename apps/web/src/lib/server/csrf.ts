// apps/web/src/lib/server/csrf.ts
import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

const CROSS_ORIGIN_FORM_POST_ALLOWED_PATHS = new Set(['/oauth/token', '/oauth/revoke']);

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
 * Reapply SvelteKit's same-origin form guard for every route except the two
 * OAuth endpoints that intentionally accept native cross-origin clients.
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

	if (CROSS_ORIGIN_FORM_POST_ALLOWED_PATHS.has(event.url.pathname)) {
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
