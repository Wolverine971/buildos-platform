// apps/web/src/routes/api/onto/projects/[id]/family/+server.ts
//
// GET a project's family: parent (only if the viewer can open it), the
// parent's shared-docs shelf, and the sub-projects the viewer can open.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	getProjectFamily,
	hierarchyErrorApiCode,
	toProjectHierarchyError
} from '$lib/services/ontology/project-hierarchy.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	const projectId = params.id;
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');

	try {
		return ApiResponse.success(await getProjectFamily(locals.supabase, projectId));
	} catch (error) {
		const mapped = toProjectHierarchyError(error);
		return ApiResponse.error(mapped.message, mapped.status, hierarchyErrorApiCode(mapped));
	}
};
