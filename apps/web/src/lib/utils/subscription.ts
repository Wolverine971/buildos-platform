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

/**
 * Features that require a subscription
 */
export const PRO_FEATURES = {
	GOOGLE_CALENDAR: 'google_calendar',
	DAILY_BRIEFS: 'daily_briefs',
	ADVANCED_AI: 'advanced_ai',
	PROJECT_PHASES: 'project_phases',
	API_ACCESS: 'api_access'
} as const;

/**
 * Check if a user has access to a specific feature
 */
export function hasFeatureAccess(
	subscription: SubscriptionStatus,
	feature: keyof typeof PRO_FEATURES
): boolean {
	// If Stripe is not enabled, all features are available
	if (!StripeService.isEnabled()) {
		return true;
	}

	// Beta users have full access
	if (subscription.isBetaUser) {
		return true;
	}

	// Check subscription status
	return subscription.hasActiveSubscription;
}

/**
 * Get a user-friendly message for subscription requirements
 */
export function getSubscriptionMessage(feature: string): string {
	const messages: Record<string, string> = {
		[PRO_FEATURES.GOOGLE_CALENDAR]: 'Google Calendar integration requires a Pro subscription',
		[PRO_FEATURES.DAILY_BRIEFS]: 'Daily AI briefs are available with a Pro subscription',
		[PRO_FEATURES.ADVANCED_AI]: 'Advanced AI features require a Pro subscription',
		[PRO_FEATURES.PROJECT_PHASES]:
			'Project phases and timeline features require a Pro subscription',
		[PRO_FEATURES.API_ACCESS]: 'API access is available with a Pro subscription'
	};

	return messages[feature] || 'This feature requires a Pro subscription';
}
