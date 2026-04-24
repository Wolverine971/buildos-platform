// apps/web/src/routes/test-realtime/+page.server.ts
import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const sessionData = await safeGetSession();

	if (!dev) {
		if (!sessionData.user) {
			throw redirect(303, '/auth/login');
		}

		if (!sessionData.user.is_admin) {
			throw error(404, 'Not found');
		}
	}

	return {};
};
