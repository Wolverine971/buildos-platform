// apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';

type ProjectAccessResult =
	| {
			ok: true;
			userId: string;
			actorId: string;
	  }
	| {
			ok: false;
			response: Response;
	  };

async function requireProjectAccess(
	locals: App.Locals,
	projectId: string
): Promise<ProjectAccessResult> {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase;

	const [actorResult, projectResult] = await Promise.all([
		supabase.rpc('ensure_actor_for_user', { p_user_id: user.id }),
		supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle()
	]);

	if (actorResult.error || !actorResult.data) {
		console.error('[Project Calendar API] Failed to resolve actor:', actorResult.error);
		return {
			ok: false,
			response: ApiResponse.internalError(
				actorResult.error || new Error('Failed to resolve user actor'),
				'Failed to resolve user actor'
			)
		};
	}

	if (projectResult.error) {
		console.error('[Project Calendar API] Failed to fetch project:', projectResult.error);
		return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
	}

	if (!projectResult.data) {
		return { ok: false, response: ApiResponse.notFound('Project') };
	}

	const actorId = actorResult.data as string;
	if (projectResult.data.created_by !== actorId) {
		return { ok: false, response: ApiResponse.forbidden('Access denied') };
	}

	return { ok: true, userId: user.id, actorId };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId);
	if (!access.ok) return access.response;

	const service = new ProjectCalendarService(locals.supabase);
	return service.getProjectCalendar(projectId, access.userId);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId);
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	const name = body?.name as string | undefined;
	const description = body?.description as string | undefined;
	const colorId = body?.colorId as string | undefined;
	const timeZone = body?.timeZone as string | undefined;

	const oAuthService = new GoogleOAuthService(locals.supabase);
	const status = await oAuthService.safeGetCalendarStatus(access.userId);
	if (!status.isConnected) {
		return ApiResponse.error('Google Calendar is not connected', 409);
	}

	const service = new ProjectCalendarService(locals.supabase);
	return service.createProjectCalendar({
		projectId,
		userId: access.userId,
		name,
		description,
		colorId,
		timeZone
	});
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId);
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const service = new ProjectCalendarService(locals.supabase);
	return service.updateProjectCalendar(projectId, access.userId, {
		name: body?.name,
		description: body?.description,
		colorId: body?.colorId,
		syncEnabled: body?.syncEnabled
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId);
	if (!access.ok) return access.response;

	const service = new ProjectCalendarService(locals.supabase);
	return service.deleteProjectCalendar(projectId, access.userId);
};
