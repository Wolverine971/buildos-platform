// apps/web/src/lib/utils/subscription.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { StripeService } from '$lib/services/stripe-service';

export interface SubscriptionStatus {
	hasActiveSubscription: boolean;
	subscriptionStatus: string;
	currentPeriodEnd: Date | null;
	isBetaUser: boolean;
	isTrialing: boolean;
}

interface UserSubscriptionRpcResponse {
	has_subscription: boolean;
	subscription_status: string;
	current_period_end: string | null;
	is_beta_user: boolean;
}

/**
 * Check if a user has an active subscription
 */
export async function checkUserSubscription(
	supabase: SupabaseClient,
	userId: string
): Promise<SubscriptionStatus> {
	// If Stripe is not enabled, everyone has access
	if (!StripeService.isEnabled()) {
		return {
			hasActiveSubscription: true,
			subscriptionStatus: 'free_access',
			currentPeriodEnd: null,
			isBetaUser: false,
			isTrialing: false
		};
	}

	try {
		// Check subscription status using the database function
		const { data, error } = await supabase
			.rpc('get_user_subscription_status', { user_uuid: userId })
			.single();

		if (error || !data) {
			console.error('Error checking subscription:', error);
			return {
				hasActiveSubscription: false,
				subscriptionStatus: 'error',
				currentPeriodEnd: null,
				isBetaUser: false,
				isTrialing: false
			};
		}

		// Type cast the RPC response
		const rpcData = data as UserSubscriptionRpcResponse;

		return {
			hasActiveSubscription: rpcData.has_subscription,
			subscriptionStatus: rpcData.subscription_status,
			currentPeriodEnd: rpcData.current_period_end
				? new Date(rpcData.current_period_end)
				: null,
			isBetaUser: rpcData.is_beta_user,
			isTrialing: rpcData.subscription_status === 'trialing'
		};
	} catch (error) {
		console.error('Error checking subscription:', error);
		return {
			hasActiveSubscription: false,
			subscriptionStatus: 'error',
			currentPeriodEnd: null,
			isBetaUser: false,
			isTrialing: false
		};
	}
}
