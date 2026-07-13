// apps/web/src/routes/today/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getTodayFeed } from '$lib/server/today-feed.service';

export const load: PageServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	depends
}) => {
	depends('app:auth');
	depends('today:feed');

	const { user } = await safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login?redirect=%2Ftoday');
	}

	// Don't strand a user who hasn't finished onboarding on /today (bare-domain,
	// logo, or bookmark). Route them into the flow; the WP-0 first-run state is a
	// backstop, but /onboarding is where the first structured win is manufactured.
	// Explore/skip users have onboarding_completed_at set, so they fall through.
	if (!user.onboarding_completed_at) {
		throw redirect(303, '/onboarding');
	}

	try {
		const feed = await getTodayFeed({
			supabase,
			userId: user.id,
			timezone: user.timezone,
			timing: serverTiming
		});
		return { user, feed };
	} catch (error) {
		console.error('[Today] Failed to load today feed:', error);
		return { user, feed: null };
	}
};
