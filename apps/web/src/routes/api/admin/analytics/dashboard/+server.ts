// apps/web/src/routes/api/admin/analytics/dashboard/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDashboardAnalytics,
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
		const data = await getDashboardAnalytics(supabase, timeframe);
		return ApiResponse.success(data);
	} catch (err) {
		console.error('[Admin Analytics] Failed to build dashboard payload:', err);
		return ApiResponse.internalError(err, 'Failed to load analytics dashboard data');
	}
};
