// apps/web/src/routes/dashboard/calendar/+page.server.ts
import { redirectToLogin } from '$lib/server/auth-redirects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { user } = await safeGetSession();
	if (!user) {
		redirectToLogin(url);
	}

	return { user };
};
