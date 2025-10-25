// apps/web/src/routes/api/time-blocks/delete/[id]/+server.ts
import type { RequestHandler } from './$types';
import { TimeBlockService } from '$lib/services/time-block.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ApiResponse } from '$lib/utils/api-response';

export const DELETE: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const blockId = params.id;
	if (!blockId) {
		return ApiResponse.badRequest('Missing time block id');
	}

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		await timeBlockService.deleteTimeBlock(blockId);

		return ApiResponse.success(null, 'Time block deleted successfully');
	} catch (error) {
		console.error('[TimeBlocks] Failed to delete time block:', error);
		return ApiResponse.internalError(error, 'Failed to delete time block');
	}
};
