// src/routes/api/projects/[id]/tasks/[taskId]/calendar-status/+server.ts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$utils/api-response';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const { taskId } = params;

		const { data: events, error } = await supabase
			.from('task_calendar_events')
			.select('id, calendar_event_id, sync_status, sync_error, last_synced_at')
			.eq('task_id', taskId)
			.eq('user_id', user.id);

		if (error) throw error;

		return ApiResponse.success({
			taskId,
			events: events || [],
			lastChecked: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error fetching calendar status:', error);
		return ApiResponse.databaseError('Failed to fetch calendar status');
	}
};
