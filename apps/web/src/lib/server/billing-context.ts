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

export type ConsumptionGateFetchMode = 'snapshot' | 'evaluate';

export interface FetchBillingContextOptions {
	consumptionGateMode?: ConsumptionGateFetchMode;
}

function toTypedConsumptionGateRow(
	row: Record<string, unknown> | null | undefined
): BillingContextPayload['consumptionGate'] {
	if (!row) return null;

	return {
		billing_state:
			typeof row.billing_state === 'string' ? row.billing_state : 'explorer_active',
		billing_tier: typeof row.billing_tier === 'string' ? row.billing_tier : 'explorer',
		is_frozen: Boolean(row.is_frozen),
		project_count: typeof row.project_count === 'number' ? row.project_count : 0,
		lifetime_credits_used:
			typeof row.lifetime_credits_used === 'number' ? row.lifetime_credits_used : 0,
		trigger_reason: typeof row.trigger_reason === 'string' ? row.trigger_reason : null
	};
}

async function evaluateConsumptionGate(
	supabase: TypedSupabaseClient,
	userId: string
): Promise<BillingContextPayload['consumptionGate']> {
	const result: Promise<any> = (supabase as any).rpc('evaluate_user_consumption_gate', {
		p_user_id: userId,
		p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
		p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
	});

	const gateResult = await result;
	if (gateResult?.error) {
		console.error('Failed to fetch consumption gate:', gateResult.error);
		return null;
	}

	const row = Array.isArray(gateResult?.data) ? gateResult.data[0] : gateResult?.data;
	return toTypedConsumptionGateRow(row && typeof row === 'object' ? row : null);
}

async function fetchConsumptionGateSnapshot(
	supabase: TypedSupabaseClient,
	userId: string
): Promise<BillingContextPayload['consumptionGate']> {
	const { data, error } = await (supabase as any)
		.from('billing_accounts')
		.select('billing_state, billing_tier, frozen_reason')
		.eq('user_id', userId)
		.maybeSingle();

	if (error) {
		console.error('Failed to fetch billing account snapshot:', error);
		return null;
	}

	if (!data) {
		// Bootstrap/safety fallback for accounts that do not yet have a billing snapshot row.
		return evaluateConsumptionGate(supabase, userId);
	}

	const billingState =
		typeof data.billing_state === 'string' ? data.billing_state : 'explorer_active';
	const typedRow: Record<string, unknown> = {
		billing_state: billingState,
		billing_tier: typeof data.billing_tier === 'string' ? data.billing_tier : 'explorer',
		is_frozen: billingState === 'upgrade_required_frozen',
		project_count: 0,
		lifetime_credits_used: 0,
		trigger_reason: typeof data.frozen_reason === 'string' ? data.frozen_reason : null
	};

	return toTypedConsumptionGateRow(typedRow);
}

export async function fetchBillingContext(
	supabase: TypedSupabaseClient,
	userId: string,
	stripeEnabled: boolean,
	options?: FetchBillingContextOptions
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

	const consumptionGateMode = options?.consumptionGateMode ?? 'evaluate';

	const subscriptionPromise = checkUserSubscription(supabase, userId);
	const trialStatusPromise = supabase
		.rpc('get_user_trial_status', { p_user_id: userId })
		.single();
	const consumptionGatePromise =
		consumptionGateMode === 'snapshot'
			? fetchConsumptionGateSnapshot(supabase, userId)
			: evaluateConsumptionGate(supabase, userId);

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

	const consumptionGate = consumptionGateResult ?? null;

	return {
		subscription,
		trialStatus,
		paymentWarnings,
		isReadOnly: Boolean(trialStatus?.is_read_only) || Boolean(consumptionGate?.is_frozen),
		consumptionGate
	};
}
