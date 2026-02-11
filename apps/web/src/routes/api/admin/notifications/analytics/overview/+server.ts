// apps/web/src/routes/api/admin/notifications/analytics/overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type Timeframe = '24h' | '7d' | '30d' | '90d';

function getTimeframeInterval(timeframe: Timeframe): string {
	const intervals = {
		'24h': '24 hours',
		'7d': '7 days',
		'30d': '30 days',
		'90d': '90 days'
	};
	return intervals[timeframe] || '7 days';
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const timeframe = (url.searchParams.get('timeframe') || '7d') as Timeframe;
		const interval = getTimeframeInterval(timeframe);

		// Get current period metrics
		const { data: currentMetrics, error: currentError } = await supabase.rpc(
			'get_notification_overview_metrics',
			{
				p_interval: interval
			}
		);

		if (currentError) {
			console.error('Error fetching current metrics:', currentError);
			return ApiResponse.databaseError(currentError);
		}

		// Get previous period metrics for trend calculation
		const { data: previousMetrics, error: previousError } = await supabase.rpc(
			'get_notification_overview_metrics',
			{
				p_interval: interval,
				p_offset: interval
			}
		);

		if (previousError) {
			console.error('Error fetching previous metrics:', previousError);
			// Continue with null trends if previous period fails
		}

		// Calculate trends
		const calculateTrend = (current: number, previous: number): number => {
			if (previous === 0) return current > 0 ? 100 : 0;
			return Number((((current - previous) / previous) * 100).toFixed(2));
		};

		const currentRow = currentMetrics?.[0];
		const previousRow = previousMetrics?.[0];

		const result = {
			total_sent: currentRow?.total_sent || 0,
			delivery_success_rate: currentRow?.delivery_success_rate || 0,
			avg_open_rate: currentRow?.avg_open_rate || 0,
			avg_click_rate: currentRow?.avg_click_rate || 0,
			trend_vs_previous_period: previousRow
				? {
						sent: calculateTrend(
							currentRow?.total_sent || 0,
							previousRow?.total_sent || 0
						),
						success_rate: calculateTrend(
							currentRow?.delivery_success_rate || 0,
							previousRow?.delivery_success_rate || 0
						),
						open_rate: calculateTrend(
							currentRow?.avg_open_rate || 0,
							previousRow?.avg_open_rate || 0
						),
						click_rate: calculateTrend(
							currentRow?.avg_click_rate || 0,
							previousRow?.avg_click_rate || 0
						)
					}
				: {
						sent: 0,
						success_rate: 0,
						open_rate: 0,
						click_rate: 0
					}
		};

		return ApiResponse.success(result);
	} catch (error) {
		console.error('Error fetching notification overview analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification overview analytics');
	}
};
