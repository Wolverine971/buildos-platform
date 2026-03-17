// apps/web/src/routes/api/admin/retargeting/report/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const cohortId = url.searchParams.get('cohort_id')?.trim();
	if (!cohortId) {
		return ApiResponse.badRequest('cohort_id is required');
	}

	let errorLogger: ErrorLoggerService | null = null;
	try {
		const adminSupabase = createAdminSupabaseClient();
		errorLogger = ErrorLoggerService.getInstance(adminSupabase);
		const service = new RetargetingPilotService(adminSupabase);
		const payload = await service.getOutcomeReport({
			campaignId: url.searchParams.get('campaign_id')?.trim() || undefined,
			cohortId
		});

		return ApiResponse.success(payload);
	} catch (error) {
		await errorLogger?.logAPIError(error, '/api/admin/retargeting/report', 'GET', user.id, {
			campaignId: url.searchParams.get('campaign_id')?.trim() || null,
			cohortId
		});
		return ApiResponse.internalError(error, 'Failed to load retargeting report');
	}
};
