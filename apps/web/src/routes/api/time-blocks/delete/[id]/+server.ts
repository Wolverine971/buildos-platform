// apps/web/src/routes/api/time-blocks/delete/[id]/+server.ts
import type { RequestHandler } from './$types';
import { createTimeBlockRuntimeService } from '$lib/server/time-block-runtime.service';
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
		const timeBlockService = await createTimeBlockRuntimeService(supabase, user.id);

		await timeBlockService.deleteTimeBlock(blockId);

		return ApiResponse.success(null, 'Time block deleted successfully');
	} catch (error) {
		console.error('[TimeBlocks] Failed to delete time block:', error);
		return ApiResponse.internalError(error, 'Failed to delete time block');
	}
};
