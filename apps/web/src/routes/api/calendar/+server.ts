// apps/web/src/routes/api/calendar/+server.ts
// Direct proxy endpoint for CalendarService methods

import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarRuntimeErrorResponse } from '$lib/server/google-calendar-api-errors';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { GoogleCalendarReadService } from '$lib/server/google-calendar-read.service';
import {
	handleDeleteCalendarEvent,
	handleUpdateCalendarEvent
} from '$lib/server/calendar-proxy/event-write.handlers';
import {
	availabilityParamsSchema,
	calendarRequestSchema,
	eventReadParamsSchema
} from '$lib/server/calendar-proxy/request-schemas';
import { handleScheduleTask } from '$lib/server/calendar-proxy/schedule-task.handler';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

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

		const parsed = await parseJsonRequest(request, calendarRequestSchema);
		if (!parsed.ok) return parsed.response;
		const body = parsed.data as CalendarRequest;
		const { method, params = {} } = body;

		// Keep normal calendar reads/writes under the user's RLS authority while
		// reserving the service client for token/webhook cleanup. Automatic
		// disconnects can happen from any method after an invalid OAuth grant.
		const calendarService = new CalendarService(locals.supabase, {
			privilegedSupabase: createAdminSupabaseClient()
		});
		const multiCalendarEnabled = isMultiCalendarUserAllowed(user.id, privateEnv);

		// Await extracted handlers so rejected promises stay inside this route's shared catch.
		// Route to appropriate CalendarService method
		switch (method) {
			case 'hasValidConnection': {
				const isConnected = await calendarService.hasValidConnection(user.id);
				return ApiResponse.success(isConnected);
			}

			case 'getCalendarEvents': {
				if (multiCalendarEnabled) {
					const readParams = eventReadParamsSchema.safeParse(params);
					if (!readParams.success) {
						return ApiResponse.badRequest(
							'Invalid calendar event parameters',
							readParams.error.flatten()
						);
					}
					const service = new GoogleCalendarReadService(createAdminSupabaseClient());
					return ApiResponse.success(
						await service.listEvents({ userId: user.id, ...readParams.data }),
						undefined,
						{ public: false, maxAge: 0, mustRevalidate: true }
					);
				}
				const events = await calendarService.getCalendarEvents(user.id, params);
				return ApiResponse.success(events);
			}

			case 'findAvailableSlots': {
				if (multiCalendarEnabled) {
					const availabilityParams = availabilityParamsSchema.safeParse(params);
					if (!availabilityParams.success) {
						return ApiResponse.badRequest(
							'Invalid availability parameters',
							availabilityParams.error.flatten()
						);
					}
					const { duration_minutes, preferred_hours, ...readParams } =
						availabilityParams.data;
					const service = new GoogleCalendarReadService(createAdminSupabaseClient());
					return ApiResponse.success(
						await service.findAvailableSlots({
							userId: user.id,
							...readParams,
							durationMinutes: duration_minutes,
							preferredHours: preferred_hours
						}),
						undefined,
						{ public: false, maxAge: 0, mustRevalidate: true }
					);
				}
				const slots = await calendarService.findAvailableSlots(user.id, params);
				return ApiResponse.success(slots);
			}

			case 'scheduleTask': {
				return await handleScheduleTask({
					calendarService,
					multiCalendarEnabled,
					params,
					supabase: locals.supabase,
					user
				});
			}

			case 'updateCalendarEvent': {
				return await handleUpdateCalendarEvent({
					calendarService,
					multiCalendarEnabled,
					params,
					user
				});
			}

			case 'deleteCalendarEvent': {
				return await handleDeleteCalendarEvent({
					calendarService,
					multiCalendarEnabled,
					params,
					user
				});
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
		const runtimeResponse = googleCalendarRuntimeErrorResponse(error);
		if (runtimeResponse) return runtimeResponse;

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

		const calendarService = new CalendarService(locals.supabase, {
			privilegedSupabase: createAdminSupabaseClient()
		});
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
