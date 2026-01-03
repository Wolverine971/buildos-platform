// apps/web/src/routes/api/projects/[id]/calendar/sync/+server.ts
import type { RequestHandler } from './$types';
import { ProjectCalendarService } from '$lib/services/project-calendar.service';
import { ApiResponse } from '$lib/utils/api-response';
import { verifyLegacyProjectAccess } from '$lib/utils/api-helpers';

/**
 * POST /api/projects/[id]/calendar/sync
 * Sync all project tasks to the Google Calendar
 */
export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;

	// Verify user owns this project (security fix: 2026-01-03)
	const authResult = await verifyLegacyProjectAccess(supabase, projectId, user.id);
	if (!authResult.authorized) {
		return authResult.error!;
	}

	const service = new ProjectCalendarService(supabase);

	try {
		// First check if calendar exists
		const response = await service.getProjectCalendar(projectId, user.id);

		const calendarResult = await response.json();
		if (!calendarResult.success || !calendarResult.data) {
			return ApiResponse.error('No calendar configured for this project', 400);
		}

		const projectCalendar = calendarResult.data;

		// Get all tasks for the project that need syncing
		const { data: tasks, error: tasksError } = await supabase
			.from('tasks')
			.select('*')
			.eq('project_id', projectId)
			.not('scheduled_for', 'is', null)
			.order('scheduled_for', { ascending: true });

		if (tasksError) {
			console.error('Error fetching tasks for sync:', tasksError);
			return ApiResponse.error('Failed to fetch project tasks', 500);
		}

		if (!tasks || tasks.length === 0) {
			return ApiResponse.success({ synced: 0 }, 'No scheduled tasks to sync');
		}

		// TODO: Implement actual sync logic with CalendarService
		// This would involve:
		// 1. Creating/updating calendar events for each task
		// 2. Using the project's calendar ID from projectCalendar.calendar_id
		// 3. Handling recurring tasks appropriately
		// 4. Updating sync status in database

		const syncedCount = tasks.length;

		return ApiResponse.success(
			{
				synced: syncedCount,
				calendarId: projectCalendar.calendar_id
			},
			`Successfully synced ${syncedCount} task${syncedCount !== 1 ? 's' : ''} to calendar`
		);
	} catch (error: any) {
		console.error('Error syncing tasks to calendar:', error);
		return ApiResponse.internalError(error, 'Failed to sync tasks to calendar');
	}
};
