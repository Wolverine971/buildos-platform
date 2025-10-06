// apps/web/src/routes/api/webhooks/twilio/status/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import twilio from 'twilio';
import { PRIVATE_TWILIO_AUTH_TOKEN } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';

import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServiceClient } from '@buildos/supabase-client';

// Map Twilio status to our sms_status enum
const statusMap: Record<string, string> = {
	queued: 'queued',
	sending: 'sending',
	sent: 'sent',
	delivered: 'delivered',
	failed: 'failed',
	undelivered: 'undelivered',
	canceled: 'cancelled'
};

// Map Twilio status to notification delivery status
function mapTwilioStatusToDeliveryStatus(twilioStatus: string): string {
	const deliveryStatusMap: Record<string, string> = {
		queued: 'pending',
		sending: 'sent',
		sent: 'sent',
		delivered: 'delivered',
		failed: 'failed',
		undelivered: 'failed',
		canceled: 'failed'
	};
	return deliveryStatusMap[twilioStatus] || 'pending';
}

export const POST: RequestHandler = async ({ request, url }) => {
	const supabase = createServiceClient();

	try {
		// Get the raw request body for signature validation
		const body = await request.text();
		const params = new URLSearchParams(body);

		// Validate webhook signature (important for security)
		const twilioSignature = request.headers.get('X-Twilio-Signature');
		if (twilioSignature) {
			const webhookUrl = `${PUBLIC_APP_URL}/api/webhooks/twilio/status`;
			const isValid = twilio.validateRequest(
				PRIVATE_TWILIO_AUTH_TOKEN,
				twilioSignature,
				webhookUrl,
				Object.fromEntries(params)
			);

			if (!isValid) {
				console.error('Invalid Twilio webhook signature');
				return json({ error: 'Invalid signature' }, { status: 401 });
			}
		}

		// Extract status update from Twilio
		const messageSid = params.get('MessageSid');
		const messageStatus = params.get('MessageStatus');
		const errorCode = params.get('ErrorCode');
		const errorMessage = params.get('ErrorMessage');

		// Extract custom metadata from URL params
		const messageId = url.searchParams.get('message_id');
		const userId = url.searchParams.get('user_id');

		if (!messageSid || !messageStatus) {
			return json({ error: 'Missing required parameters' }, { status: 400 });
		}

		// Map Twilio status to our enum
		const mappedStatus = statusMap[messageStatus] || messageStatus;

		// Update message status in database
		if (messageId) {
			const updateData: any = {
				twilio_status: messageStatus,
				status: mappedStatus,
				updated_at: new Date().toISOString()
			};

			if (messageStatus === 'delivered') {
				updateData.delivered_at = new Date().toISOString();
			}

			if (errorCode || errorMessage) {
				updateData.twilio_error_code = parseInt(errorCode || '0');
				updateData.twilio_error_message = errorMessage;
			}

			// Update SMS message
			const { data: updatedMessage, error } = await supabase
				.from('sms_messages')
				.update(updateData)
				.eq('id', messageId)
				.eq('twilio_sid', messageSid)
				.select('notification_delivery_id')
				.single();

			if (error) {
				console.error('Failed to update SMS status:', error);
				// Don't return error to Twilio, as it might retry
			}

			// If this SMS is linked to a notification delivery, update that too
			if (updatedMessage?.notification_delivery_id) {
				const deliveryStatus = mapTwilioStatusToDeliveryStatus(messageStatus);
				const deliveryUpdate: any = {
					status: deliveryStatus,
					updated_at: new Date().toISOString()
				};

				if (messageStatus === 'sent' || messageStatus === 'sending') {
					deliveryUpdate.sent_at = new Date().toISOString();
				} else if (messageStatus === 'delivered') {
					deliveryUpdate.delivered_at = new Date().toISOString();
				} else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
					deliveryUpdate.failed_at = new Date().toISOString();
					deliveryUpdate.last_error = errorMessage || `Twilio error: ${errorCode}`;
				}

				const { error: deliveryError } = await supabase
					.from('notification_deliveries')
					.update(deliveryUpdate)
					.eq('id', updatedMessage.notification_delivery_id);

				if (deliveryError) {
					console.error('Failed to update notification delivery status:', deliveryError);
				} else {
					console.log(
						`[TwilioWebhook] Updated notification delivery ${updatedMessage.notification_delivery_id} status to ${deliveryStatus}`
					);
				}
			}

			// If delivery failed, check if we should retry
			if (messageStatus === 'failed' || messageStatus === 'undelivered') {
				const { data: message } = await supabase
					.from('sms_messages')
					.select('attempt_count, max_attempts, priority')
					.eq('id', messageId)
					.single();

				if (message && message.attempt_count < message.max_attempts) {
					// Re-queue for retry
					const delay = Math.pow(2, message.attempt_count) * 60; // exponential backoff
					await supabase.rpc('add_queue_job', {
						p_user_id: userId,
						p_job_type: 'send_sms',
						p_metadata: {
							message_id: messageId,
							retry_attempt: message.attempt_count + 1
						},
						p_scheduled_for: new Date(Date.now() + delay * 60000).toISOString(),
						p_priority: message.priority === 'urgent' ? 1 : 10
					});
				}
			}
		} else {
			// Update by Twilio SID if message_id not provided
			await supabase
				.from('sms_messages')
				.update({
					twilio_status: messageStatus,
					status: mappedStatus,
					delivered_at: messageStatus === 'delivered' ? new Date().toISOString() : null,
					twilio_error_code: errorCode ? parseInt(errorCode) : null,
					twilio_error_message: errorMessage,
					updated_at: new Date().toISOString()
				})
				.eq('twilio_sid', messageSid);
		}

		// Twilio expects a 200 OK response
		return json({ success: true });
	} catch (error: any) {
		console.error('Twilio webhook error:', error);
		// Return success to prevent Twilio retries
		return json({ success: true });
	}
};
