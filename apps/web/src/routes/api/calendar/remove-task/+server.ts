// apps/web/src/routes/api/calendar/remove-task/+server.ts
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { event_id, calendar_id } = await request.json();

		if (!event_id) {
			return ApiResponse.badRequest('Event ID is required');
		}

		const calendarService = new CalendarService(supabase);

		const result = await calendarService.deleteCalendarEvent(user.id, {
			event_id,
			calendar_id: calendar_id || 'primary',
			send_notifications: false
		});

		if (result.success) {
			return ApiResponse.success(
				{ message: 'Task removed from calendar successfully' },
				'Task removed from calendar successfully'
			);
		} else {
			return ApiResponse.internalError('Failed to remove calendar event');
		}
	} catch (error: any) {
		console.error('Error removing calendar event:', error);
		return ApiResponse.internalError(error.message || 'Failed to remove calendar event');
	}
};
