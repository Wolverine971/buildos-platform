// apps/web/src/routes/api/calendar/remove-task/+server.ts
import { z } from 'zod';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { parseJsonRequest } from '$lib/utils/request-validation';

const removeCalendarTaskSchema = z
	.object({
		event_id: z.string().min(1),
		calendar_id: z.string().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const parsed = await parseJsonRequest(request, removeCalendarTaskSchema);
		if (!parsed.ok) return parsed.response;
		const { event_id, calendar_id } = parsed.data;

		if (!event_id) {
			return ApiResponse.badRequest('Event ID is required');
		}

		const calendarService = new CalendarService(supabase);

		const result = await calendarService.deleteCalendarEvent(user.id, {
			event_id,
			calendar_id: calendar_id || 'primary',
			send_notifications: false,
			sendUpdates: 'none'
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
