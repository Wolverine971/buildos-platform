// src/routes/api/admin/analytics/daily-visitors/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = url.searchParams.get('timeframe') || '30d';
	const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;

	try {
		const endDate = new Date();
		const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

		const { data, error } = await supabase.rpc('get_daily_visitors', {
			start_date: startDate.toISOString().split('T')[0],
			end_date: endDate.toISOString().split('T')[0]
		});

		if (error) {
			return ApiResponse.databaseError(error);
		}

		const transformedData = (data || []).map((row: any) => ({
			date: row.date,
			visitor_count: parseInt(row.visitor_count) || 0
		}));

		return ApiResponse.success(transformedData);
	} catch (error) {
		console.error('Error fetching daily visitors analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily visitors analytics');
	}
};
