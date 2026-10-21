// apps/web/src/routes/auth/register/+page.server.ts
import { signedInRedirectTarget } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { session, user } = await safeGetSession();

	if (session && user) {
		// Same as sign-in: an invite or chat link someone opened while signed in still lands.
		throw redirect(303, signedInRedirectTarget(url));
	}
};
