// apps/web/src/routes/api/projects/dashboard/+server.ts
/**
 * GET /api/projects/dashboard
 * The Projects page's Today numbers and recent-activity panels, on their own: the same
 * payload the page's first load streams as `dashboard`. The page asks for this after the
 * overdue, inbox or brief-chat window changed something, instead of re-running its whole
 * load, which also reset the page's open project card.
 *
 * Reads go through the viewer's own client, so RLS decides what they can see.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { getUserDashboardAnalytics } from '$lib/services/dashboard/user-dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const actorId = await ensureActorId(locals.supabase, user.id);
		const dashboard = await getUserDashboardAnalytics(
			locals.supabase,
			user.id,
			locals.serverTiming,
			actorId,
			// Same options as the page load: the panels do not show parent labels.
			{ projectParents: false }
		);
		return ApiResponse.success({ dashboard });
	} catch (err) {
		console.error('[Projects dashboard API] Failed to load analytics:', err);
		return ApiResponse.internalError(err, 'Failed to load Today');
	}
};
