// apps/web/src/routes/api/projects/[id]/calendar/sync/+server.ts
import type { RequestHandler } from './$types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ApiResponse } from '$lib/utils/api-response';
import { verifyLegacyProjectAccess } from '$lib/utils/api-helpers';

/**
 * POST /api/projects/[id]/calendar/sync
 * Sync all project tasks to the Google Calendar
 */
export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;

	// Verify user owns this project (security fix: 2026-01-03)
	const authResult = await verifyLegacyProjectAccess(supabase, projectId, user.id);
	if (!authResult.authorized) {
		return authResult.error!;
	}

	const service = new ProjectCalendarService(supabase);

	return service.syncProjectToCalendar(projectId, user.id);
};
