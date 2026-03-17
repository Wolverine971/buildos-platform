// apps/web/src/routes/api/admin/retargeting/send/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getRetargetingValidationMessage } from '$lib/server/retargeting-pilot.errors';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { RETARGETING_STEPS } from '$lib/server/retargeting-pilot.logic';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return ApiResponse.badRequest('Invalid request body');
	}

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const cohortId = typeof body?.cohort_id === 'string' ? body.cohort_id.trim() : '';
		const step = typeof body?.step === 'string' ? body.step.trim() : '';
		const batchId = typeof body?.batch_id === 'string' ? body.batch_id.trim() : '';

		if (!cohortId) {
			return ApiResponse.badRequest('cohort_id is required');
		}

		if (!batchId) {
			return ApiResponse.badRequest('batch_id is required');
		}

		if (!RETARGETING_STEPS.includes(step as (typeof RETARGETING_STEPS)[number])) {
			return ApiResponse.badRequest('step must be touch_1, touch_2, or touch_3');
		}

		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.sendStep({
			campaignId: typeof body?.campaign_id === 'string' ? body.campaign_id.trim() : undefined,
			cohortId,
			step: step as (typeof RETARGETING_STEPS)[number],
			sentByUserId: user.id,
			batchId,
			variant: typeof body?.variant === 'string' ? body.variant.trim() : undefined,
			demoUrl: typeof body?.demo_url === 'string' ? body.demo_url.trim() : undefined,
			dryRun: body?.dry_run === true
		});

		return ApiResponse.success(payload);
	} catch (error) {
		const validationMessage = getRetargetingValidationMessage(error);
		if (validationMessage) {
			return ApiResponse.badRequest(validationMessage);
		}

		await errorLogger?.logAPIError(error, '/api/admin/retargeting/send', 'POST', user.id, {
			campaignId: typeof body?.campaign_id === 'string' ? body.campaign_id.trim() : null,
			cohortId: typeof body?.cohort_id === 'string' ? body.cohort_id.trim() : null,
			batchId: typeof body?.batch_id === 'string' ? body.batch_id.trim() : null,
			step: typeof body?.step === 'string' ? body.step.trim() : null,
			dryRun: body?.dry_run === true
		});
		return ApiResponse.internalError(error, 'Failed to send retargeting step');
	}
};
