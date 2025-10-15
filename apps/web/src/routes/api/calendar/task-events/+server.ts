// apps/web/src/routes/api/calendar/task-events/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/calendar/task-events
 *
 * Fetches calendar event IDs for scheduled tasks within a date range.
 * Used to correlate BuildOS tasks with Google Calendar events.
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const timeMin = url.searchParams.get('timeMin');
	const timeMax = url.searchParams.get('timeMax');

	if (!timeMin || !timeMax) {
		throw error(400, 'timeMin and timeMax query parameters are required');
	}

	try {
		// Query tasks directly and join with task_calendar_events
		const { data: tasks, error: fetchError } = await supabase
			.from('tasks')
			.select('id, task_calendar_events(*)')
			.eq('user_id', user.id)
			.gte('start_date', timeMin)
			.lte('start_date', timeMax);

		if (fetchError) {
			console.error('[API] Failed to fetch task calendar events:', fetchError);
			throw error(500, 'Failed to fetch task calendar events');
		}

		// Extract calendar event IDs from the nested structure
		const calendarEventIds: string[] = [];
		for (const task of tasks || []) {
			if (Array.isArray(task.task_calendar_events)) {
				for (const tce of task.task_calendar_events) {
					if (tce.calendar_event_id) {
						calendarEventIds.push(tce.calendar_event_id);
					}
				}
			}
		}

		return json({
			success: true,
			data: {
				calendar_event_ids: calendarEventIds
			}
		});
	} catch (err) {
		console.error('[API] Error in task-events endpoint:', err);
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		throw error(500, 'Internal server error');
	}
};
