import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { user } = await safeGetSession();

	// Defense in depth for requests that bypass the early hook redirect.
	if (user) {
		throw redirect(303, `/dashboard${url.search}`);
	}

	return {};
};
