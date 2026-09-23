// apps/web/src/routes/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { needsOnboarding } from '$lib/server/project-visibility';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();

	// Defense in depth for requests that bypass the early hook redirect. Same gate as /today:
	// new users (flag unset, no projects) go into the flow rather than an empty /today;
	// completed users and returning users who already have projects land on /today.
	if (user) {
		const dest = (await needsOnboarding(supabase, user)) ? '/onboarding' : '/today';
		throw redirect(303, `${dest}${url.search}`);
	}

	return {};
};
