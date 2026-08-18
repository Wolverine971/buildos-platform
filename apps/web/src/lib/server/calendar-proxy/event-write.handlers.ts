// apps/web/src/lib/server/calendar-proxy/event-write.handlers.ts
import type { CalendarService } from '$lib/services/calendar-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { GoogleCalendarWriteService } from '$lib/server/google-calendar-write.service';
import { ApiResponse } from '$lib/utils/api-response';
import {
	deleteEventParamsSchema,
	recurringInstanceEventId,
	updateEventParamsSchema
} from './request-schemas';

interface EventWriteHandlerDependencies {
	calendarService: CalendarService;
	multiCalendarEnabled: boolean;
	params: any;
	user: { id: string };
}

export async function handleUpdateCalendarEvent({
	calendarService,
	multiCalendarEnabled,
	params,
	user
}: EventWriteHandlerDependencies): Promise<Response> {
	if (multiCalendarEnabled) {
		const updateParams = updateEventParamsSchema.safeParse(params);
		if (!updateParams.success) {
			return ApiResponse.badRequest(
				'Invalid calendar event update',
				updateParams.error.flatten()
			);
		}
		const value = updateParams.data;
		const providerEventId =
			value.update_scope === 'single' && value.instance_date
				? recurringInstanceEventId(value.event_id, value.instance_date)
				: value.event_id;
		const recurrence =
			value.recurrence === null
				? null
				: typeof value.recurrence === 'string'
					? [value.recurrence]
					: value.recurrence;
		const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
		const result = await service.updateEvent({
			userId: user.id,
			providerEventId,
			selector: {
				calendarSourceId: value.calendarSourceId,
				ontoEventId: value.ontoEventId,
				calendarId: value.calendar_id
			},
			requestBody: {
				start: value.start_time
					? {
							dateTime: new Date(value.start_time).toISOString(),
							timeZone: value.timeZone
						}
					: undefined,
				end: value.end_time
					? {
							dateTime: new Date(value.end_time).toISOString(),
							timeZone: value.timeZone
						}
					: undefined,
				summary: value.summary,
				description: value.description,
				location: value.location,
				attendees: value.attendees,
				recurrence
			},
			sendUpdates: value.sendUpdates
		});
		return ApiResponse.success({
			success: true,
			event_id: result.providerEventId,
			event_link: result.event.htmlLink ?? undefined,
			summary: result.event.summary ?? undefined,
			start: result.event.start ?? undefined,
			end: result.event.end ?? undefined,
			recurrence: result.event.recurrence ?? undefined,
			updated: result.event.updated ?? undefined,
			timeZone: value.timeZone,
			calendarSourceId: result.calendarSourceId,
			providerCalendarId: result.providerCalendarId
		});
	}
	const updateResult = await calendarService.updateCalendarEvent(user.id, params);
	return ApiResponse.success(updateResult);
}

export async function handleDeleteCalendarEvent({
	calendarService,
	multiCalendarEnabled,
	params,
	user
}: EventWriteHandlerDependencies): Promise<Response> {
	if (multiCalendarEnabled) {
		const deleteParams = deleteEventParamsSchema.safeParse(params);
		if (!deleteParams.success) {
			return ApiResponse.badRequest(
				'Invalid calendar event deletion',
				deleteParams.error.flatten()
			);
		}
		const value = deleteParams.data;
		const service = new GoogleCalendarWriteService(createAdminSupabaseClient());
		const result = await service.deleteEvent({
			userId: user.id,
			providerEventId: value.event_id,
			selector: {
				calendarSourceId: value.calendarSourceId,
				ontoEventId: value.ontoEventId,
				calendarId: value.calendar_id
			},
			sendUpdates: value.sendUpdates ?? (value.send_notifications ? 'all' : 'none')
		});
		return ApiResponse.success({
			success: true,
			event_id: result.providerEventId,
			message: result.alreadyMissing
				? 'Event already deleted or not found'
				: 'Calendar event deleted successfully',
			calendarSourceId: result.calendarSourceId,
			providerCalendarId: result.providerCalendarId
		});
	}
	const deleteResult = await calendarService.deleteCalendarEvent(user.id, params);
	return ApiResponse.success(deleteResult);
}
