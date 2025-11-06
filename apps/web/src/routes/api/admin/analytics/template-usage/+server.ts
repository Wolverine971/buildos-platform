// apps/web/src/routes/api/admin/analytics/template-usage/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getTemplateUsageStats } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const stats = await getTemplateUsageStats(supabase);
		return ApiResponse.success(stats);
	} catch (error) {
		console.error('Error fetching template usage:', error);
		return ApiResponse.internalError(error, 'Failed to fetch template usage');
	}
};
