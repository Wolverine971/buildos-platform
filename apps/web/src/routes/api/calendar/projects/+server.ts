// apps/web/src/routes/api/calendar/projects/+server.ts
import type { RequestHandler } from './$types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/calendar/projects
 * List all project calendars for the authenticated user
 */
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const service = new ProjectCalendarService(supabase);
	const response = await service.listUserProjectCalendars(session.user.id);

	const calendarResult = await response.json();
	return ApiResponse.success(calendarResult);
};
