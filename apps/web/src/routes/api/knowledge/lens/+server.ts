// apps/web/src/routes/api/knowledge/lens/+server.ts
/**
 * GET /api/knowledge/lens?project_id=<uuid>&record_kind=task|document&record_ids=<uuid,uuid>
 *
 * What the OTHER members of a shared project have in their People for the names on these
 * tasks or docs (tasker 168): public-web and in-project facts, contact details they granted,
 * and a count of what's held back ("Alice has 2 contact details · Ask"). The database checks
 * membership and the per-fact rules (knowledge_project_lens); a project nobody else is in
 * returns { entries: [], shared: false } without calling it.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import {
	loadProjectLens,
	projectHasOtherMembers,
	sharingErrorResponse
} from '$lib/server/knowledge/sharing.server';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const projectId = url.searchParams.get('project_id') ?? '';
	const recordKind = url.searchParams.get('record_kind') ?? '';
	const recordIds = (url.searchParams.get('record_ids') ?? '')
		.split(',')
		.filter((id) => UUID_PATTERN.test(id))
		.slice(0, 100);
	if (!UUID_PATTERN.test(projectId)) return ApiResponse.badRequest('Invalid project');
	if (recordKind !== 'task' && recordKind !== 'document')
		return ApiResponse.badRequest('Invalid record kind');
	if (!recordIds.length) return ApiResponse.success({ entries: [], shared: false });

	try {
		if (!(await projectHasOtherMembers(locals.supabase, projectId, user.id))) {
			return ApiResponse.success({ entries: [], shared: false });
		}
		const entries = await loadProjectLens(locals.supabase, {
			projectId,
			recordKind,
			recordIds
		});
		return ApiResponse.success({ entries, shared: true });
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not load what others know');
	}
};
