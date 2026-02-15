// apps/web/src/routes/api/calendar/events/+server.ts
import { ApiResponse, requireAuth } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';

export const GET: RequestHandler = async ({ url, locals }) => {
	const authResult = await requireAuth(locals);
	if ('error' in authResult && authResult.error) {
		return authResult.error;
	}
	const { user } = authResult;

	try {
		const timeMin = url.searchParams.get('timeMin');
		const timeMax = url.searchParams.get('timeMax');
		const calendarId = url.searchParams.get('calendarId') || undefined;
		const maxResults = url.searchParams.get('maxResults') || undefined;

		const calendarService = new CalendarService(locals.supabase);

		const result = await calendarService.getCalendarEvents(user.id, {
			timeMin: timeMin || undefined,
			timeMax: timeMax || undefined,
			calendarId,
			maxResults: maxResults ? parseInt(maxResults) : 200
		});

		return ApiResponse.success(result);
	} catch (err) {
		console.error('Error fetching calendar events:', err);
		return ApiResponse.internalError(err, 'Failed to fetch calendar events');
	}
};
