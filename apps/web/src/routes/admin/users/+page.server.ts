// apps/web/src/routes/admin/users/+page.server.ts
import { redirectToLogin } from '$lib/server/auth-redirects';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const { safeGetSession } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirectToLogin(url);
	}
};
