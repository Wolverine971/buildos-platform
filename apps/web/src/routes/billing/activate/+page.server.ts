// apps/web/src/routes/billing/activate/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { StripeService } from '$lib/services/stripe-service';
import { fetchBillingContext } from '$lib/server/billing-context';
import { checkUserSubscription } from '$lib/utils/subscription';

export const load: PageServerLoad = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();

	if (!user) {
		const returnTo = encodeURIComponent('/billing/activate');
		throw redirect(303, `/auth/login?redirectTo=${returnTo}`);
	}

	const stripeEnabled = StripeService.isEnabled();
	if (!stripeEnabled) {
		throw redirect(303, '/pricing');
	}

	const [billingContext, subscription] = await Promise.all([
		fetchBillingContext(supabase as any, user.id, stripeEnabled, {
			consumptionGateMode: 'evaluate'
		}),
		checkUserSubscription(supabase as any, user.id)
	]);

	const paymentState = url.searchParams.get('payment');
	const isConsumptionFrozen = Boolean(billingContext?.consumptionGate?.is_frozen);

	return {
		user,
		stripeEnabled,
		paymentState,
		isConsumptionFrozen,
		hasActiveSubscription: Boolean(subscription?.hasActiveSubscription),
		billingContext
	};
};
