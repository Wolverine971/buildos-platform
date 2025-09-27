// src/routes/auth/google/register-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { GoogleOAuthHandler } from '$lib/utils/google-oauth';

export const load: PageServerLoad = async ({ url, locals }) => {
	// Pass locals to the handler so it can update server-side auth state
	const handler = new GoogleOAuthHandler(locals.supabase, locals);

	return handler.handleCallback(url, {
		redirectPath: '/auth/register',
		successPath: '/',
		isRegistration: true
	});
};
