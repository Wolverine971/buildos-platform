// apps/web/src/routes/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { needsOnboarding } from '$lib/server/project-visibility';
import { isAgentChatLaunch } from '$lib/utils/agent-chat-launch';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();

	// Defense in depth for requests that bypass the early hook redirect. Same gate as /today:
	// new users (flag unset, no projects) go into the flow rather than an empty /today;
	// completed users and returning users who already have projects land on /today.
	// A chat launch (Try in BuildOS) always goes to /today, which keeps new users out of
	// onboarding so the launch can open.
	if (user) {
		const dest =
			!isAgentChatLaunch(url.searchParams) && (await needsOnboarding(supabase, user))
				? '/onboarding'
				: '/today';
		throw redirect(303, `${dest}${url.search}`);
	}

	return {};
};
