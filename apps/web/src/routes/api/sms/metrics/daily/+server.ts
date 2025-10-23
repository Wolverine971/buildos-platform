// apps/web/src/routes/api/sms/metrics/daily/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { smsMetricsService } from '@buildos/shared-utils';

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
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get query parameters
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		if (!startDate) {
			return json({ error: 'start_date parameter is required' }, { status: 400 });
		}

		// Validate date format (YYYY-MM-DD)
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(startDate) || (endDate && !dateRegex.test(endDate))) {
			return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
		}

		// Fetch daily metrics
		const metrics = await smsMetricsService.getDailyMetrics(startDate, endDate || undefined);

		return json({
			success: true,
			data: metrics,
			date_range: {
				start: startDate,
				end: endDate || startDate
			}
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching daily metrics:', error);
		return json(
			{ error: 'Failed to fetch daily metrics', message: error.message },
			{ status: 500 }
		);
	}
};
