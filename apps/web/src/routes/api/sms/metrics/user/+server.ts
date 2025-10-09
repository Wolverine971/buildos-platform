// apps/web/src/routes/api/sms/metrics/user/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceClient } from '@buildos/supabase-client';
import { smsMetricsService } from '@buildos/shared-utils';

/**
 * GET /api/sms/metrics/user
 *
 * Get user-specific SMS metrics for a date range
 *
 * Query params:
 * - user_id: User ID (optional, defaults to current user)
 * - days: Number of days to look back (default: 30)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const session = await locals.safeGetSession();

		if (!session?.user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get query parameters
		const userId = url.searchParams.get('user_id') || session.user.id;
		const daysParam = url.searchParams.get('days');
		const days = daysParam ? parseInt(daysParam) : 30;

		// Validate days parameter
		if (isNaN(days) || days < 1 || days > 365) {
			return json(
				{ error: 'Invalid days parameter. Must be between 1 and 365' },
				{ status: 400 }
			);
		}

		// Only allow users to view their own metrics (unless admin)
		// TODO: Add admin check if needed
		if (userId !== session.user.id) {
			return json({ error: 'Forbidden - can only view own metrics' }, { status: 403 });
		}

		// Fetch user metrics
		const metrics = await smsMetricsService.getUserMetrics(userId, days);

		// Calculate aggregate statistics
		const totalScheduled = metrics.reduce((sum, m) => sum + (m.scheduled_count || 0), 0);
		const totalSent = metrics.reduce((sum, m) => sum + (m.sent_count || 0), 0);
		const totalDelivered = metrics.reduce((sum, m) => sum + (m.delivered_count || 0), 0);
		const totalFailed = metrics.reduce((sum, m) => sum + (m.failed_count || 0), 0);
		const totalCost = metrics.reduce((sum, m) => sum + (m.llm_cost_usd || 0), 0);

		const deliveryRate =
			totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(2) : '0.00';

		return json({
			success: true,
			data: {
				metrics,
				summary: {
					total_scheduled: totalScheduled,
					total_sent: totalSent,
					total_delivered: totalDelivered,
					total_failed: totalFailed,
					delivery_rate_percent: parseFloat(deliveryRate),
					total_llm_cost_usd: totalCost.toFixed(4),
					days
				}
			},
			user_id: userId
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching user metrics:', error);
		return json(
			{ error: 'Failed to fetch user metrics', message: error.message },
			{ status: 500 }
		);
	}
};
