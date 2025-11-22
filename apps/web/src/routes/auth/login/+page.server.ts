// apps/web/src/routes/auth/login/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();

	if (session && user) {
		throw redirect(303, '/');
	}
};

// Disable prerendering for this page since it requires session data at runtime
export const prerender = false;
