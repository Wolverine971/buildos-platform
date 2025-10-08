// apps/web/src/routes/api/sms/metrics/today/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceClient } from '@buildos/supabase-client';
import { smsMetricsService } from '../../../../../../worker/src/lib/services/smsMetrics.service';

/**
 * GET /api/sms/metrics/today
 *
 * Get today's SMS metrics snapshot (quick overview)
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		const session = await locals.safeGetSession();

		if (!session?.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Fetch today's metrics from materialized view
		const todayMetrics = await smsMetricsService.getTodayMetrics();

		if (!todayMetrics) {
			return json({
				success: true,
				data: null,
				message: 'No metrics available for today yet'
			});
		}

		// Calculate health indicators
		const deliveryHealthy = (todayMetrics.delivery_rate_percent || 0) >= 90;
		const llmHealthy = (todayMetrics.llm_success_rate_percent || 0) >= 50;

		return json({
			success: true,
			data: {
				...todayMetrics,
				health: {
					delivery_healthy: deliveryHealthy,
					llm_healthy: llmHealthy,
					overall_healthy: deliveryHealthy && llmHealthy
				}
			}
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching today metrics:', error);
		return json(
			{ error: 'Failed to fetch today metrics', message: error.message },
			{ status: 500 }
		);
	}
};
