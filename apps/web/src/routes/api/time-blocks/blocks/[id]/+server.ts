// apps/web/src/routes/api/time-blocks/blocks/[id]/+server.ts
import type { RequestHandler } from './$types';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import type { UpdateTimeBlockParams } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';

export const PATCH: RequestHandler = async ({
	params,
	request,
	locals: { safeGetSession, supabase }
}) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const blockId = params.id;
	if (!blockId) {
		return ApiResponse.badRequest('Missing time block id');
	}

	let body: UpdateTimeBlockParams;
	try {
		body = await request.json();
	} catch (error) {
		return ApiResponse.badRequest('Invalid request body');
	}

	// Parse dates if provided
	const updateParams: UpdateTimeBlockParams = {
		...body,
		start_time: body.start_time ? new Date(body.start_time) : undefined,
		end_time: body.end_time ? new Date(body.end_time) : undefined
	};

	try {
		const calendarService = new CalendarService(supabase);
		const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

		const updatedBlock = await timeBlockService.updateTimeBlock(blockId, updateParams);

		return ApiResponse.success({ time_block: updatedBlock });
	} catch (error) {
		console.error('[TimeBlocks] Failed to update time block:', error);
		return ApiResponse.internalError(error, 'Failed to update time block');
	}
};

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
