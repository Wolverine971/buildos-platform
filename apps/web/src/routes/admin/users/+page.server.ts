// apps/web/src/routes/admin/users/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { safeGetSession } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		redirect(302, '/'); // Redirect to login if not authenticated
	}
};
