// apps/web/src/routes/api/stripe/checkout/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { STRIPE_PRICE_ID } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';

export const POST: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	url
}) => {
	try {
		// Check if Stripe is enabled
		if (!StripeService.isEnabled()) {
			return json({ error: 'Payments are not enabled' }, { status: 400 });
		}

		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get user email
		const { data: userData } = await supabase
			.from('users')
			.select('email')
			.eq('id', user.id)
			.single();

		if (!userData?.email) {
			return json({ error: 'User email not found' }, { status: 400 });
		}

		// Get discount code from request if provided
		const { discountCode } = await request.json();

		// Create Stripe service instance
		const stripeService = new StripeService(supabase);

		// Create checkout session
		const checkoutUrl = await stripeService.createCheckoutSession({
			userId: user.id,
			userEmail: userData.email,
			priceId: STRIPE_PRICE_ID || 'price_placeholder',
			successUrl: `${PUBLIC_APP_URL || url.origin}?payment=success`,
			cancelUrl: `${PUBLIC_APP_URL || url.origin}/pricing?payment=cancelled`,
			discountCode,
			metadata: {
				environment: process.env.NODE_ENV || 'development'
			}
		});

		return json({ url: checkoutUrl });
	} catch (error) {
		console.error('Error creating checkout session:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to create checkout session' },
			{ status: 500 }
		);
	}
};
