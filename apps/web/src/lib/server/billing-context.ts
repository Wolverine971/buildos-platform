// apps/web/src/lib/server/billing-context.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { checkUserSubscription } from '$lib/utils/subscription';

export interface BillingContextPayload {
	subscription: any | null;
	trialStatus: any | null;
	paymentWarnings: any[];
	isReadOnly: boolean;
}

export async function fetchBillingContext(
	supabase: TypedSupabaseClient,
	userId: string,
	stripeEnabled: boolean
): Promise<BillingContextPayload> {
	if (!stripeEnabled) {
		return {
			subscription: null,
			trialStatus: null,
			paymentWarnings: [],
			isReadOnly: false
		};
	}

	const subscriptionPromise = checkUserSubscription(supabase, userId);
	const trialStatusPromise = supabase
		.rpc('get_user_trial_status', { p_user_id: userId })
		.single();

	const [subscriptionResult, trialStatusResult] = await Promise.all([
		subscriptionPromise,
		trialStatusPromise
	]);

	const subscription = subscriptionResult ?? null;
	let trialStatus = trialStatusResult?.data ?? null;
	if (trialStatusResult?.error) {
		console.error('Failed to fetch trial status:', trialStatusResult.error);
		trialStatus = null;
	}

	let paymentWarnings: any[] = [];
	if (subscription?.subscriptionStatus === 'past_due') {
		const { data: notifications, error } = await supabase
			.from('user_notifications')
			.select('*')
			.eq('user_id', userId)
			.eq('type', 'payment_warning')
			.is('read_at', null)
			.is('dismissed_at', null)
			.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Failed to fetch payment warnings:', error);
		} else if (notifications) {
			paymentWarnings = notifications;
		}
	}

	return {
		subscription,
		trialStatus,
		paymentWarnings,
		isReadOnly: Boolean(trialStatus?.is_read_only)
	};
}
