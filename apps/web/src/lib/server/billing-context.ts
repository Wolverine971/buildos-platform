// apps/web/src/lib/server/billing-context.ts
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { checkUserSubscription } from '$lib/utils/subscription';
import { CONSUMPTION_BILLING_LIMITS } from '$lib/server/consumption-billing';

export interface BillingContextPayload {
	subscription: any | null;
	trialStatus: any | null;
	paymentWarnings: any[];
	isReadOnly: boolean;
	consumptionGate: {
		billing_state: string;
		billing_tier: string;
		is_frozen: boolean;
		project_count: number;
		lifetime_credits_used: number;
		trigger_reason: string | null;
	} | null;
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
			isReadOnly: false,
			consumptionGate: null
		};
	}

	const subscriptionPromise = checkUserSubscription(supabase, userId);
	const trialStatusPromise = supabase
		.rpc('get_user_trial_status', { p_user_id: userId })
		.single();

	const consumptionGatePromise: Promise<any> = (supabase as any).rpc(
		'evaluate_user_consumption_gate',
		{
			p_user_id: userId,
			p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
			p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
		}
	);

	const [subscriptionResult, trialStatusResult, consumptionGateResult] = await Promise.all([
		subscriptionPromise,
		trialStatusPromise,
		consumptionGatePromise
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

	let consumptionGate: BillingContextPayload['consumptionGate'] = null;
	if (consumptionGateResult?.error) {
		console.error('Failed to fetch consumption gate:', consumptionGateResult.error);
	} else {
		const row = Array.isArray(consumptionGateResult?.data)
			? consumptionGateResult.data[0]
			: consumptionGateResult?.data;

		if (row && typeof row === 'object') {
			const typedRow = row as Record<string, unknown>;
			consumptionGate = {
				billing_state:
					typeof typedRow.billing_state === 'string'
						? typedRow.billing_state
						: 'explorer_active',
				billing_tier:
					typeof typedRow.billing_tier === 'string' ? typedRow.billing_tier : 'explorer',
				is_frozen: Boolean(typedRow.is_frozen),
				project_count:
					typeof typedRow.project_count === 'number' ? typedRow.project_count : 0,
				lifetime_credits_used:
					typeof typedRow.lifetime_credits_used === 'number'
						? typedRow.lifetime_credits_used
						: 0,
				trigger_reason:
					typeof typedRow.trigger_reason === 'string' ? typedRow.trigger_reason : null
			};
		}
	}

	return {
		subscription,
		trialStatus,
		paymentWarnings,
		isReadOnly: Boolean(trialStatus?.is_read_only) || Boolean(consumptionGate?.is_frozen),
		consumptionGate
	};
}
