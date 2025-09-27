// src/routes/auth/google/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { PRIVATE_GOOGLE_CLIENT_ID } from '$env/static/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login?redirect=/profile?tab=calendar');
	}

	// Updated to use the new calendar callback URL
	const redirectUri = `${url.origin}/auth/google/calendar-callback`;

	// Build the Google OAuth URL with all necessary parameters
	const params = new URLSearchParams({
		client_id: PRIVATE_GOOGLE_CLIENT_ID,
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'https://www.googleapis.com/auth/calendar',
		access_type: 'offline',
		prompt: 'consent', // Force consent to ensure we get refresh token
		state: user.id, // Use user ID as state for security
		include_granted_scopes: 'true'
	});

	const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

	throw redirect(302, authUrl);
};
