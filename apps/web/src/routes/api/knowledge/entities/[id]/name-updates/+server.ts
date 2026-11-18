// apps/web/src/routes/api/knowledge/entities/[id]/name-updates/+server.ts
/**
 * GET /api/knowledge/entities/:id/name-updates
 *   The places in the caller's tasks and docs where this entry is tagged under another spelling
 *   of its full name (after a rename, or after "Phil Valeo" folded into "Phillip Velayo"), each
 *   with the sentence before → after and whether the caller can edit it (tasker 167).
 *   { name, places: NameUpdatePlace[] }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { knowledgeDb, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import { listNameUpdates } from '$lib/server/knowledge/name-updates.server';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');
	try {
		const result = await listNameUpdates(
			{
				db: knowledgeDb(locals.supabase),
				userId: user.id,
				canEdit: async (projectId) =>
					(
						await requireProjectMemberAccess({
							locals,
							projectId,
							requiredAccess: 'write',
							user
						})
					).ok
			},
			params.id
		);
		return ApiResponse.success(result);
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load the places to update');
	}
};
