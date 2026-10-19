// apps/web/src/routes/test-realtime/+page.server.ts
import { redirectToLogin } from '$lib/server/auth-redirects';
import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const sessionData = await safeGetSession();

	if (!dev) {
		if (!sessionData.user) {
			redirectToLogin(url);
		}

		if (!sessionData.user.is_admin) {
			throw error(404, 'Not found');
		}
	}

	return {};
};
