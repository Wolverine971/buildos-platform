// apps/web/src/routes/api/onto/projects/[id]/calendar/sync-health/+server.ts
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
