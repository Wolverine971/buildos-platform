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
 */
export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
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
