// apps/web/src/routes/api/notification-tracking/click/[delivery_id]/+server.ts

import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

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
			return json({ success: false, error: 'delivery_id is required' }, { status: 400 });
		}

		// Parse request body for optional metadata
		let metadata = {};
		try {
			const body = await request.json();
			metadata = body.metadata || {};
		} catch (e) {
			// Body is optional
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
			return json(
				{ success: false, error: 'Delivery not found', delivery_id },
				{ status: 404 }
			);
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

		// Store optional metadata (user_agent, action, etc.)
		if (Object.keys(metadata).length > 0) {
			updateData.tracking_metadata = metadata;
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
			return json(
				{ success: false, error: 'Failed to update delivery', delivery_id },
				{ status: 500 }
			);
		}

		console.log(`[NotificationTracking] Successfully tracked click for ${delivery_id}`);

		return json({
			success: true,
			delivery_id,
			clicked_at: updateData.clicked_at || delivery.clicked_at,
			opened_at: updateData.opened_at || delivery.opened_at,
			is_first_click: isFirstClick,
			is_first_open: isFirstOpen
		});
	} catch (error: any) {
		console.error('[NotificationTracking] Error tracking click:', error);
		return json(
			{
				success: false,
				error: error.message || 'Unknown error',
				delivery_id: params.delivery_id
			},
			{ status: 500 }
		);
	}
};

/**
 * GET handler for CORS preflight and health check
 */
export const GET: RequestHandler = async ({ params }) => {
	return json({
		endpoint: 'notification-tracking/click',
		delivery_id: params.delivery_id,
		method: 'POST',
		description: 'Track notification click events'
	});
};
