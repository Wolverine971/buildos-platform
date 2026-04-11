// apps/web/src/routes/auth/google/calendar-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { logServerError } from '$lib/server/error-tracking';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';

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
	const resolvedRedirectPath =
		stateMatchesUser && decodedState?.redirectPath && decodedState.redirectPath.startsWith('/')
			? decodedState.redirectPath
			: DEFAULT_REDIRECT_PATH;

	const buildRedirectTarget = (path: string, params: Record<string, string>): string => {
		const [basePath = '', existingQuery = ''] = path.split('?');
		const search = new URLSearchParams(existingQuery);
		Object.entries(params).forEach(([key, value]) => search.set(key, value));
		const queryString = search.toString();
		return queryString ? `${basePath}?${queryString}` : basePath;
	};

	const buildCalendarRedirect = (path: string, params: Record<string, string>) =>
		buildRedirectTarget(path, { calendar: '1', ...params });
	const baseErrorContext = {
		endpoint: '/auth/google/calendar-callback',
		method: 'GET',
		userId: user.id
	} as const;

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

		const errorMsg = errorDescriptions[error] || `OAuth error: ${error}`;
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
			error: result.error || 'token_exchange_failed'
		});
		throw redirect(303, target);
	}

	console.log('Calendar tokens saved successfully');

	// Register webhook for two-way sync
	try {
		const webhookService = new CalendarWebhookService(supabase);
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
