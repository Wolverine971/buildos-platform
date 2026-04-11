// apps/web/src/routes/auth/google/gmail-callback/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { logServerError } from '$lib/server/error-tracking';
import { getAuthUserCreatedAt, inferAuthUserJustCreated } from '$lib/utils/auth-profile';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

export const load: PageServerLoad = async ({ url, request, platform, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const oauthError = url.searchParams.get('error');
	const state = url.searchParams.get('state');
	const next = url.searchParams.get('next') ?? '/';
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);
	const baseErrorContext = {
		endpoint: '/auth/google/gmail-callback',
		method: 'GET'
	} as const;

	console.log('Gmail OAuth callback received:', {
		hasCode: !!code,
		hasError: !!oauthError,
		hasState: !!state,
		next
	});

	if (oauthError) {
		console.error('Gmail OAuth error:', oauthError);
		await logSecurityEvent(
			{
				eventType: 'auth.oauth.login.failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: oauthError,
				...requestContext,
				metadata: {
					provider: 'google_gmail',
					flow: 'login',
					oauthError,
					next
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error(`Gmail OAuth error: ${oauthError}`),
			...baseErrorContext,
			operation: 'google_gmail_oauth_callback',
			severity: 'warning',
			metadata: {
				oauthError,
				next,
				hasState: Boolean(state)
			}
		});
		const errorDescriptions: Record<string, string> = {
			access_denied: 'You denied access to your Google account',
			invalid_request: 'Invalid OAuth request',
			unauthorized_client: 'Unauthorized OAuth client',
			unsupported_response_type: 'Unsupported response type',
			invalid_scope: 'Invalid OAuth scope requested',
			server_error: 'Google OAuth server error',
			temporarily_unavailable: 'Google OAuth temporarily unavailable'
		};

		const errorMsg = errorDescriptions[oauthError] || `Authentication failed: ${oauthError}`;
		throw redirect(303, `/auth/login?error=${encodeURIComponent(errorMsg)}`);
	}

	if (!code) {
		console.error('No authorization code received');
		await logSecurityEvent(
			{
				eventType: 'auth.oauth.login.failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'low',
				actorType: 'anonymous',
				reason: 'missing_authorization_code',
				...requestContext,
				metadata: {
					provider: 'google_gmail',
					flow: 'login',
					next,
					hasState: Boolean(state)
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error('No authorization code received'),
			...baseErrorContext,
			operation: 'google_gmail_oauth_callback_missing_code',
			severity: 'warning',
			metadata: {
				next,
				hasState: Boolean(state)
			}
		});
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('No authorization code received')}`
		);
	}

	console.log('Exchanging code for session...');

	const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

	if (exchangeError) {
		console.error('Code exchange error:', exchangeError);
		await logSecurityEvent(
			{
				eventType: 'auth.oauth.login.failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'anonymous',
				reason: exchangeError.message,
				...requestContext,
				metadata: {
					provider: 'google_gmail',
					flow: 'login',
					stage: 'code_exchange',
					next,
					authProviderErrorCode: exchangeError.code,
					authProviderStatus: exchangeError.status
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: exchangeError,
			...baseErrorContext,
			operation: 'google_gmail_oauth_code_exchange',
			severity: 'error',
			metadata: {
				next,
				state
			}
		});
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`
		);
	}

	if (!data.session || !data.user) {
		console.error('No session or user created after code exchange');
		await logSecurityEvent(
			{
				eventType: 'auth.oauth.login.failed',
				category: 'auth',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'anonymous',
				reason: 'session_missing',
				...requestContext,
				metadata: {
					provider: 'google_gmail',
					flow: 'login',
					next
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error('No session or user created after code exchange'),
			...baseErrorContext,
			operation: 'google_gmail_oauth_session_missing',
			severity: 'error',
			metadata: {
				next,
				state
			}
		});
		throw redirect(303, `/auth/login?error=${encodeURIComponent('Failed to create session')}`);
	}

	console.log('Gmail OAuth successful for user:', data.user.id);

	// Check and create user record if not exists
	const isNewUser = inferAuthUserJustCreated(data.user);

	const { data: _existingUser, error: fetchError } = await supabase
		.from('users')
		.select('id')
		.eq('id', data.user.id)
		.single();

	if (fetchError && fetchError.code === 'PGRST116') {
		// User doesn't exist, create them
		console.log('Creating new user record...');

		const { error: insertError } = await supabase.from('users').insert({
			id: data.user.id,
			email: data.user.email as string,
			name:
				data.user.user_metadata?.name ||
				data.user.user_metadata?.full_name ||
				data.user.email?.split('@')[0] ||
				'User',
			is_admin: false,
			created_at: getAuthUserCreatedAt(data.user),
			updated_at: new Date().toISOString()
		});

		if (insertError) {
			console.error('Error creating user record:', insertError);
			await logServerError({
				error: insertError,
				...baseErrorContext,
				operation: 'google_gmail_oauth_create_user',
				userId: data.user.id,
				severity: 'warning',
				metadata: {
					next,
					isNewUser: true
				}
			});
			// Continue anyway - the auth flow proceeds regardless
		} else {
			console.log('User record created successfully');
		}
	} else if (fetchError) {
		console.error('Error checking user existence:', fetchError);
		await logServerError({
			error: fetchError,
			...baseErrorContext,
			operation: 'google_gmail_oauth_user_lookup',
			userId: data.user.id,
			severity: 'warning',
			metadata: {
				next,
				isNewUser: false
			}
		});
	} else {
		console.log('User record already exists');
	}

	// Clean and build redirect URL
	const sanitizedNext = next.startsWith('/') ? next : '/';
	const redirectUrl = new URL(sanitizedNext, url.origin);
	redirectUrl.searchParams.set('auth_success', 'true');

	if (isNewUser) {
		redirectUrl.searchParams.set('new_user', 'true');
	}

	await logSecurityEvent(
		{
			eventType: 'auth.oauth.login.succeeded',
			category: 'auth',
			outcome: 'success',
			severity: 'info',
			actorType: 'user',
			actorUserId: data.user.id,
			...requestContext,
			metadata: {
				provider: 'google_gmail',
				flow: 'login',
				isNewUser,
				redirectPath: redirectUrl.pathname
			}
		},
		securityEventOptions
	);

	console.log('Redirecting to:', redirectUrl.pathname + redirectUrl.search);
	throw redirect(303, redirectUrl.pathname + redirectUrl.search);
};
