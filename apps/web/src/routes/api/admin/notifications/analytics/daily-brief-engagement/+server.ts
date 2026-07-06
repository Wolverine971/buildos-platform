// apps/web/src/routes/api/admin/notifications/analytics/daily-brief-engagement/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

type Timeframe = '24h' | '7d' | '30d' | '90d';

const TIMEFRAME_DAYS: Record<Timeframe, number> = {
	'24h': 1,
	'7d': 7,
	'30d': 30,
	'90d': 90
};

function getSinceDate(timeframe: Timeframe): string {
	const days = TIMEFRAME_DAYS[timeframe] ?? TIMEFRAME_DAYS['30d'];
	const since = new Date();
	since.setUTCDate(since.getUTCDate() - days);
	return since.toISOString().slice(0, 10);
}

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const timeframe = (url.searchParams.get('timeframe') || '30d') as Timeframe;
		const sinceDate = getSinceDate(timeframe);

		// The metrics view is granted to service_role only (company-wide data);
		// admin access is enforced above, so read it with the admin client.
		const adminSupabase = createAdminSupabaseClient();
		const { data, error } = await (adminSupabase as any)
			.from('daily_brief_engagement_weekly_metrics')
			.select(
				'week_start, engagement_stage, sends, opens, clicks, open_rate, click_rate, reactivated_7d, reactivation_rate_7d'
			)
			.gte('week_start', sinceDate)
			.order('week_start', { ascending: false })
			.order('engagement_stage', { ascending: true });

		if (error) {
			console.error('Error fetching daily brief engagement analytics:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			metrics: data ?? []
		});
	} catch (error) {
		console.error('Error fetching daily brief engagement analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily brief engagement analytics');
	}
};
