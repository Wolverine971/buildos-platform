// apps/web/src/routes/api/onto/projects/[id]/calendar/collaboration/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';

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
	const { user } = await locals.safeGetSession();
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase;

	const [actorResult, accessResult, projectResult] = await Promise.all([
		supabase.rpc('ensure_actor_for_user', { p_user_id: user.id }),
		supabase.rpc('current_actor_has_project_access', {
			p_project_id: projectId,
			p_required_access: requiredAccess
		}),
		supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle()
	]);

	if (actorResult.error || !actorResult.data) {
		console.error(
			'[Project Calendar Collaboration API] Failed to resolve actor:',
			actorResult.error
		);
		return {
			ok: false,
			response: ApiResponse.internalError(
				actorResult.error || new Error('Failed to resolve user actor'),
				'Failed to resolve user actor'
			)
		};
	}

	if (accessResult.error) {
		console.error(
			'[Project Calendar Collaboration API] Failed to check access:',
			accessResult.error
		);
		return {
			ok: false,
			response: ApiResponse.internalError(
				accessResult.error,
				'Failed to check project access'
			)
		};
	}

	if (!accessResult.data) {
		return { ok: false, response: ApiResponse.forbidden('Access denied') };
	}

	if (projectResult.error) {
		console.error(
			'[Project Calendar Collaboration API] Failed to fetch project:',
			projectResult.error
		);
		return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
	}

	if (!projectResult.data) {
		return { ok: false, response: ApiResponse.notFound('Project') };
	}

	return { ok: true, userId: user.id };
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
