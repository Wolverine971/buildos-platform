// apps/web/src/routes/api/calendar/events/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const timeMin = url.searchParams.get('timeMin');
		const timeMax = url.searchParams.get('timeMax');
		const calendarId = url.searchParams.get('calendarId') || undefined;
		const maxResults = url.searchParams.get('maxResults') || undefined;

		const calendarService = new CalendarService(supabase);

		const result = await calendarService.getCalendarEvents(user.id, {
			timeMin: timeMin || undefined,
			timeMax: timeMax || undefined,
			calendarId,
			maxResults: maxResults ? parseInt(maxResults) : 200
		});

		return json(result);
	} catch (err) {
		console.error('Error fetching calendar events:', err);
		throw error(500, 'Failed to fetch calendar events');
	}
};
