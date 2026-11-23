// apps/web/src/routes/api/knowledge/merge/sweep/+server.ts
/**
 * POST /api/knowledge/merge/sweep
 *   Look through all of the user's people for look-alikes ("Matt Solo" / "Matt Solowynsky") and
 *   add a "same person?" question to the duplicates review for each pair never asked before.
 *   Free (names and employers, no model); merges nothing. → { found, added }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeErrorResponse, knowledgeStoreFor } from '$lib/server/knowledge/knowledge.server';

export const POST: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		return ApiResponse.success(
			await knowledgeStoreFor(locals.supabase, user.id).sweepSimilarPeople()
		);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not look for duplicates');
	}
};
