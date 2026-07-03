// apps/web/src/routes/api/admin/retargeting/send/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getRetargetingValidationMessage } from '$lib/server/retargeting-pilot.errors';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { RETARGETING_STEPS } from '$lib/server/retargeting-pilot.logic';
import { parseJsonRequest } from '$lib/utils/request-validation';

const retargetingSendSchema = z
	.object({
		campaign_id: z.string().optional(),
		cohort_id: z.string().min(1),
		step: z.string().optional(),
		batch_id: z.string().optional(),
		member_ids: z.array(z.string()).optional().default([]),
		trigger_mode: z.enum(['send_now', 'schedule']).optional(),
		schedule_mode: z.enum(['custom_minimum', 'flow_cadence']).optional(),
		scheduled_for: z.string().nullable().optional(),
		variant: z.string().optional(),
		demo_url: z.string().optional(),
		dry_run: z.boolean().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const parsed = await parseJsonRequest(request, retargetingSendSchema);
	if (!parsed.ok) return parsed.response;
	const body = parsed.data;

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const cohortId = body.cohort_id.trim();
		const step = body.step?.trim() ?? '';
		const batchId = body.batch_id?.trim() ?? '';
		const memberIds = body.member_ids;

		if (!cohortId) {
			return ApiResponse.badRequest('cohort_id is required');
		}

		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const service = new RetargetingPilotService(adminSupabase);
		const campaignId = body.campaign_id?.trim() || undefined;
		const variant = body.variant?.trim() || undefined;
		const demoUrl = body.demo_url?.trim() || undefined;

		const payload =
			memberIds.length > 0
				? await service.triggerSelectedMembers({
						campaignId,
						cohortId,
						batchId: batchId || null,
						memberIds,
						triggerMode: body.trigger_mode === 'send_now' ? 'send_now' : 'schedule',
						scheduleMode:
							body.schedule_mode === 'custom_minimum'
								? 'custom_minimum'
								: 'flow_cadence',
						scheduledFor: body.scheduled_for?.trim() || null,
						sentByUserId: user.id,
						variant,
						demoUrl,
						dryRun: body.dry_run === true
					})
				: await (async () => {
						if (!batchId) {
							return ApiResponse.badRequest('batch_id is required');
						}

						if (
							!RETARGETING_STEPS.includes(step as (typeof RETARGETING_STEPS)[number])
						) {
							return ApiResponse.badRequest(
								'step must be touch_1, touch_2, or touch_3'
							);
						}

						return service.sendStep({
							campaignId,
							cohortId,
							step: step as (typeof RETARGETING_STEPS)[number],
							sentByUserId: user.id,
							batchId,
							variant,
							demoUrl,
							dryRun: body.dry_run === true
						});
					})();

		if (payload instanceof Response) {
			return payload;
		}

		return ApiResponse.success(payload);
	} catch (error) {
		const validationMessage = getRetargetingValidationMessage(error);
		if (validationMessage) {
			return ApiResponse.badRequest(validationMessage);
		}

		await errorLogger?.logAPIError(error, '/api/admin/retargeting/send', 'POST', user.id, {
			campaignId: body.campaign_id?.trim() || null,
			cohortId: body.cohort_id.trim() || null,
			batchId: body.batch_id?.trim() || null,
			step: body.step?.trim() || null,
			dryRun: body.dry_run === true
		});
		return ApiResponse.internalError(error, 'Failed to send retargeting step');
	}
};
