// apps/web/src/lib/server/stripe-config.ts
import { env } from '$env/dynamic/private';

/** Read the feature gate without importing or constructing the Stripe SDK. */
export function isStripeEnabled(config: Record<string, string | undefined> = env): boolean {
	return (
		(config.PRIVATE_ENABLE_STRIPE ?? config.ENABLE_STRIPE ?? 'false') === 'true' &&
		Boolean(config.PRIVATE_STRIPE_SECRET_KEY ?? config.STRIPE_SECRET_KEY ?? '')
	);
}
