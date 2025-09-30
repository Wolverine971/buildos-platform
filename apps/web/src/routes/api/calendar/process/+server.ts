// apps/web/src/routes/api/calendar/process/+server.ts
// Direct proxy endpoint for CalendarService methods

import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

interface CalendarRequest {
	method: string;
	params?: any;
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const body = (await request.json()) as CalendarRequest;
		const { method, params = {} } = body;

		const calendarService = new CalendarService(supabase);

		// Route to appropriate CalendarService method
		switch (method) {
			case 'hasValidConnection': {
				const isConnected = await calendarService.hasValidConnection(user.id);
				return ApiResponse.success({ connected: isConnected });
			}

			case 'disconnectCalendar': {
				await calendarService.disconnectCalendar(user.id);
				return ApiResponse.success(
					{ disconnected: true },
					'Calendar disconnected successfully'
				);
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
				const result = await calendarService.scheduleTask(user.id, params);
				return ApiResponse.success(result);
			}

			case 'updateCalendarEvent': {
				const result = await calendarService.updateCalendarEvent(user.id, params);
				return ApiResponse.success(result);
			}

			case 'deleteCalendarEvent': {
				const result = await calendarService.deleteCalendarEvent(user.id, params);
				return ApiResponse.success(result);
			}

			case 'getUpcomingTasks': {
				const tasks = await calendarService.getUpcomingTasks(user.id, params);
				return ApiResponse.success(tasks);
			}

			case 'bulkDeleteCalendarEvents': {
				const result = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					params.events,
					params.options
				);
				return ApiResponse.success(result);
			}

			case 'bulkScheduleTasks': {
				const result = await calendarService.bulkScheduleTasks(
					user.id,
					params.tasks,
					params.options
				);
				return ApiResponse.success(result);
			}

			case 'bulkUpdateCalendarEvents': {
				const result = await calendarService.bulkUpdateCalendarEvents(
					user.id,
					params.updates,
					params.options
				);
				return ApiResponse.success(result);
			}

			// Project Calendar Methods
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

		// Handle specific error types
		if (error.requiresReconnection || error.requiresAuth) {
			return ApiResponse.forbidden('Calendar not connected. Please reconnect your calendar.');
		}

		if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
			return ApiResponse.tooManyRequests(
				'Calendar API limit reached. Please try again in a few minutes.'
			);
		}

		if (error.message?.includes('not found') || error.code === 404) {
			return ApiResponse.notFound(error.message || 'Calendar resource not found');
		}

		return ApiResponse.internalError(error.message || 'Calendar operation failed');
	}
};

// GET endpoint for checking connection status
export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const calendarService = new CalendarService(supabase);
		const isConnected = await calendarService.hasValidConnection(user.id);

		return ApiResponse.success({
			connected: isConnected,
			userId: user.id
		});
	} catch (error: any) {
		console.error('Calendar connection check error:', error);
		return ApiResponse.success({
			connected: false,
			error: error.message
		});
	}
};
