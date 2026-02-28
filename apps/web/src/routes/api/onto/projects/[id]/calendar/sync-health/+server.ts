// apps/web/src/routes/api/onto/projects/[id]/calendar/sync-health/+server.ts
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
			'[Project Calendar Sync Health API] Failed to resolve actor:',
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
			'[Project Calendar Sync Health API] Failed to check access:',
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
			'[Project Calendar Sync Health API] Failed to fetch project:',
			projectResult.error
		);
		return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
	}

	if (!projectResult.data) {
		return { ok: false, response: ApiResponse.notFound('Project') };
	}

	return { ok: true, userId: user.id };
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const limitRaw = url.searchParams.get('limit');
	const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

	const service = new ProjectCalendarService(locals.supabase);
	return service.getProjectEventSyncHealth(projectId, access.userId, limit);
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const body = (await request.json().catch(() => null)) as {
		eventId?: string;
		event_id?: string;
		targetUserId?: string;
		target_user_id?: string;
		action?: 'upsert' | 'delete';
	} | null;

	const eventId = body?.eventId || body?.event_id;
	const targetUserId = body?.targetUserId || body?.target_user_id;
	const action = body?.action === 'delete' || body?.action === 'upsert' ? body.action : undefined;

	if (!eventId || !targetUserId) {
		return ApiResponse.badRequest('eventId and targetUserId are required');
	}

	const service = new ProjectCalendarService(locals.supabase);
	return service.retryProjectEventSyncTarget(projectId, access.userId, {
		eventId,
		targetUserId,
		action
	});
};
