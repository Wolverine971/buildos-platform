// apps/web/src/routes/api/calendar/events/+server.ts
import { env as privateEnv } from '$env/dynamic/private';
import { z } from 'zod';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { googleCalendarRuntimeErrorResponse } from '$lib/server/google-calendar-api-errors';
import { isMultiCalendarUserAllowed } from '$lib/server/google-calendar-feature';
import { GoogleCalendarReadService } from '$lib/server/google-calendar-read.service';
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';

const calendarEventsQuerySchema = z
	.object({
		timeMin: z.string().datetime({ offset: true }).optional(),
		timeMax: z.string().datetime({ offset: true }).optional(),
		calendarId: z.string().min(1).max(1024).optional(),
		calendarSourceId: z.string().uuid().optional(),
		maxResults: z.coerce.number().int().min(1).max(500).optional(),
		q: z.string().max(500).optional(),
		timeZone: z.string().max(100).optional()
	})
	.strict()
	.refine(
		(value) =>
			!value.timeMin ||
			!value.timeMax ||
			Date.parse(value.timeMin) < Date.parse(value.timeMax),
		{ message: 'timeMin must be earlier than timeMax' }
	);

export const GET: RequestHandler = async ({ url, locals }) => {
	const authResult = await requireAuth(locals);
	if ('error' in authResult && authResult.error) {
		return authResult.error;
	}
	const { user } = authResult;

	try {
		const parsed = calendarEventsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			return ApiResponse.badRequest('Invalid calendar event query', parsed.error.flatten());
		}
		const params = parsed.data;

		if (isMultiCalendarUserAllowed(user.id, privateEnv)) {
			const service = new GoogleCalendarReadService(createAdminSupabaseClient());
			return ApiResponse.success(
				await service.listEvents({ userId: user.id, ...params }),
				undefined,
				{ public: false, maxAge: 0, mustRevalidate: true }
			);
		}

		const calendarService = new CalendarService(locals.supabase);

		const result = await calendarService.getCalendarEvents(user.id, {
			timeMin: params.timeMin,
			timeMax: params.timeMax,
			calendarId: params.calendarId,
			maxResults: params.maxResults ?? 200,
			q: params.q,
			timeZone: params.timeZone
		});

		return ApiResponse.success(result);
	} catch (err) {
		console.error('Error fetching calendar events:', err);
		const runtimeResponse = googleCalendarRuntimeErrorResponse(err);
		if (runtimeResponse) return runtimeResponse;
		return ApiResponse.internalError(err, 'Failed to fetch calendar events');
	}
};
