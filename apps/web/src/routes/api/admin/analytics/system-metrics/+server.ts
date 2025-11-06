// apps/web/src/routes/api/admin/analytics/system-metrics/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getSystemMetrics } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const data = await getSystemMetrics(supabase);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching system metrics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch system metrics');
	}
};
