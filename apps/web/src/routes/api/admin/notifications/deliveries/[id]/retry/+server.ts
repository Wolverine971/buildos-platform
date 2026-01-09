// apps/web/src/routes/api/admin/notifications/deliveries/[id]/retry/+server.ts
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

		// Get the delivery
		const { data: delivery, error: fetchError } = await supabase
			.from('notification_deliveries')
			.select('*')
			.eq('id', deliveryId)
			.single();

		if (fetchError || !delivery) {
			return ApiResponse.badRequest('Delivery not found');
		}

		// Check if max attempts exceeded
		if (delivery.attempts >= delivery.max_attempts) {
			return ApiResponse.badRequest('Maximum retry attempts exceeded');
		}

		// Reset delivery status to pending and queue a new job
		const { error: updateError } = await supabase
			.from('notification_deliveries')
			.update({
				status: 'pending',
				last_error: null,
				updated_at: new Date().toISOString()
			})
			.eq('id', deliveryId);

		if (updateError) {
			console.error('Error updating delivery:', updateError);
			return ApiResponse.databaseError(updateError);
		}

		// Queue a new notification job using atomic RPC with deduplication
		const { data: _jobId, error: queueError } = await supabase.rpc('add_queue_job', {
			p_user_id: delivery.recipient_user_id,
			p_job_type: 'send_notification',
			p_metadata: {
				event_id: delivery.event_id,
				delivery_id: deliveryId,
				channel: delivery.channel,
				retry: true
			},
			p_priority: 10,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `notif_retry_${deliveryId}` // Prevent duplicate retry jobs
		});

		if (queueError) {
			console.error('Error queuing retry job:', queueError);
			return ApiResponse.databaseError(queueError);
		}

		return ApiResponse.success({
			delivery_id: deliveryId,
			status: 'pending',
			attempts: delivery.attempts,
			queued_at: new Date().toISOString()
		});
	} catch (error) {
		console.error('Error retrying delivery:', error);
		return ApiResponse.internalError(error, 'Failed to retry delivery');
	}
};
