// apps/web/src/routes/api/calendar/+server.ts
// Direct proxy endpoint for CalendarService methods

import { json } from '@sveltejs/kit';
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
				return json({ success: true, data: isConnected });
			}

			case 'getCalendarEvents': {
				const events = await calendarService.getCalendarEvents(user.id, params);
				return json({ success: true, data: events });
			}

			case 'findAvailableSlots': {
				const slots = await calendarService.findAvailableSlots(user.id, params);
				return json({ success: true, data: slots });
			}

			case 'scheduleTask': {
				const scheduleResult = await calendarService.scheduleTask(user.id, params);
				return json({ success: true, data: scheduleResult });
			}

			case 'updateCalendarEvent': {
				const updateResult = await calendarService.updateCalendarEvent(user.id, params);
				return json({ success: true, data: updateResult });
			}

			case 'deleteCalendarEvent': {
				const deleteResult = await calendarService.deleteCalendarEvent(user.id, params);
				return json({ success: true, data: deleteResult });
			}

			case 'getUpcomingTasks': {
				const tasks = await calendarService.getUpcomingTasks(user.id, params);
				return json({ success: true, data: tasks });
			}

			case 'bulkDeleteCalendarEvents': {
				const bulkDeleteResult = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					params.events,
					params.options
				);
				return json({ success: true, data: bulkDeleteResult });
			}

			case 'bulkScheduleTasks': {
				const bulkScheduleResult = await calendarService.bulkScheduleTasks(
					user.id,
					params.tasks,
					params.options
				);
				return json({ success: true, data: bulkScheduleResult });
			}

			case 'bulkUpdateCalendarEvents': {
				const bulkUpdateResult = await calendarService.bulkUpdateCalendarEvents(
					user.id,
					params.updates,
					params.options
				);
				return json({ success: true, data: bulkUpdateResult });
			}

			case 'disconnectCalendar':
				await calendarService.disconnectCalendar(user.id);
				return json({ success: true, data: { disconnected: true } });

			case 'createProjectCalendar': {
				const result = await calendarService.createProjectCalendar(user.id, params);
				return json({ success: true, data: result });
			}

			case 'updateCalendarProperties': {
				const result = await calendarService.updateCalendarProperties(
					user.id,
					params.calendarId,
					params.updates
				);
				return json({ success: true, data: result });
			}

			case 'deleteProjectCalendar': {
				const result = await calendarService.deleteProjectCalendar(user.id, params.calendarId);
				return json({ success: true, data: result });
			}

			case 'listUserCalendars': {
				const result = await calendarService.listUserCalendars(user.id);
				return json({ success: true, data: result });
			}

			case 'shareCalendar': {
				const result = await calendarService.shareCalendar(
					user.id,
					params.calendarId,
					params.shares
				);
				return json({ success: true, data: result });
			}

			case 'unshareCalendar': {
				const result = await calendarService.unshareCalendar(
					user.id,
					params.calendarId,
					params.emails
				);
				return json({ success: true, data: result });
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
			return json(
				{
					success: false,
					error: 'Calendar not connected',
					requiresAuth: true
				},
				{ status: 403 }
			);
		}

		if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
			return json(
				{
					success: false,
					error: 'Calendar API limit reached. Please try again in a few minutes.'
				},
				{ status: 429 }
			);
		}

		return json(
			{
				success: false,
				error: error.message || 'Calendar operation failed'
			},
			{ status: 500 }
		);
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

		return json({
			success: true,
			connected: isConnected,
			userId: user.id
		});
	} catch (error: any) {
		console.error('Calendar connection check error:', error);
		return json({
			success: false,
			connected: false,
			error: error.message
		});
	}
};
