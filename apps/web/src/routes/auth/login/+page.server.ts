// apps/web/src/routes/auth/login/+page.server.ts
import { signedInRedirectTarget } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { session, user } = await safeGetSession();

	if (session && user) {
		throw redirect(303, signedInRedirectTarget(url));
	}
};

// Disable prerendering for this page since it requires session data at runtime
export const prerender = false;
