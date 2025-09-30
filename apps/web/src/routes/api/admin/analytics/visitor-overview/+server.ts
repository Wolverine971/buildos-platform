// apps/web/src/routes/api/admin/analytics/visitor-overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { data, error } = await supabase.rpc('get_visitor_overview');

		if (error) {
			return ApiResponse.databaseError(error);
		}

		// Return the first (and only) row of results
		const overview = data?.[0] || {
			total_visitors: 0,
			visitors_7d: 0,
			visitors_30d: 0,
			unique_visitors_today: 0
		};

		return ApiResponse.success({
			total_visitors: parseInt(overview.total_visitors) || 0,
			visitors_7d: parseInt(overview.visitors_7d) || 0,
			visitors_30d: parseInt(overview.visitors_30d) || 0,
			unique_visitors_today: parseInt(overview.unique_visitors_today) || 0
		});
	} catch (error) {
		console.error('Error fetching visitor overview:', error);
		return ApiResponse.internalError(error, 'Failed to fetch visitor overview');
	}
};
