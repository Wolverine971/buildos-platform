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

		// Queue a new notification job
		const { error: queueError } = await supabase.from('queue_jobs').insert({
			user_id: delivery.recipient_user_id,
			job_type: 'send_notification',
			status: 'pending',
			scheduled_for: new Date().toISOString(),
			queue_job_id: `notif_retry_${deliveryId}`,
			metadata: {
				event_id: delivery.event_id,
				delivery_id: deliveryId,
				channel: delivery.channel,
				retry: true
			}
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
