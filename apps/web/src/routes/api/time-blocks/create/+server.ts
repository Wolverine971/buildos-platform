// apps/web/src/routes/api/time-blocks/create/+server.ts
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	let payload: any;
	try {
		payload = await request.json();
	} catch (err) {
		console.error('[TimeBlocks] Invalid JSON payload:', err);
		return ApiResponse.badRequest('Invalid JSON payload');
	}

	const { block_type, project_id, start_time, end_time, timezone } = payload ?? {};

	if (block_type !== 'project' && block_type !== 'build') {
		return ApiResponse.badRequest('Invalid block_type. Expected "project" or "build".');
	}

	if (block_type === 'project' && !project_id) {
		return ApiResponse.badRequest('project_id is required for project blocks.');
	}

	if (!start_time || !end_time) {
		return ApiResponse.badRequest('Missing required fields: start_time, end_time');
	}

	const startDate = new Date(start_time);
	const endDate = new Date(end_time);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return ApiResponse.badRequest('Invalid start_time or end_time.');
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const timeBlock = await timeBlockService.createTimeBlock({
			block_type,
			project_id: project_id ?? null,
			start_time: startDate,
			end_time: endDate,
			timezone
		});

		return ApiResponse.created({ time_block: timeBlock });
	} catch (error) {
		console.error('[TimeBlocks] Failed to create time block:', error);
		return ApiResponse.internalError(error, 'Failed to create time block');
	}
};
