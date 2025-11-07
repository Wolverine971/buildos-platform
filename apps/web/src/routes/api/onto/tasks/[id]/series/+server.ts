// apps/web/src/routes/api/onto/tasks/[id]/series/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { enableTaskSeries } from '$lib/services/task-series.service';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	try {
		const body = await request.json();
		const { rrule, timezone, start_at, max_instances, regenerate_on_update } = body ?? {};

		if (!rrule || typeof rrule !== 'string') {
			return ApiResponse.error('RRULE is required', 400);
		}

		if (!timezone || typeof timezone !== 'string') {
			return ApiResponse.error('Timezone is required', 400);
		}

		const result = await enableTaskSeries(locals.supabase, params.id, {
			rrule,
			timezone,
			start_at,
			max_instances,
			regenerate_on_update
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[task-series] Failed to enable recurrence', error);
		const message = error instanceof Error ? error.message : 'Failed to enable recurrence';
		return ApiResponse.error(message, 400);
	}
};
