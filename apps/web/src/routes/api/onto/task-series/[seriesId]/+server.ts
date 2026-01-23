// apps/web/src/routes/api/onto/task-series/[seriesId]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { deleteTaskSeries } from '$lib/services/task-series.service';
import { logOntologyApiError } from '../../shared/error-logging';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export const DELETE: RequestHandler = async ({ params, url, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	try {
		const force = url.searchParams.get('force') === 'true';
		const data = await deleteTaskSeries(
			locals.supabase as unknown as TypedSupabaseClient,
			params.seriesId,
			{ force }
		);
		// RPC returns an array with one result object
		const result = Array.isArray(data) ? data[0] : data;
		return ApiResponse.success({
			deleted_master: result?.deleted_master ?? 0,
			deleted_instances: result?.deleted_instances ?? 0
		});
	} catch (error) {
		console.error('[task-series] Failed to delete series', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/task-series/${params.seriesId}`,
			method: 'DELETE',
			userId: session.user.id,
			entityType: 'task_series',
			entityId: params.seriesId,
			operation: 'task_series_delete'
		});
		const message = error instanceof Error ? error.message : 'Failed to delete series';
		return ApiResponse.error(message, 400);
	}
};
