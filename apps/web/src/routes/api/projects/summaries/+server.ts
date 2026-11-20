// apps/web/src/routes/api/projects/summaries/+server.ts
/**
 * GET /api/projects/summaries
 * The Projects page's tiles, on their own: the same list the page's first load streams
 * (loadProjectListSummaries). The page asks for this after a change to one project instead
 * of re-running its whole load, which also re-read the Workspace and the Today analytics and
 * reset the page's open card.
 *
 * Reads go through the viewer's own client, so RLS decides what they can see.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { loadProjectListSummaries } from '$lib/server/projects/project-list-summaries';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const actorId = await ensureActorId(locals.supabase, user.id);
		const projects = await loadProjectListSummaries(
			locals.supabase,
			actorId,
			locals.serverTiming
		);
		return ApiResponse.success({ projects });
	} catch (err) {
		console.error('[Projects summaries API] Failed to load projects:', err);
		return ApiResponse.internalError(err, 'Failed to load projects');
	}
};
