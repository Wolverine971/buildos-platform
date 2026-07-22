// apps/web/src/routes/auth/google/gmail-read/callback/+server.ts
import type { RequestHandler } from './$types';
import { isRedirect, redirect } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GmailOAuthError, GmailReadOAuthService } from '$lib/server/gmail-read-oauth.service';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

const DEFAULT_REDIRECT_PATH = '/profile?tab=email&gmail=1';

function normalizeRedirectPath(path: string | null | undefined): string {
	if (!path || !path.startsWith('/') || path.startsWith('//')) return DEFAULT_REDIRECT_PATH;

	try {
		const parsed = new URL(path, 'https://buildos.invalid');
		if (parsed.origin !== 'https://buildos.invalid') return DEFAULT_REDIRECT_PATH;
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return DEFAULT_REDIRECT_PATH;
	}
}

function buildRedirectTarget(path: string, params: Record<string, string>): string {
	const target = new URL(normalizeRedirectPath(path), 'https://buildos.invalid');
	for (const [key, value] of Object.entries(params)) {
		target.searchParams.set(key, value);
	}
	return `${target.pathname}${target.search}${target.hash}`;
}

export const GET: RequestHandler = async ({ url, request, platform, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login?redirect=/profile?tab=email');
	}

	const service = new GmailReadOAuthService(createAdminSupabaseClient());
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);
	let redirectPath = DEFAULT_REDIRECT_PATH;

	try {
		const state = await service.consumeAuthorizationState(
			url.searchParams.get('state'),
			user.id
		);
		redirectPath = state.redirect_path;
		const providerError = url.searchParams.get('error');

		if (providerError) {
			const safeProviderError =
				providerError === 'access_denied' ? 'access_denied' : 'oauth_error';
			await logSecurityEvent(
				{
					eventType: 'integration.gmail.oauth_failed',
					category: 'integration',
					outcome: 'failure',
					severity: 'low',
					actorType: 'user',
					actorUserId: user.id,
					reason: safeProviderError,
					...requestContext,
					metadata: {
						provider: 'google_gmail',
						grantKind: 'read',
						reconnect: Boolean(state.connection_id)
					}
				},
				securityEventOptions
			);
			throw redirect(
				303,
				buildRedirectTarget(redirectPath, {
					gmail: '1',
					error: safeProviderError
				})
			);
		}

		const code = url.searchParams.get('code');
		if (!code) {
			throw redirect(
				303,
				buildRedirectTarget(redirectPath, { gmail: '1', error: 'missing_code' })
			);
		}

		const connection = await service.exchangeAuthorizationCode({
			userId: user.id,
			code,
			redirectUri: `${url.origin}/auth/google/gmail-read/callback`,
			state
		});

		await logSecurityEvent(
			{
				eventType: 'integration.gmail.connected',
				category: 'integration',
				outcome: 'success',
				severity: 'info',
				actorType: 'user',
				actorUserId: user.id,
				...requestContext,
				metadata: {
					provider: 'google_gmail',
					grantKind: 'read',
					connectionId: connection.id,
					reconnect: Boolean(state.connection_id)
				}
			},
			securityEventOptions
		);

		throw redirect(
			303,
			buildRedirectTarget(redirectPath, {
				gmail: '1',
				success: 'gmail_connected',
				connection: connection.id
			})
		);
	} catch (error) {
		if (isRedirect(error)) throw error;

		const errorCode = error instanceof GmailOAuthError ? error.code : 'provider_error';
		const safeCode = [
			'invalid_state',
			'identity_verification_failed',
			'scope_mismatch',
			'refresh_token_required',
			'account_mismatch',
			'account_already_connected',
			'connection_limit_exceeded',
			'not_configured'
		].includes(errorCode)
			? errorCode
			: 'connection_failed';

		await logSecurityEvent(
			{
				eventType: 'integration.gmail.connect_failed',
				category: 'integration',
				outcome: 'blocked',
				severity: errorCode === 'invalid_state' ? 'medium' : 'low',
				actorType: 'user',
				actorUserId: user.id,
				reason: safeCode,
				...requestContext,
				metadata: { provider: 'google_gmail', grantKind: 'read' }
			},
			securityEventOptions
		);

		throw redirect(
			303,
			buildRedirectTarget(
				error instanceof GmailOAuthError ? error.redirectPath : redirectPath,
				{ gmail: '1', error: safeCode }
			)
		);
	}
};
