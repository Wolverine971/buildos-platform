// apps/web/src/routes/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals: { safeGetSession }, url }) => {
	const { user } = await safeGetSession();

	// Defense in depth for requests that bypass the early hook redirect. Mirror the
	// hook's onboarding gate: completed users land on /today, un-onboarded users go
	// into the flow rather than an empty /today (explore/skip users are completed).
	if (user) {
		const dest = user.onboarding_completed_at ? '/today' : '/onboarding';
		throw redirect(303, `${dest}${url.search}`);
	}

	return {};
};
