// apps/web/src/routes/api/onto/tasks/[id]/reschedule-options/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OverdueTaskRescheduleService } from '$lib/services/overdue-task-reschedule.service';
import type { OverdueReschedulePreset } from '$lib/utils/overdue-reschedule';

const VALID_PRESETS: OverdueReschedulePreset[] = ['today', 'tomorrow', 'plus3', 'nextWeek'];

function isPreset(value: unknown): value is OverdueReschedulePreset {
	return typeof value === 'string' && VALID_PRESETS.includes(value as OverdueReschedulePreset);
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	try {
		const body = (await request.json()) as {
			preset?: OverdueReschedulePreset;
			limit?: number;
		};
		if (!isPreset(body?.preset)) {
			return ApiResponse.badRequest(
				'preset must be one of: today, tomorrow, plus3, nextWeek'
			);
		}

		const planner = new OverdueTaskRescheduleService(locals.supabase);
		const result = await planner.planReschedule({
			userId: session.user.id,
			taskId: params.id,
			preset: body.preset,
			limit:
				typeof body.limit === 'number' && Number.isFinite(body.limit)
					? Math.max(1, Math.min(body.limit, 10))
					: 5
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[OverdueReschedule] Failed to load slot options:', error);
		if (
			error instanceof Error &&
			'status' in error &&
			typeof (error as { status?: unknown }).status === 'number'
		) {
			return ApiResponse.error(error.message, (error as { status: number }).status);
		}
		return ApiResponse.internalError(error, 'Failed to load reschedule options');
	}
};
