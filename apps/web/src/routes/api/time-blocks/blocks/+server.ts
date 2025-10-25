// apps/web/src/routes/api/time-blocks/blocks/+server.ts
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const startDateParam = url.searchParams.get('start_date');
	const endDateParam = url.searchParams.get('end_date');

	if (!startDateParam || !endDateParam) {
		return ApiResponse.badRequest('Missing required query parameters: start_date, end_date');
	}

	const startDate = new Date(startDateParam);
	const endDate = new Date(endDateParam);

	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
		return ApiResponse.badRequest('Invalid date range supplied');
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const blocks = await timeBlockService.getTimeBlocks(startDate, endDate);

		return ApiResponse.success({ blocks });
	} catch (error) {
		console.error('[TimeBlocks] Failed to fetch time blocks:', error);
		return ApiResponse.internalError(error, 'Failed to fetch time blocks');
	}
};
