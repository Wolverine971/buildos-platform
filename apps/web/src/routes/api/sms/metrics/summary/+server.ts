// apps/web/src/routes/api/sms/metrics/summary/+server.ts
import type { RequestHandler } from './$types';
import { smsMetricsService, smsAlertsService } from '@buildos/shared-utils';
import { format, subDays } from 'date-fns';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/sms/metrics/summary
 *
 * Get comprehensive SMS system summary for dashboard
 * Combines today's metrics, 7-day trends, and active alerts
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.safeGetSession();

		if (!session?.user) {
			return ApiResponse.unauthorized();
		}
		if (!session.user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const today = format(new Date(), 'yyyy-MM-dd');
		const sevenDaysAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

		// Fetch data in parallel
		const [todayMetrics, weekMetrics, unresolvedAlerts] = await Promise.all([
			smsMetricsService.getTodayMetrics(),
			smsMetricsService.getDailyMetrics(sevenDaysAgo, today),
			smsAlertsService.getUnresolvedAlerts(10)
		]);

		// Calculate 7-day trends
		const weeklyTotals = weekMetrics.reduce(
			(acc, day) => ({
				scheduled: acc.scheduled + (day.scheduled_count || 0),
				sent: acc.sent + (day.sent_count || 0),
				delivered: acc.delivered + (day.delivered_count || 0),
				failed: acc.failed + (day.failed_count || 0),
				cancelled: acc.cancelled + (day.cancelled_count || 0),
				llmCost: acc.llmCost + (day.llm_cost_usd || 0),
				llmSuccess: acc.llmSuccess + (day.llm_success_count || 0),
				templateFallback: acc.templateFallback + (day.template_fallback_count || 0)
			}),
			{
				scheduled: 0,
				sent: 0,
				delivered: 0,
				failed: 0,
				cancelled: 0,
				llmCost: 0,
				llmSuccess: 0,
				templateFallback: 0
			}
		);

		const weeklyDeliveryRate =
			weeklyTotals.sent > 0
				? ((weeklyTotals.delivered / weeklyTotals.sent) * 100).toFixed(2)
				: '0.00';

		const weeklyLLMSuccessRate =
			weeklyTotals.llmSuccess + weeklyTotals.templateFallback > 0
				? (
						(weeklyTotals.llmSuccess /
							(weeklyTotals.llmSuccess + weeklyTotals.templateFallback)) *
						100
					).toFixed(2)
				: '0.00';

		// Calculate health status
		const deliveryHealthy = parseFloat(weeklyDeliveryRate) >= 90;
		const llmHealthy = parseFloat(weeklyLLMSuccessRate) >= 50;
		const hasActiveCriticalAlerts = unresolvedAlerts.some(
			(alert) => alert.severity === 'critical'
		);

		return ApiResponse.success({
			today: todayMetrics || {
				scheduled_count: 0,
				sent_count: 0,
				delivered_count: 0,
				failed_count: 0,
				delivery_rate_percent: 0,
				llm_success_rate_percent: 0,
				active_users: 0
			},
			week: {
				totals: weeklyTotals,
				delivery_rate_percent: parseFloat(weeklyDeliveryRate),
				llm_success_rate_percent: parseFloat(weeklyLLMSuccessRate),
				avg_daily_cost_usd: (weeklyTotals.llmCost / 7).toFixed(4)
			},
			alerts: {
				unresolved_count: unresolvedAlerts.length,
				has_critical: hasActiveCriticalAlerts,
				recent: unresolvedAlerts.slice(0, 5) // Top 5 most recent
			},
			health: {
				delivery_healthy: deliveryHealthy,
				llm_healthy: llmHealthy,
				alerts_healthy: !hasActiveCriticalAlerts,
				overall_healthy: deliveryHealthy && llmHealthy && !hasActiveCriticalAlerts,
				status:
					deliveryHealthy && llmHealthy && !hasActiveCriticalAlerts
						? 'healthy'
						: hasActiveCriticalAlerts
							? 'critical'
							: 'degraded'
			},
			timestamp: new Date().toISOString()
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching summary:', error);
		return ApiResponse.internalError(error, 'Failed to fetch metrics summary');
	}
};
