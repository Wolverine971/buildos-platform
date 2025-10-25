// apps/web/src/routes/api/time-blocks/blocks/[id]/suggestions/+server.ts
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
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

		const updatedBlock = await timeBlockService.regenerateSuggestions(blockId);

		return ApiResponse.success({ time_block: updatedBlock });
	} catch (error) {
		console.error('[TimeBlocks] Failed to regenerate suggestions:', error);
		return ApiResponse.internalError(error, 'Failed to regenerate block suggestions');
	}
};
