// apps/web/src/routes/api/time-blocks/generate-suggestions/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { CalendarService } from '$lib/services/calendar-service';
import { TimeBlockService } from '$lib/services/time-block.service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const generateTimeBlockSuggestionsSchema = z
	.object({
		time_block_id: z.string().min(1)
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseJsonRequest(request, generateTimeBlockSuggestionsSchema);
	if (!parsed.ok) return parsed.response;
	const payload = parsed.data;

	const timeBlockId = payload?.time_block_id;

	if (typeof timeBlockId !== 'string' || timeBlockId.trim().length === 0) {
		return ApiResponse.badRequest('time_block_id is required');
	}

	const calendarService = new CalendarService(supabase);
	const timeBlockService = new TimeBlockService(supabase, user.id, calendarService);

	try {
		const timeBlock = await timeBlockService.generateSuggestionsForTimeBlock(timeBlockId);

		return ApiResponse.success({ time_block: timeBlock });
	} catch (error) {
		const message =
			error instanceof Error ? error.message : 'Failed to generate time-block suggestions';

		if (message === 'Time block not found') {
			return ApiResponse.notFound('Time block');
		}

		if (message === 'Cannot generate suggestions for deleted blocks') {
			return ApiResponse.badRequest(message);
		}

		return ApiResponse.internalError(error, message);
	}
};
