// apps/web/src/routes/auth/login/+page.server.ts
import { getSafeLocalRedirect } from '$lib/server/safe-redirect';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { session, user } = await safeGetSession();

	if (session && user) {
		throw redirect(
			303,
			getSafeLocalRedirect(url.searchParams.get('redirect'), url.origin, '/today')
		);
	}
};

// Disable prerendering for this page since it requires session data at runtime
export const prerender = false;
