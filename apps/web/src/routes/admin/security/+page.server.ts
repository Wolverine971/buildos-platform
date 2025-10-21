// apps/web/src/routes/admin/security/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	if (!user.is_admin) {
		throw redirect(302, '/');
	}

	return {
		user
	};
};
