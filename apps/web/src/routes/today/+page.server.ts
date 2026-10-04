// apps/web/src/routes/today/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTodayFeed } from '$lib/server/today-feed.service';
import { needsOnboarding } from '$lib/server/project-visibility';
import { isAgentChatLaunch } from '$lib/utils/agent-chat-launch';

// Set when a new user arrives with a chat launch. Navigation strips the launch params with a real
// navigation, which re-runs this load without them; the cookie keeps that re-run (and any feed
// invalidation during the chat) from bouncing them to /onboarding mid-conversation.
export const _CHAT_LAUNCH_GRACE_COOKIE = 'buildos_chat_launch_grace';
const CHAT_LAUNCH_GRACE_SECONDS = 60 * 60;

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	depends,
	url,
	cookies,
	untrack
}) => {
	depends('app:auth');
	depends('today:feed');

	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login?redirect=%2Ftoday');
	}

	// Don't strand a new user on an empty /today (bare-domain, logo, or bookmark). Route them
	// into the flow; the WP-0 first-run state is a backstop, but /onboarding is where the first
	// structured win is manufactured. Explore/skip users have onboarding_completed_at set, and
	// returning users who already have projects (some with the flag still null) stay here —
	// sign-in lands on /today, so they'd otherwise get onboarding on every sign-in.
	// Exception: a chat launch (`open=agent-chat` with a skill or drafted prompt, e.g. a public
	// "Try in BuildOS" link) means they came to try one specific thing. They stay here with the
	// launch params intact so Navigation opens chat with their draft; onboarding waits for the
	// next visit to /today. Read untracked: the launch params are one-time, so removing them must
	// not re-run this load on its own.
	const arrivedWithLaunch = untrack(() => isAgentChatLaunch(url.searchParams));
	if (arrivedWithLaunch) {
		cookies.set(_CHAT_LAUNCH_GRACE_COOKIE, '1', {
			path: '/today',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: CHAT_LAUNCH_GRACE_SECONDS
		});
	}
	const inLaunchGrace = arrivedWithLaunch || cookies.get(_CHAT_LAUNCH_GRACE_COOKIE) === '1';
	if (!inLaunchGrace && (await needsOnboarding(supabase, user))) {
		throw redirect(303, '/onboarding');
	}

	try {
		const feed = await getTodayFeed({
			supabase,
			userId: user.id,
			timezone: user.timezone,
			timing: serverTiming
		});
		const activatedProjectId = url.searchParams.get('activated_project');
		return {
			user,
			feed,
			activatedProjectId: feed.projects.some((project) => project.id === activatedProjectId)
				? activatedProjectId
				: null
		};
	} catch (error) {
		console.error('[Today] Failed to load today feed:', error);
		return { user, feed: null, activatedProjectId: null };
	}
};
