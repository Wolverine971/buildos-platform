// apps/web/src/routes/api/onto/projects/[id]/calendar/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createProjectCalendarRuntimeService } from '$lib/server/project-calendar-runtime.service';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { GOOGLE_CALENDAR_COLORS, type GoogleColorId } from '$lib/config/calendar-colors';
import type { ProjectCalendarSyncMode } from '$lib/services/project-calendar.service';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

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

	const access = await requireProjectAccess(locals, projectId, 'read');
	if (!access.ok) return access.response;

	const service = createProjectCalendarRuntimeService(locals.supabase, access.userId);
	return service.getProjectCalendar(projectId, access.userId);
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return ApiResponse.badRequest('Invalid request body');
	}
	const name = typeof body.name === 'string' ? body.name : undefined;
	const description = typeof body.description === 'string' ? body.description : undefined;
	const colorId = typeof body.colorId === 'string' ? body.colorId : undefined;
	const timeZone = typeof body.timeZone === 'string' ? body.timeZone : undefined;
	const calendarId =
		(typeof body.calendarId === 'string' ? body.calendarId : undefined) ||
		(typeof body.calendar_id === 'string' ? body.calendar_id : undefined);
	const calendarSourceId =
		(typeof body.calendarSourceId === 'string' ? body.calendarSourceId : undefined) ||
		(typeof body.calendar_source_id === 'string' ? body.calendar_source_id : undefined);
	const connectionId =
		(typeof body.connectionId === 'string' ? body.connectionId : undefined) ||
		(typeof body.connection_id === 'string' ? body.connection_id : undefined);
	if (colorId && !(colorId in GOOGLE_CALENDAR_COLORS)) {
		return ApiResponse.badRequest('colorId must be a valid Google Calendar color');
	}
	if (calendarSourceId && !isValidUUID(calendarSourceId)) {
		return ApiResponse.badRequest('calendarSourceId must be a valid UUID');
	}
	if (connectionId && !isValidUUID(connectionId)) {
		return ApiResponse.badRequest('connectionId must be a valid UUID');
	}
	if (calendarSourceId && connectionId) {
		return ApiResponse.badRequest('Choose either calendarSourceId or connectionId, not both');
	}
	const multiCalendarEnabled = isMultiCalendarUserAllowed(access.userId, privateEnv);
	if ((calendarSourceId || connectionId) && !multiCalendarEnabled) {
		return ApiResponse.badRequest('Project calendar source selection is not enabled.');
	}

	if (!multiCalendarEnabled) {
		const oAuthService = new GoogleOAuthService(locals.supabase);
		const status = await oAuthService.safeGetCalendarStatus(access.userId);
		if (!status.isConnected) {
			return ApiResponse.error('Google Calendar is not connected', 409);
		}
	}

	const service = createProjectCalendarRuntimeService(locals.supabase, access.userId);
	return service.createProjectCalendar({
		projectId,
		userId: access.userId,
		name,
		description,
		colorId: colorId as GoogleColorId | undefined,
		timeZone,
		calendarId,
		calendarSourceId,
		connectionId
	});
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const service = createProjectCalendarRuntimeService(locals.supabase, access.userId);
	const syncMode =
		(body?.syncMode as ProjectCalendarSyncMode | undefined) ||
		(body?.sync_mode as ProjectCalendarSyncMode | undefined);

	if (syncMode && syncMode !== 'actor_projection' && syncMode !== 'member_fanout') {
		return ApiResponse.badRequest('syncMode must be actor_projection or member_fanout');
	}

	const hasCalendarSettings =
		body?.name !== undefined ||
		body?.description !== undefined ||
		body?.colorId !== undefined ||
		body?.syncEnabled !== undefined;

	if (syncMode && !hasCalendarSettings) {
		const syncModeResult = await service.updateProjectCalendarSyncMode(projectId, syncMode);
		const syncPayload = await syncModeResult.json().catch(() => null);
		if (!syncPayload?.success) {
			return syncModeResult;
		}
		return ApiResponse.success(syncPayload.data, 'Project calendar sync mode updated');
	}

	return service.updateProjectCalendar(projectId, access.userId, {
		name: body?.name,
		description: body?.description,
		colorId: body?.colorId,
		syncEnabled: body?.syncEnabled,
		syncMode
	});
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}

	const access = await requireProjectAccess(locals, projectId, 'write');
	if (!access.ok) return access.response;

	const service = createProjectCalendarRuntimeService(locals.supabase, access.userId);
	return service.deleteProjectCalendar(projectId, access.userId);
};
