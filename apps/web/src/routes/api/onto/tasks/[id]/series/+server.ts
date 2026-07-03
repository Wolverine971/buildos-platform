// apps/web/src/routes/api/onto/tasks/[id]/series/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { enableTaskSeries } from '$lib/services/task-series.service';
import { logOntologyApiError } from '../../../shared/error-logging';
import { parseJsonRequest } from '$lib/utils/request-validation';

const taskSeriesSchema = z
	.object({
		rrule: z.string().min(1),
		timezone: z.string().min(1),
		start_at: z.string().nullable().optional(),
		max_instances: z.number().int().positive().optional(),
		regenerate_on_update: z.boolean().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	try {
		const parsed = await parseJsonRequest(request, taskSeriesSchema);
		if (!parsed.ok) return parsed.response;
		const { rrule, timezone, start_at, max_instances, regenerate_on_update } = parsed.data;

		if (!rrule || typeof rrule !== 'string') {
			return ApiResponse.error('RRULE is required', 400);
		}

		if (!timezone || typeof timezone !== 'string') {
			return ApiResponse.error('Timezone is required', 400);
		}

		const result = await enableTaskSeries(locals.supabase, params.id, {
			rrule,
			timezone,
			start_at: start_at ?? undefined,
			max_instances,
			regenerate_on_update
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[task-series] Failed to enable recurrence', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tasks/${params.id}/series`,
			method: 'POST',
			userId: session.user.id,
			entityType: 'task_series',
			entityId: params.id,
			operation: 'task_series_create'
		});
		const message = error instanceof Error ? error.message : 'Failed to enable recurrence';
		return ApiResponse.error(message, 400);
	}
};
