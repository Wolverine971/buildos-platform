// apps/web/src/routes/auth/google/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { createCalendarConnectUrl } from '$lib/server/calendar-connect-url';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login?redirect=/profile?tab=calendar');
	}

	const authUrl = await createCalendarConnectUrl({
		supabase,
		userId: user.id,
		origin: url.origin,
		redirectPath: '/profile?tab=calendar&calendar=1'
	});

	throw redirect(302, authUrl);
};
