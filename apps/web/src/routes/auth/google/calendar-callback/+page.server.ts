// apps/web/src/routes/auth/google/calendar-callback/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';

export const load: PageServerLoad = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

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
		const [basePath, existingQuery = ''] = path.split('?');
		const search = new URLSearchParams(existingQuery);
		Object.entries(params).forEach(([key, value]) => search.set(key, value));
		const queryString = search.toString();
		return queryString ? `${basePath}?${queryString}` : basePath;
	};

	const buildCalendarRedirect = (path: string, params: Record<string, string>) =>
		buildRedirectTarget(path, { calendar: '1', ...params });

	console.log('Calendar OAuth callback received:', {
		hasCode: !!code,
		hasError: !!error,
		state: stateParam,
		userId: user.id
	});

	// Handle OAuth errors
	if (error) {
		console.error('Calendar OAuth error:', error);
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
		const target = buildCalendarRedirect(resolvedRedirectPath, {
			error: 'no_authorization_code'
		});
		throw redirect(303, target);
	}

	// Verify state parameter matches user ID for security
	if (!stateMatchesUser) {
		console.error('State mismatch in calendar OAuth:', {
			expected: user.id,
			received: stateUserId || stateParam
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
		} else {
			console.error('Failed to register webhook:', webhookResult.error);
			// Don't fail the whole flow if webhook registration fails
		}
	} catch (webhookError) {
		console.error('Error registering webhook:', webhookError);
		// Continue anyway - webhook is not critical for basic functionality
	}

	// Success! Redirect back to settings with success message
	throw redirect(
		303,
		buildCalendarRedirect(resolvedRedirectPath, { success: 'calendar_connected' })
	);
};
