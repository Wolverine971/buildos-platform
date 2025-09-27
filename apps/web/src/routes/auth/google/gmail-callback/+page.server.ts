// src/routes/auth/google/gmail-callback/+page.server.ts
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { PUBLIC_SUPABASE_PROJECT_ID } from '$env/static/public';

export const load: PageServerLoad = async ({ url, locals: { supabase }, cookies }) => {
	const code = url.searchParams.get('code');
	const oauthError = url.searchParams.get('error');
	const state = url.searchParams.get('state');
	const next = url.searchParams.get('next') ?? '/';

	console.log('Gmail OAuth callback received:', {
		hasCode: !!code,
		hasError: !!oauthError,
		state,
		next
	});

	if (oauthError) {
		console.error('Gmail OAuth error:', oauthError);
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
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('No authorization code received')}`
		);
	}

	console.log('Exchanging code for session...');

	const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

	if (exchangeError) {
		console.error('Code exchange error:', exchangeError);
		throw redirect(
			303,
			`/auth/login?error=${encodeURIComponent('Authentication failed. Please try again.')}`
		);
	}

	if (!data.session || !data.user) {
		console.error('No session or user created after code exchange');
		throw redirect(303, `/auth/login?error=${encodeURIComponent('Failed to create session')}`);
	}

	console.log('Gmail OAuth successful for user:', data.user.id);

	// Check and create user record if not exists
	let isNewUser = false;

	const { data: existingUser, error: fetchError } = await supabase
		.from('users')
		.select('id, completed_onboarding')
		.eq('id', data.user.id)
		.single();

	if (fetchError && fetchError.code === 'PGRST116') {
		// User doesn't exist, create them
		console.log('Creating new user record...');
		isNewUser = true;

		const { error: insertError } = await supabase.from('users').insert({
			id: data.user.id,
			email: data.user.email as string,
			name:
				data.user.user_metadata?.name ||
				data.user.user_metadata?.full_name ||
				data.user.email?.split('@')[0] ||
				'User',
			is_admin: false,
			completed_onboarding: false,
			created_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});

		if (insertError) {
			console.error('Error creating user record:', insertError);
			// Continue anyway - the auth flow proceeds regardless
		} else {
			console.log('User record created successfully');
		}
	} else if (fetchError) {
		console.error('Error checking user existence:', fetchError);
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

	console.log('Redirecting to:', redirectUrl.pathname + redirectUrl.search);
	throw redirect(303, redirectUrl.pathname + redirectUrl.search);
};
