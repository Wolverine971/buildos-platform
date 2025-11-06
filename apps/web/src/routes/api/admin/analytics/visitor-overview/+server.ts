// apps/web/src/routes/api/admin/analytics/visitor-overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getVisitorOverview } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const overview = await getVisitorOverview(supabase);
		return ApiResponse.success(overview);
	} catch (error) {
		console.error('Error fetching visitor overview:', error);
		return ApiResponse.internalError(error, 'Failed to fetch visitor overview');
	}
};
