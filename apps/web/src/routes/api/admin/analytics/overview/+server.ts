// apps/web/src/routes/api/admin/analytics/overview/+server.ts
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
		const { data, error } = await supabase.rpc('get_user_engagement_metrics');

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching overview analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch overview analytics');
	}
};
