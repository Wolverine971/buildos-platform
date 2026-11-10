// apps/web/src/routes/auth/google/agent/callback/+server.ts
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { createGoogleAgentOAuthService } from '$lib/server/google-agent-oauth';
import { GoogleAgentOAuthError } from '@buildos/shared-agent-ops/google/google-agent-oauth';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) throw redirect(303, '/auth/login?redirect=/profile');
	const service = createGoogleAgentOAuthService();
	const target = new URL('/profile', url.origin);
	try {
		const state = await service.consumeState(url.searchParams.get('state'), user.id);
		target.searchParams.set('tab', state.connection_kind === 'gmail' ? 'email' : 'calendar');
		target.searchParams.set('google_agent_kind', state.connection_kind);
		target.searchParams.set('google_agent_connection', state.connection_id);
		const code = url.searchParams.get('code');
		if (url.searchParams.has('error') || !code) {
			target.searchParams.set('google_agent', 'error');
			target.searchParams.set('google_agent_error', 'access_denied');
		} else {
			await service.exchangeCode(state, code, `${url.origin}/auth/google/agent/callback`);
			target.searchParams.set('google_agent', 'connected');
		}
	} catch (error) {
		target.searchParams.set('google_agent', 'error');
		target.searchParams.set(
			'google_agent_error',
			error instanceof GoogleAgentOAuthError ? error.code : 'provider_error'
		);
	}
	throw redirect(303, `${target.pathname}${target.search}`);
};
