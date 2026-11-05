// apps/web/src/routes/auth/handoff/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	consumeHandoffCode,
	mintCookieSessionForUser,
	withAppMode
} from '$lib/server/auth-handoff.service';

/**
 * GET /auth/handoff?code=… — opened by the in-app browser. Consumes the one-time code the app
 * fetched from POST /api/auth/handoff, signs this browser in as that user (cookies), and sends
 * it to the requested page in app mode. A used, expired or unknown code lands on sign-in with
 * a plain explanation; nothing about the code is echoed back.
 *
 * The response is a redirect with no-store caching (set for every /auth/ path by the server
 * hook), so the code does not linger in a rendered page.
 *
 * Login CSRF guard: the app opens this URL itself, so the browser reports the navigation as
 * Sec-Fetch-Site "none". A link planted on another site arrives as "cross-site" (or
 * "same-site" from a sibling subdomain); those are refused before the code is spent, so a
 * stranger's code can't sign this browser into their account.
 */
export const GET: RequestHandler = async ({ url, request, locals: { supabase } }) => {
	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite === 'cross-site' || fetchSite === 'same-site') {
		throw redirect(303, '/auth/login?error=handoff_failed');
	}

	const code = url.searchParams.get('code');
	const admin = createAdminSupabaseClient();

	let consumed: Awaited<ReturnType<typeof consumeHandoffCode>> = null;
	try {
		consumed = code ? await consumeHandoffCode(admin, code) : null;
	} catch (error) {
		console.error('[auth/handoff] consume failed:', error);
	}

	if (!consumed) {
		throw redirect(303, '/auth/login?error=handoff_expired');
	}

	let signedIn = false;
	try {
		signedIn = await mintCookieSessionForUser(admin, supabase, consumed.userId);
	} catch (error) {
		console.error('[auth/handoff] sign-in failed:', error);
	}

	if (!signedIn) {
		throw redirect(303, '/auth/login?error=handoff_failed');
	}

	throw redirect(303, withAppMode(consumed.nextPath ?? '/profile'));
};
