// apps/web/src/routes/api/notification-tracking/click/[delivery_id]/+server.ts

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * Track notification click
 *
 * Records when a user clicks on a notification (any channel: push, email, SMS, in-app)
 * Updates notification_deliveries.clicked_at timestamp
 *
 * Also sets opened_at if not already set (click implies open)
 */
export const POST: RequestHandler = async ({ params, request, locals: { supabase } }) => {
	try {
		const delivery_id = params.delivery_id;

		if (!delivery_id) {
			return ApiResponse.badRequest('delivery_id is required');
		}

		console.log(`[NotificationTracking] Click tracking for delivery: ${delivery_id}`);

		// Get current delivery record
		const { data: delivery, error: fetchError } = await supabase
			.from('notification_deliveries')
			.select('id, clicked_at, opened_at, status, channel')
			.eq('id', delivery_id)
			.single();

		if (fetchError || !delivery) {
			console.error(`[NotificationTracking] Delivery not found: ${delivery_id}`, fetchError);
			return ApiResponse.notFound('Delivery');
		}

		const now = new Date().toISOString();
		const isFirstClick = !delivery.clicked_at;
		const isFirstOpen = !delivery.opened_at;

		// Build update object
		const updateData: Record<string, any> = {
			updated_at: now
		};

		// Set clicked_at if this is the first click
		if (isFirstClick) {
			updateData.clicked_at = now;
			updateData.status = 'clicked';
		}

		// Set opened_at if not already set (click implies open)
		if (isFirstOpen) {
			updateData.opened_at = now;
		}

		console.log(
			`[NotificationTracking] Updating delivery ${delivery_id}:`,
			`first_click=${isFirstClick}, first_open=${isFirstOpen}, channel=${delivery.channel}`
		);

		// Update delivery record
		const { error: updateError } = await supabase
			.from('notification_deliveries')
			.update(updateData)
			.eq('id', delivery_id);

		if (updateError) {
			console.error(
				`[NotificationTracking] Failed to update delivery ${delivery_id}:`,
				updateError
			);
			return ApiResponse.internalError(updateError, 'Failed to update delivery');
		}

		console.log(`[NotificationTracking] Successfully tracked click for ${delivery_id}`);

		return ApiResponse.success({
			delivery_id,
			clicked_at: updateData.clicked_at || delivery.clicked_at,
			opened_at: updateData.opened_at || delivery.opened_at,
			is_first_click: isFirstClick,
			is_first_open: isFirstOpen
		});
	} catch (error: any) {
		console.error('[NotificationTracking] Error tracking click:', error);
		return ApiResponse.internalError(error, 'Error tracking notification click');
	}
};

/**
 * GET handler for CORS preflight and health check
 */
export const GET: RequestHandler = async ({ params }) => {
	return ApiResponse.success({
		endpoint: 'notification-tracking/click',
		delivery_id: params.delivery_id,
		method: 'POST',
		description: 'Track notification click events'
	});
};
