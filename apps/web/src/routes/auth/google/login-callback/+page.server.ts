// apps/web/src/routes/auth/google/login-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { GoogleOAuthHandler } from '$lib/utils/google-oauth';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

export const load: PageServerLoad = async ({ url, request, platform, locals, cookies }) => {
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('buildos_oauth_state');
	cookies.delete('buildos_oauth_state', { path: '/' });
	const securityEventOptions = getSecurityEventLogOptions(platform);

	if (!state || !expectedState || state !== expectedState) {
		await logSecurityEvent(
			{
				eventType: 'auth.oauth.state_mismatch',
				category: 'auth',
				outcome: 'blocked',
				severity: 'medium',
				actorType: 'anonymous',
				reason: 'state_mismatch',
				...getSecurityRequestContext(request),
				metadata: {
					provider: 'google',
					flow: 'login',
					hasState: Boolean(state),
					hasExpectedState: Boolean(expectedState)
				}
			},
			securityEventOptions
		);
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('Authentication state mismatch. Please try again.')}`
		);
	}

	// Pass locals to the handler so it can update server-side auth state
	const handler = new GoogleOAuthHandler(locals.supabase, locals, securityEventOptions);

	return handler.handleCallback(url, {
		redirectPath: '/auth/login',
		successPath: '/',
		isRegistration: false
	});
};
