// apps/web/src/routes/auth/google/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login?redirect=/profile?tab=calendar');
	}

	// Updated to use the new calendar callback URL
	const redirectUri = `${url.origin}/auth/google/calendar-callback`;
	const authUrl = new GoogleOAuthService(supabase).generateCalendarAuthUrl(redirectUri, user.id, {
		redirectPath: '/profile?tab=calendar&calendar=1'
	});

	throw redirect(302, authUrl);
};
