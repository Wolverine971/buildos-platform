// apps/web/src/routes/api/sms/metrics/alerts/+server.ts
import type { RequestHandler } from './$types';
import { smsAlertsService } from '@buildos/shared-utils';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * GET /api/sms/metrics/alerts
 *
 * Get SMS alert history
 *
 * Query params:
 * - type: 'unresolved' | 'history' (default: 'unresolved')
 * - limit: Number of alerts to return (default: 50, max: 200)
 * - start_date: Start date for history (YYYY-MM-DD, optional)
 * - end_date: End date for history (YYYY-MM-DD, optional)
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const session = await locals.safeGetSession();

		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		// Get query parameters
		const type = url.searchParams.get('type') || 'unresolved';
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(parseInt(limitParam), 200) : 50;
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		// Validate limit
		if (isNaN(limit) || limit < 1) {
			return ApiResponse.badRequest('Invalid limit parameter');
		}

		let alerts;

		if (type === 'unresolved') {
			// Get unresolved alerts
			alerts = await smsAlertsService.getUnresolvedAlerts(limit);

			return ApiResponse.success({
				data: alerts,
				type: 'unresolved',
				count: alerts.length
			});
		} else if (type === 'history') {
			// Get alert history
			if (!startDate) {
				return ApiResponse.badRequest('start_date is required for history type');
			}

			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(startDate) || (endDate && !dateRegex.test(endDate))) {
				return ApiResponse.badRequest('Invalid date format. Use YYYY-MM-DD');
			}

			alerts = await smsAlertsService.getAlertHistory(startDate, endDate || undefined, limit);

			return ApiResponse.success({
				data: alerts,
				type: 'history',
				count: alerts.length,
				date_range: {
					start: startDate,
					end: endDate || startDate
				}
			});
		} else {
			return ApiResponse.badRequest('Invalid type parameter. Must be unresolved or history');
		}
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching alerts:', error);
		return ApiResponse.internalError(error, 'Failed to fetch alerts');
	}
};

/**
 * POST /api/sms/metrics/alerts
 *
 * Resolve an alert
 *
 * Body:
 * - alert_id: Alert ID to resolve
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();

		if (!session?.user) {
			return ApiResponse.unauthorized();
		}

		const { alert_id } = await request.json();

		if (!alert_id) {
			return ApiResponse.badRequest('alert_id is required');
		}

		// Resolve the alert
		await smsAlertsService.resolveAlert(alert_id);

		return ApiResponse.success({ alert_id }, 'Alert resolved successfully');
	} catch (error: any) {
		console.error('[SMS Metrics API] Error resolving alert:', error);
		return ApiResponse.internalError(error, 'Failed to resolve alert');
	}
};
