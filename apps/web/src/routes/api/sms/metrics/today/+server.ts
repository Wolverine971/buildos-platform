// apps/web/src/routes/api/sms/metrics/today/+server.ts
import type { RequestHandler } from './$types';
import { smsMetricsService } from '@buildos/shared-utils';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/sms/metrics/today
 *
 * Get today's SMS metrics snapshot (quick overview)
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

		// Fetch today's metrics from materialized view
		const todayMetrics = await smsMetricsService.getTodayMetrics();

		if (!todayMetrics) {
			return ApiResponse.success(null, 'No metrics available for today yet');
		}

		// Calculate health indicators
		const deliveryHealthy = (todayMetrics.delivery_rate_percent || 0) >= 90;
		const llmHealthy = (todayMetrics.llm_success_rate_percent || 0) >= 50;

		return ApiResponse.success({
			...todayMetrics,
			health: {
				delivery_healthy: deliveryHealthy,
				llm_healthy: llmHealthy,
				overall_healthy: deliveryHealthy && llmHealthy
			}
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching today metrics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch today metrics');
	}
};
