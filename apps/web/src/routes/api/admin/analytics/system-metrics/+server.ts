// apps/web/src/routes/api/admin/analytics/system-metrics/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { data, error } = await supabase
			.from('system_metrics')
			.select('*')
			.order('recorded_at', { ascending: false })
			.limit(10);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success(data || []);
	} catch (error) {
		console.error('Error fetching system metrics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch system metrics');
	}
};
