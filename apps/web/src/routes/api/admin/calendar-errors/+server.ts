// apps/web/src/routes/api/admin/calendar-errors/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { CalendarErrorMonitor } from '$lib/utils/calendar-error-monitor';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}
		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const monitor = new CalendarErrorMonitor(supabase);

		// Get query parameters
		const timeRange = (url.searchParams.get('timeRange') as 'day' | 'week' | 'month') || 'week';
		const taskId = url.searchParams.get('taskId');
		const userId = url.searchParams.get('userId');
		const action = url.searchParams.get('action');

		let result;

		switch (action) {
			case 'task-errors':
				if (!taskId) {
					return ApiResponse.badRequest('Task ID required');
				}
				result = await monitor.getTaskCalendarErrors(taskId);
				break;

			case 'user-errors':
				const targetUserId = userId || user.id;
				result = await monitor.getUserCalendarErrors(targetUserId);
				break;

			case 'patterns':
				result = await monitor.getCommonErrorPatterns();
				break;

			case 'check-recent':
				const targetUser = userId || user.id;
				const hasErrors = await monitor.hasRecentCalendarErrors(targetUser);
				result = { hasRecentErrors: hasErrors };
				break;

			default:
				// Default: get summary
				result = await monitor.getCalendarErrorSummary(timeRange);
				break;
		}

		return ApiResponse.success({
			data: result,
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error fetching calendar errors:', error);
		return ApiResponse.internalError(error);
	}
};
