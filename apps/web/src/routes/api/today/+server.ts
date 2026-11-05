// apps/web/src/routes/api/today/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getTodayFeed } from '$lib/server/today-feed.service';
import { activeProjectNames, getTodayAttention } from '$lib/server/today-attention.service';

export const GET: RequestHandler = async ({
	url,
	locals: { safeGetSession, supabase, serverTiming }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		const feed = await getTodayFeed({
			supabase,
			userId: user.id,
			timezone: url.searchParams.get('timezone') ?? user.timezone,
			timing: serverTiming
		});
		const attention = await getTodayAttention({
			supabase,
			userId: user.id,
			date: feed.date,
			projectNames: activeProjectNames(feed),
			timing: serverTiming
		});
		return ApiResponse.success({ feed, attention });
	} catch (err) {
		console.error('[Today] Failed to load today feed:', err);
		return ApiResponse.internalError(err, 'Failed to load today feed');
	}
};
