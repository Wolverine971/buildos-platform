// apps/web/src/routes/api/admin/analytics/daily-users/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getDailyActiveUsers,
	type AnalyticsTimeframe
} from '$lib/services/admin/dashboard-analytics.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframeParam = url.searchParams.get('timeframe') as AnalyticsTimeframe | null;
	const timeframe: AnalyticsTimeframe =
		timeframeParam === '7d' || timeframeParam === '90d' ? timeframeParam : '30d';

	try {
		const data = await getDailyActiveUsers(createAdminSupabaseClient(), timeframe);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching daily users analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily users analytics');
	}
};
