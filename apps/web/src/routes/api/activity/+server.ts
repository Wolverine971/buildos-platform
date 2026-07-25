// apps/web/src/routes/api/activity/+server.ts
//
// Pagination endpoint for the /notifications activity timeline. The page loader
// renders page 1; this serves every page after it as the user scrolls.

import type { RequestHandler } from './$types';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import { loadActivityTimeline } from '$lib/server/activity-timeline.service';
import { ACTIVITY_LANES, type ActivityLane } from '$lib/types/activity-timeline';

const VALID_LANES = new Set<string>(ACTIVITY_LANES.map((lane) => lane.key));
const MAX_LIMIT = 50;

export const GET: RequestHandler = async ({ locals, url }) => {
	const auth = await requireAuth(locals);
	if ('error' in auth && auth.error) return auth.error;
	if (!auth.user) return ApiResponse.unauthorized();

	const before = url.searchParams.get('before');
	if (before && !Number.isFinite(Date.parse(before))) {
		return ApiResponse.badRequest('`before` must be an ISO timestamp');
	}

	const limitParam = url.searchParams.get('limit');
	const parsedLimit = limitParam ? Number.parseInt(limitParam, 10) : NaN;
	const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : 30;

	const laneParam = url.searchParams.get('lanes');
	const lanes = laneParam
		? (laneParam
				.split(',')
				.map((lane) => lane.trim())
				.filter((lane) => VALID_LANES.has(lane)) as ActivityLane[])
		: null;

	// An explicit lane list that resolves to nothing valid would silently widen to
	// "everything", which is the opposite of what the caller asked for.
	if (laneParam && (!lanes || lanes.length === 0)) {
		return ApiResponse.badRequest('`lanes` must contain at least one valid lane');
	}

	try {
		const page = await loadActivityTimeline({
			supabase: locals.supabase,
			userId: auth.user.id,
			before,
			limit,
			lanes,
			timing: locals.serverTiming
		});
		return ApiResponse.success(page);
	} catch (err) {
		console.error('[Activity] Failed to load timeline page', err);
		return ApiResponse.internalError(err, 'Failed to load activity');
	}
};
