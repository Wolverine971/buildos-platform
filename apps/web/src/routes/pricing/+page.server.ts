// apps/web/src/routes/pricing/+page.server.ts
import type { PageServerLoad } from './$types';
import { StripeService } from '$lib/services/stripe-service';
import { checkUserSubscription } from '$lib/utils/subscription';

export const load: PageServerLoad = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	let subscription = null;
	let hasActiveSubscription = false;
	let trialStatus = null;

	if (user) {
		// Check user's subscription status
		subscription = await checkUserSubscription(supabase, user.id);
		hasActiveSubscription = subscription.hasActiveSubscription;

		// Get trial status
		const { data: status } = await supabase
			.rpc('get_user_trial_status', { p_user_id: user.id })
			.single();

		trialStatus = status;
	}

	return {
		user,
		subscription,
		hasActiveSubscription,
		trialStatus,
		stripeEnabled: StripeService.isEnabled(),
		stripePublishableKey: StripeService.getPublishableKey()
	};
};
