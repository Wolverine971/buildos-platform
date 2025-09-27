// src/routes/api/admin/analytics/brief-stats/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = url.searchParams.get('timeframe') || '30d';
	const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;

	try {
		const endDate = new Date();
		const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

		const { data, error } = await supabase.rpc('get_brief_generation_stats', {
			start_date: startDate.toISOString().split('T')[0],
			end_date: endDate.toISOString().split('T')[0]
		});

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success(data || []);
	} catch (error) {
		console.error('Error fetching brief stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief stats');
	}
};
