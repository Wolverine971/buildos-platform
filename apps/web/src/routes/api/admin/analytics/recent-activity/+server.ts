// apps/web/src/routes/api/admin/analytics/recent-activity/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getRecentActivity } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const data = await getRecentActivity(supabase);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching recent activity:', error);
		return ApiResponse.internalError(error, 'Failed to fetch recent activity');
	}
};
