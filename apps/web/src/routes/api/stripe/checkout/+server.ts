// apps/web/src/routes/api/stripe/checkout/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { STRIPE_PRICE_ID } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';

type CheckoutRequestPayload = {
	discountCode?: string;
	successPath?: string;
	cancelPath?: string;
	source?: string;
};

function sanitizeRelativePath(candidate: unknown, fallback: string): string {
	if (typeof candidate !== 'string') return fallback;
	if (!candidate.startsWith('/')) return fallback;
	if (candidate.startsWith('//')) return fallback;
	return candidate;
}

export const POST: RequestHandler = async ({
	request,
	locals: { supabase, safeGetSession },
	url
}) => {
	try {
		// Check if Stripe is enabled
		if (!StripeService.isEnabled()) {
			return ApiResponse.badRequest('Payments are not enabled');
		}

		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		// Get user email
		const { data: userData } = await supabase
			.from('users')
			.select('email')
			.eq('id', user.id)
			.single();

		if (!userData?.email) {
			return ApiResponse.badRequest('User email not found');
		}

		// Get optional checkout overrides from request.
		const payload = (await request.json().catch(() => ({}))) as CheckoutRequestPayload;
		const discountCode =
			typeof payload.discountCode === 'string' ? payload.discountCode : undefined;
		const successPath = sanitizeRelativePath(payload.successPath, '/?payment=success');
		const cancelPath = sanitizeRelativePath(payload.cancelPath, '/pricing?payment=cancelled');
		const checkoutSource =
			typeof payload.source === 'string' && payload.source.length > 0
				? payload.source
				: 'default';

		// Create Stripe service instance
		const stripeService = new StripeService(supabase);

		// Create checkout session
		const checkoutUrl = await stripeService.createCheckoutSession({
			userId: user.id,
			userEmail: userData.email,
			priceId: STRIPE_PRICE_ID || 'price_placeholder',
			successUrl: new URL(successPath, PUBLIC_APP_URL || url.origin).toString(),
			cancelUrl: new URL(cancelPath, PUBLIC_APP_URL || url.origin).toString(),
			discountCode,
			metadata: {
				checkout_source: checkoutSource,
				environment: process.env.NODE_ENV || 'development'
			}
		});

		return ApiResponse.success({ url: checkoutUrl });
	} catch (error) {
		console.error('Error creating checkout session:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Failed to create checkout session'
		);
	}
};
