// apps/web/src/routes/api/onto/projects/[id]/calendar/collaboration/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

type ProjectAccessResult =
	| {
			ok: true;
			userId: string;
	  }
	| {
			ok: false;
			response: Response;
	  };

async function requireProjectAccess(
	locals: App.Locals,
	projectId: string,
	requiredAccess: 'read' | 'write' | 'admin'
): Promise<ProjectAccessResult> {
	const access = await requireProjectMemberAccess({
		locals,
		projectId,
		requiredAccess,
		forbiddenMessage: 'Access denied'
	});
	if (!access.ok) return { ok: false, response: access.response };

	return { ok: true, userId: access.userId };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	// Collaboration sync visibility is scoped to project writers.
	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const service = new ProjectCalendarService(locals.supabase);
	return service.getProjectCalendarCollaboration(projectId, access.userId);
};
