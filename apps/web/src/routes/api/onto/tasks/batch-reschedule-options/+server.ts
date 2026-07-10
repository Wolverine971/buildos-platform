// apps/web/src/routes/api/onto/tasks/batch-reschedule-options/+server.ts
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { OverdueTaskRescheduleService } from '$lib/services/overdue-task-reschedule.service';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

const batchRescheduleOptionsSchema = z
	.object({
		task_ids: z.array(z.string().min(1)).min(1).max(100),
		preset: z.enum(['today', 'tomorrow', 'plus3', 'nextWeek'])
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const parsed = await parseJsonRequest(request, batchRescheduleOptionsSchema);
		if (!parsed.ok) return parsed.response;

		const planner = new OverdueTaskRescheduleService(locals.supabase);
		const result = await planner.planBatchReschedule({
			userId: session.user.id,
			taskIds: parsed.data.task_ids,
			preset: parsed.data.preset
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[OverdueBatchReschedule] Failed to plan task slots:', error);
		if (
			error instanceof Error &&
			'status' in error &&
			typeof (error as { status?: unknown }).status === 'number'
		) {
			return ApiResponse.error(error.message, (error as { status: number }).status);
		}
		return ApiResponse.internalError(error, 'Failed to plan task slots');
	}
};
