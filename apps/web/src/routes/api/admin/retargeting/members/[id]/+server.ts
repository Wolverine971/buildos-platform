// apps/web/src/routes/api/admin/retargeting/members/[id]/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getRetargetingValidationMessage } from '$lib/server/retargeting-pilot.errors';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { RETARGETING_REPLY_STATUSES } from '$lib/server/retargeting-pilot.logic';
import type { RetargetingReplyStatus } from '$lib/server/retargeting-pilot.logic';
import { parseJsonRequest } from '$lib/utils/request-validation';

const retargetingMemberUpdateSchema = z
	.object({
		reply_status: z.string().optional(),
		manual_stop: z.boolean().optional(),
		manual_stop_reason: z.string().nullable().optional(),
		notes: z.string().nullable().optional()
	})
	.strict();

function isRetargetingReplyStatus(value: unknown): value is RetargetingReplyStatus {
	return (
		typeof value === 'string' &&
		RETARGETING_REPLY_STATUSES.includes(value as RetargetingReplyStatus)
	);
}

export const PATCH: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const parsed = await parseJsonRequest(request, retargetingMemberUpdateSchema);
	if (!parsed.ok) return parsed.response;
	const body = parsed.data;

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const replyStatus = body.reply_status;

		if (typeof replyStatus !== 'undefined' && !isRetargetingReplyStatus(replyStatus)) {
			return ApiResponse.badRequest('reply_status is invalid');
		}

		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.updateMember(params.id, {
			replyStatus,
			manualStop: body.manual_stop,
			manualStopReason: Object.prototype.hasOwnProperty.call(body, 'manual_stop_reason')
				? (body.manual_stop_reason ?? null)
				: undefined,
			notes: Object.prototype.hasOwnProperty.call(body, 'notes')
				? (body.notes ?? null)
				: undefined
		});

		return ApiResponse.success(payload);
	} catch (error) {
		const validationMessage = getRetargetingValidationMessage(error);
		if (validationMessage) {
			return ApiResponse.badRequest(validationMessage);
		}

		await errorLogger?.logAPIError(
			error,
			'/api/admin/retargeting/members/[id]',
			'PATCH',
			user.id,
			{
				memberId: params.id,
				replyStatus: body.reply_status ?? null
			}
		);
		return ApiResponse.internalError(error, 'Failed to update retargeting member');
	}
};
