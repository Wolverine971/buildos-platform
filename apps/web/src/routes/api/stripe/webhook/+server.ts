// apps/web/src/routes/api/stripe/webhook/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Check if Stripe is enabled
		if (!StripeService.isEnabled()) {
			return ApiResponse.badRequest('Webhooks are not enabled');
		}

		if (!STRIPE_WEBHOOK_SECRET) {
			console.error(
				'CRITICAL: Stripe webhook secret not configured - rejecting all webhooks'
			);
			return ApiResponse.unauthorized('Unauthorized');
		}

		// Get raw body and signature
		const body = await request.text();
		const signature = request.headers.get('stripe-signature');

		if (!signature) {
			return ApiResponse.badRequest('No signature provided');
		}

		// Verify webhook signature and construct event
		let event;
		try {
			event = StripeService.verifyWebhookSignature(body, signature, STRIPE_WEBHOOK_SECRET);
		} catch (err) {
			console.error('Webhook signature verification failed:', err);
			return ApiResponse.badRequest('Invalid signature');
		}

		// Log event type for debugging
		console.log(`Processing webhook event: ${event.type}`);

		// Create admin Supabase client for webhook processing
		const supabase = createAdminSupabaseClient();
		const stripeService = new StripeService(supabase);

		// Handle the event
		await stripeService.handleWebhookEvent(event);

		return ApiResponse.success({ received: true });
	} catch (error) {
		console.error('Webhook processing error:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Webhook processing failed'
		);
	}
};
