// apps/web/src/routes/api/admin/retargeting/members/[id]/activity/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';

export const GET: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const memberId = params.id?.trim();
	if (!memberId) {
		return ApiResponse.badRequest('member id is required');
	}

	const adminSupabase = createAdminSupabaseClient();
	const errorLogger = ErrorLoggerService.getInstance(adminSupabase);

	try {
		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.getReactivationActivity(memberId);
		return ApiResponse.success(payload);
	} catch (error) {
		await errorLogger.logAPIError(
			error,
			`/api/admin/retargeting/members/${memberId}/activity`,
			'GET',
			user.id,
			{ memberId }
		);
		return ApiResponse.internalError(error, 'Failed to load reactivation activity');
	}
};
