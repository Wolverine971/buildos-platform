// apps/web/src/routes/auth/google/calendar-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { env as privateEnv } from '$env/dynamic/private';
import { isRedirect, redirect } from '@sveltejs/kit';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { logServerError } from '$lib/server/error-tracking';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	GoogleCalendarConnectionError,
	GoogleCalendarConnectionService
} from '$lib/server/google-calendar-connection.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

// Token exchange, identity verification, and calendar discovery can exceed Vercel's 10-second
// default for accounts with many calendars. The OAuth state remains single-use, so timing out
// after the credential commit would leave the user on an error page despite a valid connection.
export const config = {
	maxDuration: 60
};

export const load: PageServerLoad = async ({
	url,
	request,
	platform,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);

	if (!user) {
		console.log('No user found, redirecting to login');
		throw redirect(303, '/auth/login?redirect=/profile?tab=calendar');
	}

	const code = url.searchParams.get('code');
	const error = url.searchParams.get('error');
	const stateParam = url.searchParams.get('state');
	const decodedState = GoogleOAuthService.decodeCalendarState(stateParam);
	const stateUserId = decodedState?.userId ?? null;
	const stateMatchesUser = !!stateUserId && stateUserId === user.id;

	const DEFAULT_REDIRECT_PATH = '/profile?tab=calendar';
	const normalizeRedirectPath = (path: string | null | undefined): string => {
		if (!path) return DEFAULT_REDIRECT_PATH;

		try {
			const redirectUrl = new URL(path, url.origin);
			if (redirectUrl.origin !== url.origin) {
				return DEFAULT_REDIRECT_PATH;
			}

			return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
		} catch {
			return DEFAULT_REDIRECT_PATH;
		}
	};

	const resolvedRedirectPath = normalizeRedirectPath(
		stateMatchesUser ? decodedState?.redirectPath : null
	);

	const buildRedirectTarget = (path: string, params: Record<string, string>): string => {
		const redirectUrl = new URL(normalizeRedirectPath(path), url.origin);
		Object.entries(params).forEach(([key, value]) => redirectUrl.searchParams.set(key, value));
		return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
	};

	const buildCalendarRedirect = (path: string, params: Record<string, string>) =>
		buildRedirectTarget(path, { calendar: '1', ...params });
	const baseErrorContext = {
		endpoint: '/auth/google/calendar-callback',
		method: 'GET',
		userId: user.id
	} as const;

	// New multi-account requests use opaque, hashed, single-use state. Legacy Calendar state embeds
	// the user ID, so a valid legacy callback remains on the compatibility path below even for a
	// canary user until the old connect surface has been replaced.
	if (isMultiCalendarUserAllowed(user.id, privateEnv) && !stateMatchesUser) {
		const admin = createAdminSupabaseClient();
		const connectionService = new GoogleCalendarConnectionService(admin);
		let authorizationState;
		try {
			authorizationState = await connectionService.consumeAuthorizationState(
				stateParam,
				user.id
			);
		} catch {
			throw redirect(
				303,
				buildCalendarRedirect(DEFAULT_REDIRECT_PATH, { error: 'invalid_state' })
			);
		}

		const multiAccountRedirectPath = normalizeRedirectPath(authorizationState.redirect_path);
		if (error) {
			const safeProviderError = error === 'access_denied' ? 'access_denied' : 'oauth_error';
			await logSecurityEvent(
				{
					eventType: 'integration.calendar.oauth_failed',
					category: 'integration',
					outcome: 'failure',
					severity: 'low',
					actorType: 'user',
					actorUserId: user.id,
					reason: safeProviderError,
					...requestContext,
					metadata: {
						provider: 'google_calendar',
						reconnect: Boolean(authorizationState.connection_id)
					}
				},
				securityEventOptions
			);
			throw redirect(
				303,
				buildCalendarRedirect(multiAccountRedirectPath, {
					error: safeProviderError
				})
			);
		}

		if (!code) {
			throw redirect(
				303,
				buildCalendarRedirect(multiAccountRedirectPath, {
					error: 'no_authorization_code'
				})
			);
		}

		try {
			const connection = await connectionService.exchangeAuthorizationCode({
				userId: user.id,
				code,
				redirectUri: `${url.origin}/auth/google/calendar-callback`,
				state: authorizationState
			});
			const webhookService = new CalendarWebhookService(admin);
			const webhookUrl = `${url.origin}/webhooks/calendar-events`;
			const webhookResults = await Promise.all(
				connection.sources
					.filter((source) => source.syncEnabled)
					.map((source) =>
						webhookService.registerWebhook(
							user.id,
							webhookUrl,
							source.providerCalendarId,
							source.id
						)
					)
			);
			const webhookFailures = webhookResults.filter((result) => !result.success).length;
			await logSecurityEvent(
				{
					eventType: 'integration.calendar.connected',
					category: 'integration',
					outcome: 'success',
					severity: 'info',
					actorType: 'user',
					actorUserId: user.id,
					...requestContext,
					metadata: {
						provider: 'google_calendar',
						connectionId: connection.id,
						reconnect: Boolean(authorizationState.connection_id),
						webhookAttempted: webhookResults.length,
						webhookFailures
					}
				},
				securityEventOptions
			);
			throw redirect(
				303,
				buildCalendarRedirect(multiAccountRedirectPath, {
					success: 'calendar_connected',
					connection: connection.id
				})
			);
		} catch (connectionError) {
			if (isRedirect(connectionError)) throw connectionError;
			const safeCode =
				connectionError instanceof GoogleCalendarConnectionError &&
				[
					'identity_verification_failed',
					'scope_mismatch',
					'refresh_token_required',
					'account_mismatch',
					'account_already_connected',
					'connection_limit_exceeded',
					'not_configured'
				].includes(connectionError.code)
					? connectionError.code
					: 'connection_failed';
			await logSecurityEvent(
				{
					eventType: 'integration.calendar.connect_failed',
					category: 'integration',
					outcome: 'blocked',
					severity: 'low',
					actorType: 'user',
					actorUserId: user.id,
					reason: safeCode,
					...requestContext,
					metadata: { provider: 'google_calendar' }
				},
				securityEventOptions
			);
			throw redirect(
				303,
				buildCalendarRedirect(multiAccountRedirectPath, { error: safeCode })
			);
		}
	}

	console.log('Calendar OAuth callback received:', {
		hasCode: !!code,
		hasError: !!error,
		hasState: !!stateParam,
		userId: user.id
	});

	// Handle OAuth errors
	if (error) {
		console.error('Calendar OAuth error:', error);
		await logSecurityEvent(
			{
				eventType: 'integration.calendar.oauth_failed',
				category: 'integration',
				outcome: 'failure',
				severity: 'low',
				actorType: 'user',
				actorUserId: user.id,
				reason: error,
				...requestContext,
				metadata: {
					provider: 'google_calendar',
					oauthError: error,
					stateMatchesUser,
					resolvedRedirectPath
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error(`Calendar OAuth error: ${error}`),
			...baseErrorContext,
			operation: 'google_calendar_oauth_callback',
			severity: 'warning',
			metadata: {
				oauthError: error,
				stateMatchesUser,
				resolvedRedirectPath
			}
		});
		const errorDescriptions: Record<string, string> = {
			access_denied: 'User denied access to Google Calendar',
			invalid_request: 'Invalid OAuth request',
			unauthorized_client: 'Unauthorized OAuth client',
			unsupported_response_type: 'Unsupported response type',
			invalid_scope: 'Invalid OAuth scope requested',
			server_error: 'Google OAuth server error',
			temporarily_unavailable: 'Google OAuth temporarily unavailable'
		};

		const errorMsg = errorDescriptions[error] ? error : 'oauth_error';
		const target = buildCalendarRedirect(resolvedRedirectPath, {
			error: errorMsg
		});
		throw redirect(303, target);
	}

	if (!code) {
		console.error('No authorization code received');
		await logSecurityEvent(
			{
				eventType: 'integration.calendar.oauth_failed',
				category: 'integration',
				outcome: 'failure',
				severity: 'low',
				actorType: 'user',
				actorUserId: user.id,
				reason: 'missing_authorization_code',
				...requestContext,
				metadata: {
					provider: 'google_calendar',
					stateMatchesUser,
					resolvedRedirectPath
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error('No authorization code received'),
			...baseErrorContext,
			operation: 'google_calendar_oauth_callback_missing_code',
			severity: 'warning',
			metadata: {
				stateMatchesUser,
				resolvedRedirectPath
			}
		});
		const target = buildCalendarRedirect(resolvedRedirectPath, {
			error: 'no_authorization_code'
		});
		throw redirect(303, target);
	}

	// Verify state parameter matches user ID for security
	if (!stateMatchesUser) {
		console.error('State mismatch in calendar OAuth:', {
			expected: user.id,
			receivedStateUserId: stateUserId,
			hasState: !!stateParam
		});
		await logSecurityEvent(
			{
				eventType: 'integration.calendar.oauth_state_mismatch',
				category: 'integration',
				outcome: 'blocked',
				severity: 'medium',
				actorType: 'user',
				actorUserId: user.id,
				reason: 'state_mismatch',
				...requestContext,
				metadata: {
					provider: 'google_calendar',
					hasStateUserId: Boolean(stateUserId)
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error('Calendar OAuth state mismatch'),
			...baseErrorContext,
			operation: 'google_calendar_oauth_callback_state_mismatch',
			severity: 'warning',
			metadata: {
				expectedUserId: user.id,
				receivedStateUserId: stateUserId,
				hasState: Boolean(stateParam)
			}
		});
		throw redirect(
			303,
			buildCalendarRedirect(DEFAULT_REDIRECT_PATH, { error: 'invalid_state' })
		);
	}

	// Calculate the redirect URI dynamically
	const redirectUri = `${url.origin}/auth/google/calendar-callback`;
	console.log('Using redirect URI:', redirectUri);

	// Use the new OAuth service to handle token exchange
	const oAuthService = new GoogleOAuthService(supabase);
	const result = await oAuthService.exchangeCodeForTokens(code, redirectUri, user.id, user.email);

	if (!result.success) {
		console.error('Token exchange failed:', result.error);
		await logSecurityEvent(
			{
				eventType: 'integration.calendar.connect_failed',
				category: 'integration',
				outcome: 'failure',
				severity: 'medium',
				actorType: 'user',
				actorUserId: user.id,
				reason: result.error || 'token_exchange_failed',
				...requestContext,
				metadata: {
					provider: 'google_calendar',
					stage: 'token_exchange'
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: new Error(result.error || 'Calendar OAuth token exchange failed'),
			...baseErrorContext,
			operation: 'google_calendar_oauth_token_exchange',
			severity: 'error',
			metadata: {
				redirectUri,
				resolvedRedirectPath
			}
		});
		const target = buildCalendarRedirect(resolvedRedirectPath, {
			error: 'token_exchange_failed'
		});
		throw redirect(303, target);
	}

	console.log('Calendar tokens saved successfully');

	// Register webhook for two-way sync
	try {
		const webhookService = new CalendarWebhookService(createAdminSupabaseClient());
		const webhookUrl = `${url.origin}/webhooks/calendar-events`;

		const webhookResult = await webhookService.registerWebhook(user.id, webhookUrl, 'primary');

		if (webhookResult.success) {
			console.log('Webhook registered successfully for user:', user.id);
			await logSecurityEvent(
				{
					eventType: 'integration.calendar.webhook.registered',
					category: 'integration',
					outcome: 'success',
					severity: 'info',
					actorType: 'user',
					actorUserId: user.id,
					...requestContext,
					metadata: {
						provider: 'google_calendar',
						calendarId: 'primary'
					}
				},
				securityEventOptions
			);
		} else {
			console.error('Failed to register webhook:', webhookResult.error);
			await logSecurityEvent(
				{
					eventType: 'integration.calendar.webhook.failed',
					category: 'integration',
					outcome: 'failure',
					severity: 'low',
					actorType: 'user',
					actorUserId: user.id,
					reason: webhookResult.error || 'webhook_registration_failed',
					...requestContext,
					metadata: {
						provider: 'google_calendar',
						calendarId: 'primary'
					}
				},
				securityEventOptions
			);
			await logServerError({
				error: new Error(webhookResult.error || 'Calendar webhook registration failed'),
				...baseErrorContext,
				operation: 'google_calendar_webhook_register',
				severity: 'warning',
				metadata: {
					webhookUrl
				}
			});
			// Don't fail the whole flow if webhook registration fails
		}
	} catch (webhookError) {
		console.error('Error registering webhook:', webhookError);
		await logSecurityEvent(
			{
				eventType: 'integration.calendar.webhook.failed',
				category: 'integration',
				outcome: 'failure',
				severity: 'low',
				actorType: 'user',
				actorUserId: user.id,
				reason: webhookError instanceof Error ? webhookError.message : 'webhook_error',
				...requestContext,
				metadata: {
					provider: 'google_calendar',
					calendarId: 'primary'
				}
			},
			securityEventOptions
		);
		await logServerError({
			error: webhookError,
			...baseErrorContext,
			operation: 'google_calendar_webhook_register',
			severity: 'warning',
			metadata: {
				webhookUrl: `${url.origin}/webhooks/calendar-events`
			}
		});
		// Continue anyway - webhook is not critical for basic functionality
	}

	await logSecurityEvent(
		{
			eventType: 'integration.calendar.connected',
			category: 'integration',
			outcome: 'success',
			severity: 'info',
			actorType: 'user',
			actorUserId: user.id,
			...requestContext,
			metadata: {
				provider: 'google_calendar',
				resolvedRedirectPath
			}
		},
		securityEventOptions
	);

	// Success! Redirect back to settings with success message
	throw redirect(
		303,
		buildCalendarRedirect(resolvedRedirectPath, { success: 'calendar_connected' })
	);
};
