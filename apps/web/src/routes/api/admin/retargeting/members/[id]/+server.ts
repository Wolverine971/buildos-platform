// apps/web/src/routes/api/admin/retargeting/members/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';
import { RETARGETING_REPLY_STATUSES } from '$lib/server/retargeting-pilot.logic';

export const PATCH: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const body = await request.json();
		const replyStatus = body?.reply_status;

		if (
			typeof replyStatus !== 'undefined' &&
			!RETARGETING_REPLY_STATUSES.includes(replyStatus)
		) {
			return ApiResponse.badRequest('reply_status is invalid');
		}

		const service = new RetargetingPilotService(createAdminSupabaseClient());
		const payload = await service.updateMember(params.id, {
			replyStatus,
			manualStop: typeof body?.manual_stop === 'boolean' ? body.manual_stop : undefined,
			manualStopReason:
				typeof body?.manual_stop_reason === 'string' ? body.manual_stop_reason : undefined,
			notes: typeof body?.notes === 'string' ? body.notes : undefined
		});

		return ApiResponse.success(payload);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to update retargeting member');
	}
};
