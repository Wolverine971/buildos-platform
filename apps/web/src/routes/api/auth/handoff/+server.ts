// apps/web/src/routes/api/auth/handoff/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	buildHandoffUrl,
	createHandoffCode,
	HANDOFF_CODE_TTL_SECONDS
} from '$lib/server/auth-handoff.service';
import { normalizeRedirectPath } from '$lib/utils/auth-redirect';
import { getClientIpFromHeaders, getUserAgentFromHeaders } from '$lib/server/error-tracking';

/**
 * POST /api/auth/handoff — native app only (bearer session).
 * Body: { next?: string } (same-origin path). Returns { url, expires_at }: open `url` in the
 * in-app browser and it lands on `next`, signed in, in app mode. Lives 60 seconds, single use.
 *
 * Bearer-only on purpose: a cookie session has no use for it, and refusing cookies keeps a
 * cross-site page from minting a sign-in link for a logged-in browser.
 */
export const POST: RequestHandler = async ({ request, url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}
	if (locals.authSource !== 'bearer') {
		return ApiResponse.forbidden('Session handoff is for native app sessions');
	}

	let next: string | null = null;
	try {
		const body = (await request.json().catch(() => ({}))) as { next?: unknown };
		if (body.next !== undefined && body.next !== null) {
			if (typeof body.next !== 'string') {
				return ApiResponse.badRequest('next must be a path string');
			}
			next = normalizeRedirectPath(body.next);
			if (!next) {
				return ApiResponse.badRequest('next must be a same-origin path');
			}
		}
	} catch (error) {
		return ApiResponse.badRequest(error instanceof Error ? error.message : 'Invalid body');
	}

	try {
		const { code, expiresAt } = await createHandoffCode(createAdminSupabaseClient(), {
			userId: user.id,
			nextPath: next,
			ip: getClientIpFromHeaders(request.headers),
			userAgent: getUserAgentFromHeaders(request.headers)
		});
		return ApiResponse.success({
			url: buildHandoffUrl(url.origin, code),
			expires_at: expiresAt,
			ttl_seconds: HANDOFF_CODE_TTL_SECONDS
		});
	} catch (error) {
		console.error('[auth/handoff] failed to create code:', error);
		return ApiResponse.internalError(error, 'Could not start the handoff');
	}
};
