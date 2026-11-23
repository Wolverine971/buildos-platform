// apps/web/src/routes/api/knowledge/entities/[id]/similar/+server.ts
/**
 * GET /api/knowledge/entities/:id/similar
 *   "Might also be" on a person's card: the user's people who may be this one under another
 *   spelling ("Matt Solo" / "Matt Solowynsky"), why, and what tells each apart. Free (names and
 *   employers, no model). Pairs answered "Different" are left out. Not a person → empty list.
 *   Runs with the signed-in user's client: RLS limits it to their own entries.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');
	try {
		const people = await knowledgeStoreFor(locals.supabase, user.id).similarPeople(params.id);
		return ApiResponse.success({ people });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not look for look-alikes');
	}
};
