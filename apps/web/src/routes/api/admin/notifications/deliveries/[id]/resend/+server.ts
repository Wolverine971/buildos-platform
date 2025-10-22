// apps/web/src/routes/api/admin/notifications/deliveries/[id]/resend/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const deliveryId = params.id;

		// Get the original delivery
		const { data: originalDelivery, error: fetchError } = await supabase
			.from('notification_deliveries')
			.select('*')
			.eq('id', deliveryId)
			.single();

		if (fetchError || !originalDelivery) {
			return ApiResponse.badRequest('Delivery not found');
		}

		// Get the event payload
		const { data: event, error: eventError } = await supabase
			.from('notification_events')
			.select('payload, event_type')
			.eq('id', originalDelivery.event_id)
			.single();

		if (eventError || !event) {
			return ApiResponse.badRequest('Event not found');
		}

		// Create a new delivery record (fresh start, no attempts carried over)
		const { data: newDelivery, error: createError } = await supabase
			.from('notification_deliveries')
			.insert({
				event_id: originalDelivery.event_id,
				subscription_id: originalDelivery.subscription_id,
				recipient_user_id: originalDelivery.recipient_user_id,
				channel: originalDelivery.channel,
				channel_identifier: originalDelivery.channel_identifier,
				payload: event.payload,
				status: 'pending',
				attempts: 0,
				max_attempts: 3
			})
			.select('id')
			.single();

		if (createError || !newDelivery) {
			console.error('Error creating new delivery:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Queue a new notification job using atomic RPC with deduplication
		const { data: jobId, error: queueError } = await supabase.rpc('add_queue_job', {
			p_user_id: originalDelivery.recipient_user_id,
			p_job_type: 'send_notification',
			p_metadata: {
				event_id: originalDelivery.event_id,
				delivery_id: newDelivery.id,
				channel: originalDelivery.channel,
				event_type: event.event_type,
				resend: true,
				original_delivery_id: deliveryId
			},
			p_priority: 10,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `notif_resend_${newDelivery.id}` // Prevent duplicate resend jobs
		});

		if (queueError) {
			console.error('Error queuing resend job:', queueError);
			return ApiResponse.databaseError(queueError);
		}

		return ApiResponse.success({
			new_delivery_id: newDelivery.id,
			status: 'pending',
			queued_at: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error resending delivery:', error);
		return ApiResponse.internalError(error, 'Failed to resend delivery');
	}
};
