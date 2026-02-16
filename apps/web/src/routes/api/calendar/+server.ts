// apps/web/src/routes/api/calendar/+server.ts
// Direct proxy endpoint for CalendarService methods

import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';

interface CalendarRequest {
	method: string;
	params?: any;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const authResult = await requireAuth(locals);
		if ('error' in authResult && authResult.error) {
			return authResult.error;
		}
		const { user } = authResult;

		const body = (await request.json()) as CalendarRequest;
		const { method, params = {} } = body;

		const calendarService = new CalendarService(locals.supabase);

		// Route to appropriate CalendarService method
		switch (method) {
			case 'hasValidConnection': {
				const isConnected = await calendarService.hasValidConnection(user.id);
				return ApiResponse.success(isConnected);
			}

			case 'getCalendarEvents': {
				const events = await calendarService.getCalendarEvents(user.id, params);
				return ApiResponse.success(events);
			}

			case 'findAvailableSlots': {
				const slots = await calendarService.findAvailableSlots(user.id, params);
				return ApiResponse.success(slots);
			}

			case 'scheduleTask': {
				const scheduleResult = await calendarService.scheduleTask(user.id, params);
				return ApiResponse.success(scheduleResult);
			}

			case 'updateCalendarEvent': {
				const updateResult = await calendarService.updateCalendarEvent(user.id, params);
				return ApiResponse.success(updateResult);
			}

			case 'deleteCalendarEvent': {
				const deleteResult = await calendarService.deleteCalendarEvent(user.id, params);
				return ApiResponse.success(deleteResult);
			}

			case 'getUpcomingTasks': {
				const tasks = await calendarService.getUpcomingTasks(user.id, params);
				return ApiResponse.success(tasks);
			}

			case 'bulkDeleteCalendarEvents': {
				const bulkDeleteResult = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					params.events,
					params.options
				);
				return ApiResponse.success(bulkDeleteResult);
			}

			case 'bulkScheduleTasks': {
				const bulkScheduleResult = await calendarService.bulkScheduleTasks(
					user.id,
					params.tasks,
					params.options
				);
				return ApiResponse.success(bulkScheduleResult);
			}

			case 'bulkUpdateCalendarEvents': {
				const bulkUpdateResult = await calendarService.bulkUpdateCalendarEvents(
					user.id,
					params.updates,
					params.options
				);
				return ApiResponse.success(bulkUpdateResult);
			}

			case 'disconnectCalendar':
				await calendarService.disconnectCalendar(user.id);
				return ApiResponse.success({ disconnected: true });

			case 'createProjectCalendar': {
				const result = await calendarService.createProjectCalendar(user.id, params);
				return ApiResponse.success(result);
			}

			case 'updateCalendarProperties': {
				const result = await calendarService.updateCalendarProperties(
					user.id,
					params.calendarId,
					params.updates
				);
				return ApiResponse.success(result);
			}

			case 'deleteProjectCalendar': {
				const result = await calendarService.deleteProjectCalendar(
					user.id,
					params.calendarId
				);
				return ApiResponse.success(result);
			}

			case 'listUserCalendars': {
				const result = await calendarService.listUserCalendars(user.id);
				return ApiResponse.success(result);
			}

			case 'shareCalendar': {
				const result = await calendarService.shareCalendar(
					user.id,
					params.calendarId,
					params.shares
				);
				return ApiResponse.success(result);
			}

			case 'unshareCalendar': {
				const result = await calendarService.unshareCalendar(
					user.id,
					params.calendarId,
					params.emails
				);
				return ApiResponse.success(result);
			}

			default:
				return ApiResponse.badRequest(`Unknown method: ${method}`);
		}
	} catch (error: any) {
		console.error('Calendar API error:', error);

		// Check for specific error types
		if (
			error.message?.includes('Connection required') ||
			error.message?.includes('not connected')
		) {
			return ApiResponse.error('Calendar not connected', 403, 'CALENDAR_NOT_CONNECTED', {
				requiresAuth: true
			});
		}

		if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
			return ApiResponse.error(
				'Calendar API limit reached. Please try again in a few minutes.',
				429,
				'RATE_LIMITED'
			);
		}

		return ApiResponse.internalError(error, error.message || 'Calendar operation failed');
	}
};

// GET endpoint for checking connection status
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const authResult = await requireAuth(locals);
		if ('error' in authResult && authResult.error) {
			return authResult.error;
		}
		const { user } = authResult;

		const calendarService = new CalendarService(locals.supabase);
		const isConnected = await calendarService.hasValidConnection(user.id);

		return ApiResponse.success({
			connected: isConnected,
			userId: user.id
		});
	} catch (error: any) {
		console.error('Calendar connection check error:', error);
		return ApiResponse.error(
			error.message || 'Calendar connection check failed',
			500,
			'OPERATION_FAILED',
			{ connected: false }
		);
	}
};
