// src/routes/api/stripe/webhook/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Check if Stripe is enabled
		if (!StripeService.isEnabled()) {
			return json({ error: 'Webhooks are not enabled' }, { status: 400 });
		}

		if (!STRIPE_WEBHOOK_SECRET) {
			console.error(
				'CRITICAL: Stripe webhook secret not configured - rejecting all webhooks'
			);
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get raw body and signature
		const body = await request.text();
		const signature = request.headers.get('stripe-signature');

		if (!signature) {
			return json({ error: 'No signature provided' }, { status: 400 });
		}

		// Verify webhook signature and construct event
		let event;
		try {
			event = StripeService.verifyWebhookSignature(body, signature, STRIPE_WEBHOOK_SECRET);
		} catch (err) {
			console.error('Webhook signature verification failed:', err);
			return json({ error: 'Invalid signature' }, { status: 400 });
		}

		// Log event type for debugging
		console.log(`Processing webhook event: ${event.type}`);

		// Create admin Supabase client for webhook processing
		const supabase = createAdminSupabaseClient();
		const stripeService = new StripeService(supabase);

		// Handle the event
		await stripeService.handleWebhookEvent(event);

		return json({ received: true });
	} catch (error) {
		console.error('Webhook processing error:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Webhook processing failed' },
			{ status: 500 }
		);
	}
};
