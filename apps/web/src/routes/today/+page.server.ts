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
