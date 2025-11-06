// apps/web/src/routes/api/admin/analytics/brief-stats/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getBriefGenerationStats,
	type AnalyticsTimeframe
} from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';

	try {
		const data = await getBriefGenerationStats(supabase, timeframe);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching brief stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief stats');
	}
};
