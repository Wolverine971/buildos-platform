// apps/web/src/routes/api/knowledge/where/+server.ts
/**
 * GET /api/knowledge/where?ids=<uuid>,<uuid>,…   (up to 100)
 *     → { where: { [entityId]: { projects, tasks, documents } } }
 *     The projects, tasks and docs that name each entry, with the quote that named it.
 * GET /api/knowledge/where?project_id=<uuid>
 *     → { project, entities, where }: every entry linked to that project, its tasks or its docs
 *     (the knowledge page's "Everything in Cadre" filter).
 * Reads go through the caller's client (links are owner-only; records they can't open drop out).
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import { loadProjectEntries, loadWhereForEntities } from '$lib/server/knowledge/where.server';

const MAX_IDS = 100;

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	try {
		const projectId = url.searchParams.get('project_id');
		if (projectId !== null) {
			if (!UUID_PATTERN.test(projectId)) return ApiResponse.badRequest('Invalid project');
			const result = await loadProjectEntries(locals.supabase, user.id, projectId);
			if (!result) return ApiResponse.notFound('Project');
			return ApiResponse.success(result);
		}

		const ids = [
			...new Set(
				(url.searchParams.get('ids') ?? '')
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean)
			)
		];
		if (!ids.length || ids.length > MAX_IDS || !ids.every((id) => UUID_PATTERN.test(id)))
			return ApiResponse.badRequest(`Send 1 to ${MAX_IDS} entry ids`);
		const where = await loadWhereForEntities(locals.supabase, user.id, ids);
		return ApiResponse.success({ where });
	} catch (error) {
		return ApiResponse.internalError(error, 'Could not load where these show up');
	}
};
