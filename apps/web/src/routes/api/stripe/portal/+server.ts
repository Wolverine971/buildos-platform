// src/routes/api/stripe/portal/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { PUBLIC_APP_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ locals: { supabase, safeGetSession }, url }) => {
	try {
		// Check if Stripe is enabled
		if (!StripeService.isEnabled()) {
			return json({ error: 'Billing portal is not enabled' }, { status: 400 });
		}

		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Get user's Stripe customer ID
		const { data: userData } = await supabase
			.from('users')
			.select('stripe_customer_id')
			.eq('id', user.id)
			.single();

		if (!userData?.stripe_customer_id) {
			return json({ error: 'No billing account found' }, { status: 400 });
		}

		// Create Stripe service instance
		const stripeService = new StripeService(supabase);

		// Create portal session
		const portalUrl = await stripeService.createPortalSession({
			customerId: userData.stripe_customer_id,
			returnUrl: `${PUBLIC_APP_URL || url.origin}/profile?tab=billing`
		});

		return json({ url: portalUrl });
	} catch (error) {
		console.error('Error creating portal session:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Failed to create portal session' },
			{ status: 500 }
		);
	}
};
