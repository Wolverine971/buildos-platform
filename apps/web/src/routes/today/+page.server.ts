// apps/web/src/routes/today/+page.server.ts
import { redirectToLogin } from '$lib/server/auth-redirects';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTodayFeed } from '$lib/server/today-feed.service';
import { needsOnboarding } from '$lib/server/project-visibility';
import { readChatResumeSessionId } from '$lib/utils/agent-chat-resume';
import { isAgentChatLaunch } from '$lib/utils/agent-chat-launch';

// Set when a new user arrives with a chat launch. Navigation strips the launch params with a real
// navigation, which re-runs this load without them; the cookie keeps that re-run (and any feed
// invalidation during the chat) from bouncing them to /onboarding mid-conversation.
export const _CHAT_LAUNCH_GRACE_COOKIE = 'buildos_chat_launch_grace';
const CHAT_LAUNCH_GRACE_SECONDS = 60 * 60;

async function ownsChatSession(
	supabase: App.Locals['supabase'],
	userId: string,
	chatId: string
): Promise<boolean> {
	const { data, error } = await supabase
		.from('chat_sessions')
		.select('id')
		.eq('id', chatId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) console.error('[Today] Failed to check the resumed chat:', error);
	return Boolean(data);
}

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
		redirectToLogin(url);
	}

	// Don't strand a new user on an empty /today (bare-domain, logo, or bookmark). Route them
	// into the flow; the WP-0 first-run state is a backstop, but /onboarding is where the first
	// structured win is manufactured. Explore/skip users have onboarding_completed_at set, and
	// returning users who already have projects (some with the flag still null) stay here —
	// sign-in lands on /today, so they'd otherwise get onboarding on every sign-in.
	// Exception: a chat launch (`open=agent-chat` with a skill or drafted prompt, e.g. a public
	// "Try in BuildOS" link) means they came to try one specific thing. They stay here with the
	// launch params intact so Navigation opens chat with their draft (or resumes a linked chat); onboarding waits for the
	// next visit to /today. Read untracked: the launch params are one-time, so removing them must
	// not re-run this load on its own.
	const launch = untrack(() => ({
		isLaunch: isAgentChatLaunch(url.searchParams),
		resumeChatId: readChatResumeSessionId(url)
	}));
	const hadLaunchGrace = cookies.get(_CHAT_LAUNCH_GRACE_COOKIE) === '1';
	// A `?chat=` link only earns the grace when the chat is the visitor's own; any well-formed
	// UUID would otherwise skip onboarding. Skipped when the grace is already running.
	const arrivedWithLaunch =
		launch.isLaunch ||
		(!hadLaunchGrace &&
			launch.resumeChatId !== null &&
			(await ownsChatSession(supabase, user.id, launch.resumeChatId)));
	if (arrivedWithLaunch) {
		cookies.set(_CHAT_LAUNCH_GRACE_COOKIE, '1', {
			path: '/today',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: CHAT_LAUNCH_GRACE_SECONDS
		});
	}
	const inLaunchGrace = arrivedWithLaunch || hadLaunchGrace;
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
