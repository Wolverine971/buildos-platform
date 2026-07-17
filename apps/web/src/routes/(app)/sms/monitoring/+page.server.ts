// apps/web/src/routes/(app)/sms/monitoring/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(
			303,
			`/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`
		);
	}
	if (!user.is_admin) {
		throw redirect(303, '/dashboard');
	}

	return {};
};
