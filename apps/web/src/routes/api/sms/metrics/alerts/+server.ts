// apps/web/src/routes/api/sms/metrics/alerts/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceClient } from '@buildos/supabase-client';
import { smsAlertsService } from '../../../../../../worker/src/lib/services/smsAlerts.service';

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
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get query parameters
		const type = url.searchParams.get('type') || 'unresolved';
		const limitParam = url.searchParams.get('limit');
		const limit = limitParam ? Math.min(parseInt(limitParam), 200) : 50;
		const startDate = url.searchParams.get('start_date');
		const endDate = url.searchParams.get('end_date');

		// Validate limit
		if (isNaN(limit) || limit < 1) {
			return json({ error: 'Invalid limit parameter' }, { status: 400 });
		}

		let alerts;

		if (type === 'unresolved') {
			// Get unresolved alerts
			alerts = await smsAlertsService.getUnresolvedAlerts(limit);

			return json({
				success: true,
				data: alerts,
				type: 'unresolved',
				count: alerts.length
			});
		} else if (type === 'history') {
			// Get alert history
			if (!startDate) {
				return json(
					{ error: 'start_date is required for history type' },
					{ status: 400 }
				);
			}

			// Validate date format
			const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
			if (!dateRegex.test(startDate) || (endDate && !dateRegex.test(endDate))) {
				return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
			}

			alerts = await smsAlertsService.getAlertHistory(startDate, endDate || undefined, limit);

			return json({
				success: true,
				data: alerts,
				type: 'history',
				count: alerts.length,
				date_range: {
					start: startDate,
					end: endDate || startDate
				}
			});
		} else {
			return json({ error: 'Invalid type parameter. Must be unresolved or history' }, { status: 400 });
		}
	} catch (error: any) {
		console.error('[SMS Metrics API] Error fetching alerts:', error);
		return json({ error: 'Failed to fetch alerts', message: error.message }, { status: 500 });
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
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { alert_id } = await request.json();

		if (!alert_id) {
			return json({ error: 'alert_id is required' }, { status: 400 });
		}

		// Resolve the alert
		await smsAlertsService.resolveAlert(alert_id);

		return json({
			success: true,
			message: 'Alert resolved successfully',
			alert_id
		});
	} catch (error: any) {
		console.error('[SMS Metrics API] Error resolving alert:', error);
		return json({ error: 'Failed to resolve alert', message: error.message }, { status: 500 });
	}
};
