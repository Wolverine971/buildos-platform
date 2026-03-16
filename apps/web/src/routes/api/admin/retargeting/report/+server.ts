// apps/web/src/routes/api/admin/retargeting/report/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
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

	try {
		const service = new RetargetingPilotService(createAdminSupabaseClient());
		const payload = await service.getOutcomeReport({
			campaignId: url.searchParams.get('campaign_id')?.trim() || undefined,
			cohortId
		});

		return ApiResponse.success(payload);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load retargeting report');
	}
};
