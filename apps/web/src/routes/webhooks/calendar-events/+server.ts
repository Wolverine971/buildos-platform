// apps/web/src/routes/webhooks/calendar-events/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCustomClient } from '@buildos/supabase-client';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { PRIVATE_SUPABASE_SERVICE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Create service role client for admin operations
		const supabase = createCustomClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY);

		const webhookService = new CalendarWebhookService(supabase);

		// Extract Google webhook headers
		const headers: Record<string, string> = {};
		request.headers.forEach((value, key) => {
			headers[key.toLowerCase()] = value;
		});

		// Google sends these headers:
		// x-goog-channel-id: channel ID
		// x-goog-resource-id: resource ID
		// x-goog-resource-state: sync | exists | not_exists
		// x-goog-message-number: incremental message number
		// x-goog-resource-uri: resource URI
		// x-goog-channel-token: your security token

		const channelId = headers['x-goog-channel-id'];
		const resourceId = headers['x-goog-resource-id'];
		const resourceState = headers['x-goog-resource-state'];
		const token = headers['x-goog-channel-token'];

		if (!channelId || !resourceId) {
			console.error('Missing required webhook headers');
			return json({ error: 'Invalid webhook headers' }, { status: 400 });
		}

		console.log('Webhook received:', {
			channelId,
			resourceId,
			resourceState,
			messageNumber: headers['x-goog-message-number']
		});

		// Handle the webhook notification
		const result = await webhookService.handleWebhookNotification(
			channelId,
			resourceId,
			token || '',
			headers
		);

		if (!result.success) {
			return json({ error: 'Failed to process webhook' }, { status: 400 });
		}

		return json({
			success: true,
			processed: result.processed
		});
	} catch (err) {
		console.error('Webhook error:', err);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};

// Google sends a GET request to verify the webhook URL
export const GET: RequestHandler = async ({ url }) => {
	// Google sends a hub.challenge parameter for verification
	const challenge = url.searchParams.get('hub.challenge');

	if (challenge) {
		console.log('Webhook verification challenge received:', challenge);
		return new Response(challenge, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain'
			}
		});
	}

	return json({ status: 'Webhook endpoint active' });
};
