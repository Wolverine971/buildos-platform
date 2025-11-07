// apps/web/src/routes/api/onto/task-series/[seriesId]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { deleteTaskSeries } from '$lib/services/task-series.service';

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	try {
		const force = url.searchParams.get('force') === 'true';
		const data = await deleteTaskSeries(locals.supabase, params.seriesId, { force });
		return ApiResponse.success({
			deleted_master: data?.deleted_master ?? 0,
			deleted_instances: data?.deleted_instances ?? 0
		});
	} catch (error) {
		console.error('[task-series] Failed to delete series', error);
		const message = error instanceof Error ? error.message : 'Failed to delete series';
		return ApiResponse.error(message, 400);
	}
};
