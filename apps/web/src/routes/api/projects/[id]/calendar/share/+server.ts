// apps/web/src/routes/api/projects/[id]/calendar/share/+server.ts
import type { RequestHandler } from './$types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * POST /api/projects/[id]/calendar/share
 * Share the project calendar with other users
 */
export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { session } = await safeGetSession();
	if (!session?.user?.id) {
		return ApiResponse.unauthorized();
	}

	try {
		const body = await request.json();
		const { shares } = body; // Array of { email: string, role: 'reader' | 'writer' }

		if (!shares || !Array.isArray(shares) || shares.length === 0) {
			return ApiResponse.badRequest('No share recipients provided');
		}

		const projectId = params.id;
		const service = new ProjectCalendarService(supabase);

		// First check if calendar exists
		const response = await service.getProjectCalendar(projectId, session.user.id);

		const calendarResult = await response.json();
		if (!calendarResult.success || !calendarResult.data) {
			return ApiResponse.error('No calendar configured for this project', 400);
		}

		const projectCalendar = calendarResult.data;
		const calendarService = new CalendarService(supabase);

		// Share the calendar with specified users
		const shareResult = await calendarService.shareCalendar(
			session.user.id,
			projectCalendar.calendar_id,
			shares
		);

		if (shareResult.success) {
			return ApiResponse.success(
				shareResult,
				`Calendar shared with ${shares.length} user${shares.length !== 1 ? 's' : ''}`
			);
		} else {
			return ApiResponse.error(shareResult.error || 'Failed to share calendar', 400);
		}
	} catch (error: any) {
		console.error('Error sharing calendar:', error);
		return ApiResponse.internalError(error, 'Failed to share calendar');
	}
};
