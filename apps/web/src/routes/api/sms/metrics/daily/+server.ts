// apps/web/src/routes/api/sms/metrics/daily/+server.ts
import type { RequestHandler } from './$types';
import { smsMetricsService } from '@buildos/shared-utils';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/sms/metrics/daily
 *
 * Get daily aggregated SMS metrics for a date range
 *
 * Query params:
 * - start_date: Start date (YYYY-MM-DD)
 * - end_date: End date (YYYY-MM-DD, optional, defaults to start_date)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
		try {
			const session = await locals.safeGetSession();

			if (!session?.user) {
				return ApiResponse.unauthorized();
			}
			if (!session.user.is_admin) {
				return ApiResponse.forbidden('Admin access required');
			}

		// Get query parameters
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		if (!startDate) {
			return ApiResponse.badRequest('start_date parameter is required');
		}

		// Validate date format (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(startDate) || (endDate && !dateRegex.test(endDate))) {
			return ApiResponse.badRequest('Invalid date format. Use YYYY-MM-DD');
		}

		// Fetch daily metrics
		const metrics = await smsMetricsService.getDailyMetrics(startDate, endDate || undefined);

		return ApiResponse.success({
			data: metrics,
			date_range: {
				start: startDate,
				end: endDate || startDate
			}
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching daily metrics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily metrics');
	}
};
