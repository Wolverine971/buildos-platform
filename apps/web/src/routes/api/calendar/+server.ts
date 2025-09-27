// src/routes/api/calendar/+server.ts
// Direct proxy endpoint for CalendarService methods

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';

interface CalendarRequest {
	method: string;
	params?: any;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const body = (await request.json()) as CalendarRequest;
		const { method, params = {} } = body;

		const calendarService = new CalendarService(supabase);

		// Route to appropriate CalendarService method
		switch (method) {
			case 'hasValidConnection':
				const isConnected = await calendarService.hasValidConnection(user.id);
				return json({ success: true, data: isConnected });

			case 'getCalendarEvents':
				const events = await calendarService.getCalendarEvents(user.id, params);
				return json({ success: true, data: events });

			case 'findAvailableSlots':
				const slots = await calendarService.findAvailableSlots(user.id, params);
				return json({ success: true, data: slots });

			case 'scheduleTask':
				const scheduleResult = await calendarService.scheduleTask(user.id, params);
				return json({ success: true, data: scheduleResult });

			case 'updateCalendarEvent':
				const updateResult = await calendarService.updateCalendarEvent(user.id, params);
				return json({ success: true, data: updateResult });

			case 'deleteCalendarEvent':
				const deleteResult = await calendarService.deleteCalendarEvent(user.id, params);
				return json({ success: true, data: deleteResult });

			case 'bulkDeleteCalendarEvents':
				const bulkDeleteResult = await calendarService.bulkDeleteCalendarEvents(
					user.id,
					params.events,
					params.options
				);
				return json({ success: true, data: bulkDeleteResult });

			case 'bulkScheduleTasks':
				const bulkScheduleResult = await calendarService.bulkScheduleTasks(
					user.id,
					params.tasks,
					params.options
				);
				return json({ success: true, data: bulkScheduleResult });

			case 'bulkUpdateCalendarEvents':
				const bulkUpdateResult = await calendarService.bulkUpdateCalendarEvents(
					user.id,
					params.updates,
					params.options
				);
				return json({ success: true, data: bulkUpdateResult });

			case 'disconnectCalendar':
				await calendarService.disconnectCalendar(user.id);
				return json({ success: true, data: { disconnected: true } });

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
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const calendarService = new CalendarService(supabase);
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
