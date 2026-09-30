// apps/web/src/routes/api/onto/projects/[id]/parent/+server.ts
//
// PUT { parent_project_id: string | null } — place this project under a parent
// project, or take it out (null). Nesting needs admin on this project and on
// the parent; taking it out needs admin on this project or on its current
// parent. The RPC decides from the session (so no role pre-check here, which
// would block a parent admin from detaching) and creates the parent's "Shared
// with sub-projects" folder on first use.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	hierarchyErrorApiCode,
	setProjectParent,
	toProjectHierarchyError
} from '$lib/services/ontology/project-hierarchy.service';

export const PUT: RequestHandler = async ({ params, locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}
	const raw = (body as { parent_project_id?: unknown } | null)?.parent_project_id;
	if (raw !== null && (typeof raw !== 'string' || !isValidUUID(raw))) {
		return ApiResponse.badRequest('parent_project_id must be a project id or null');
	}

	try {
		const result = await setProjectParent(locals.supabase, projectId, raw);
		return ApiResponse.success(
			result,
			result.parent_project_id
				? 'Moved under the parent project'
				: 'Removed from the parent project'
		);
	} catch (error) {
		const mapped = toProjectHierarchyError(error);
		return ApiResponse.error(mapped.message, mapped.status, hierarchyErrorApiCode(mapped));
	}
};
