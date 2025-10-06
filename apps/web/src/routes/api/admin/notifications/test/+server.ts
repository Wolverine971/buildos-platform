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
			return ApiResponse.badRequest('Missing required fields: event_type, payload, recipient_user_ids, channels');
		}

		if (recipient_user_ids.length === 0) {
			return ApiResponse.badRequest('At least one recipient is required');
		}

		if (recipient_user_ids.length > MAX_RECIPIENTS_PER_TEST) {
			return ApiResponse.badRequest(`Maximum ${MAX_RECIPIENTS_PER_TEST} recipients allowed per test`);
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
				return ApiResponse.badRequest(`Rate limit exceeded: ${MAX_TESTS_PER_HOUR} tests per hour`);
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

		// Emit notification event using RPC function
		const { data: eventId, error: eventError } = await supabase.rpc('emit_notification_event', {
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

		// Get the created deliveries for this event
		const { data: deliveries, error: deliveriesError } = await supabase
			.from('notification_deliveries')
			.select(
				`
				id,
				channel,
				recipient_user_id,
				status,
				last_error
			`
			)
			.eq('event_id', eventId);

		if (deliveriesError) {
			console.error('Error fetching deliveries:', deliveriesError);
			// Don't fail the request, just return without delivery details
		}

		return ApiResponse.success({
			event_id: eventId,
			deliveries: deliveries || []
		});
	} catch (error) {
		console.error('Error sending test notification:', error);
		return ApiResponse.internalError(error, 'Failed to send test notification');
	}
};
