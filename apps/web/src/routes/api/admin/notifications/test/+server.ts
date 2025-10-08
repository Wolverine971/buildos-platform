// apps/web/src/routes/api/admin/notifications/test/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import type { EventType, NotificationChannel } from '@buildos/shared-types';

// Rate limiting constants
const MAX_RECIPIENTS_PER_TEST = 20;
const MAX_TESTS_PER_HOUR = 50;

interface TestNotificationRequest {
	event_type: EventType;
	payload: Record<string, any>;
	recipient_user_ids: string[];
	channels: NotificationChannel[];
	test_mode?: boolean;
}

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const body = (await request.json()) as TestNotificationRequest;
		const { event_type, payload, recipient_user_ids, channels, test_mode = true } = body;

		// Validation
		if (!event_type || !payload || !recipient_user_ids || !channels) {
			return ApiResponse.badRequest(
				'Missing required fields: event_type, payload, recipient_user_ids, channels'
			);
		}

		if (recipient_user_ids.length === 0) {
			return ApiResponse.badRequest('At least one recipient is required');
		}

		if (recipient_user_ids.length > MAX_RECIPIENTS_PER_TEST) {
			return ApiResponse.badRequest(
				`Maximum ${MAX_RECIPIENTS_PER_TEST} recipients allowed per test`
			);
		}

		if (channels.length === 0) {
			return ApiResponse.badRequest('At least one channel is required');
		}

		// Rate limiting check
		if (test_mode) {
			const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
			const { count, error: rateLimitError } = await supabase
				.from('notification_events')
				.select('id', { count: 'exact', head: true })
				.eq('metadata->>test_sent_by', user.id)
				.gte('created_at', oneHourAgo);

			if (rateLimitError) {
				console.error('Error checking rate limit:', rateLimitError);
			} else if (count && count >= MAX_TESTS_PER_HOUR) {
				return ApiResponse.badRequest(
					`Rate limit exceeded: ${MAX_TESTS_PER_HOUR} tests per hour`
				);
			}
		}

		// Create the notification event with test mode metadata
		const metadata = test_mode
			? {
					test_mode: true,
					test_sent_by: user.id,
					test_recipients: recipient_user_ids,
					test_channels: channels
				}
			: undefined;

		// In test mode, create deliveries manually for specified recipients and channels
		// This bypasses the subscription requirement
		let eventId: string;
		let deliveries: any[] = [];

		if (test_mode) {
			// Create notification event
			const { data: eventData, error: eventError } = await supabase
				.from('notification_events')
				.insert({
					event_type,
					event_source: 'api_action',
					actor_user_id: user.id,
					payload,
					metadata
				})
				.select('id')
				.single();

			if (eventError) {
				console.error('Error creating test notification event:', eventError);
				return ApiResponse.databaseError(eventError);
			}

			eventId = eventData.id;

			// Create deliveries for each recipient and channel
			for (const recipientId of recipient_user_ids) {
				for (const channel of channels) {
					// Get channel identifier based on channel type
					let channelIdentifier: string | null = null;

					if (channel === 'push') {
						// Get push subscription endpoint
						const { data: pushSub } = await supabase
							.from('push_subscriptions')
							.select('endpoint')
							.eq('user_id', recipientId)
							.eq('is_active', true)
							.limit(1)
							.single();

						channelIdentifier = pushSub?.endpoint || null;
					} else if (channel === 'sms') {
						// Get phone number from SMS preferences
						const { data: smsInfo } = await supabase
							.from('user_sms_preferences')
							.select('phone_number, phone_verified, opted_out')
							.eq('user_id', recipientId)
							.single();

						// Only set phone if verified and not opted out
						if (smsInfo?.phone_verified && !smsInfo?.opted_out) {
							channelIdentifier = smsInfo.phone_number;
						}
					}

					// Skip this channel if identifier is required but missing
					if ((channel === 'push' || channel === 'sms') && !channelIdentifier) {
						console.warn(`[TestNotification] Skipping ${channel} for user ${recipientId} - channel not available`);
						continue;
					}

					// Create delivery record
					const { data: delivery, error: deliveryError } = await supabase
						.from('notification_deliveries')
						.insert({
							event_id: eventId,
							recipient_user_id: recipientId,
							channel,
							channel_identifier: channelIdentifier,
							payload,
							status: 'pending'
						})
						.select('id, channel, recipient_user_id, status')
						.single();

					if (deliveryError) {
						console.error(`Error creating delivery for ${channel}:`, deliveryError);
						continue;
					}

					deliveries.push(delivery);

					// Queue notification job
					const { error: jobError } = await supabase.from('queue_jobs').insert({
						user_id: recipientId,
						job_type: 'send_notification',
						status: 'pending',
						scheduled_for: new Date().toISOString(),
						queue_job_id: `notif_${delivery.id}`,
						metadata: {
							event_id: eventId,
							delivery_id: delivery.id,
							channel,
							event_type
						}
					});

					if (jobError) {
						console.error(`Error queuing notification job for ${channel}:`, jobError);
					}
				}
			}
		} else {
			// Production mode: use the standard RPC that checks subscriptions
			const { data: rpcEventId, error: eventError } = await supabase.rpc('emit_notification_event', {
				p_event_type: event_type,
				p_event_source: 'api_action',
				p_actor_user_id: user.id,
				p_payload: payload,
				p_metadata: metadata
			});

			if (eventError) {
				console.error('Error emitting notification event:', eventError);
				return ApiResponse.databaseError(eventError);
			}

			eventId = rpcEventId;

			// Get the created deliveries
			const { data: deliveriesData, error: deliveriesError } = await supabase
				.from('notification_deliveries')
				.select('id, channel, recipient_user_id, status, last_error')
				.eq('event_id', eventId);

			if (deliveriesError) {
				console.error('Error fetching deliveries:', deliveriesError);
			} else {
				deliveries = deliveriesData || [];
			}
		}

		return ApiResponse.success({
			event_id: eventId,
			deliveries
		});
	} catch (error) {
		console.error('Error sending test notification:', error);
		return ApiResponse.internalError(error, 'Failed to send test notification');
	}
};
