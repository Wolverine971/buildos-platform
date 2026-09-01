// apps/web/src/routes/api/time-blocks/blocks/[id]/suggestions/+server.ts
import type { RequestHandler } from './$types';
import { createTimeBlockRuntimeService } from '$lib/server/time-block-runtime.service';
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
		const timeBlockService = await createTimeBlockRuntimeService(supabase, user.id);

		const updatedBlock = await timeBlockService.regenerateSuggestions(blockId);

		return ApiResponse.success({ time_block: updatedBlock });
	} catch (error) {
		console.error('[TimeBlocks] Failed to regenerate suggestions:', error);
		return ApiResponse.internalError(error, 'Failed to regenerate block suggestions');
	}
};
