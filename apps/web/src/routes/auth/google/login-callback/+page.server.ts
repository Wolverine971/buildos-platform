// apps/web/src/routes/auth/google/login-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { GoogleOAuthHandler } from '$lib/utils/google-oauth';

export const load: PageServerLoad = async ({ url, locals, cookies }) => {
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('buildos_oauth_state');
	cookies.delete('buildos_oauth_state', { path: '/' });

	if (!state || !expectedState || state !== expectedState) {
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('Authentication state mismatch. Please try again.')}`
		);
	}

	// Pass locals to the handler so it can update server-side auth state
	const handler = new GoogleOAuthHandler(locals.supabase, locals);

	return handler.handleCallback(url, {
		redirectPath: '/auth/login',
		successPath: '/',
		isRegistration: false
	});
};
