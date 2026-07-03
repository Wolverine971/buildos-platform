// apps/web/src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { OnboardingProgressService } from '$lib/services/onboardingProgress.service';
import { StripeService } from '$lib/services/stripe-service';
import { checkAndRegisterWebhookIfNeeded } from '$lib/services/calendar-webhook-check';
import { fetchBillingContext } from '$lib/server/billing-context';
import {
	getCachedBillingContext,
	setCachedBillingContext,
	type CachedBillingContext
} from '$lib/server/billing-context-cache';

const clampProgress = (progress?: number | null) => {
	if (typeof progress !== 'number' || Number.isNaN(progress)) {
		return 0;
	}

	return Math.max(0, Math.min(100, progress));
};

type BillingContext = CachedBillingContext;

type PendingProjectInvite = {
	invite_id: string;
	project_id: string | null;
	project_name: string;
	role_key: string | null;
	access: string | null;
	status: string;
	expires_at: string | null;
	created_at: string | null;
	declined_at?: string | null;
	recoverable_until?: string | null;
	can_accept?: boolean | null;
	invited_by_name?: string | null;
	invited_by_email?: string | null;
};

const createEmptyBillingContext = (loading: boolean): BillingContext => ({
	subscription: null,
	trialStatus: null,
	paymentWarnings: [],
	isReadOnly: false,
	consumptionGate: null,
	loading
});

type CacheEntry<T> = {
	expiresAt: number;
	value: T;
};

const PENDING_INVITES_TTL_MS = 20_000;
const ONBOARDING_PROGRESS_TTL_MS = 60_000;
const WEBHOOK_CHECK_TTL_MS = 5 * 60_000;

const pendingInvitesCache = new Map<string, CacheEntry<PendingProjectInvite[]>>();
const onboardingProgressCache = new Map<string, CacheEntry<number>>();
const webhookCheckThrottle = new Map<string, number>();

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string, nowMs: number): T | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (entry.expiresAt <= nowMs) {
		cache.delete(key);
		return null;
	}
	return entry.value;
}

function setCached<T>(
	cache: Map<string, CacheEntry<T>>,
	key: string,
	value: T,
	ttlMs: number,
	nowMs: number
) {
	cache.set(key, {
		value,
		expiresAt: nowMs + ttlMs
	});
}

async function hasConnectedAgents(
	supabase: Parameters<LayoutServerLoad>[0]['locals']['supabase'],
	userId: string
): Promise<boolean> {
	try {
		const { count, error } = await supabase
			.from('external_agent_callers')
			.select('id', { count: 'exact', head: true })
			.eq('user_id', userId)
			.in('status', ['trusted', 'pending']);

		if (error) {
			console.warn('[Layout] Failed to load agent connection status:', error);
			// Be conservative: if we cannot confirm state, avoid showing a setup CTA
			// to users who may already have connected agents.
			return true;
		}

		return (count ?? 0) > 0;
	} catch (error) {
		console.warn('[Layout] Failed to load agent connection status:', error);
		// Be conservative: if we cannot confirm state, avoid showing a setup CTA
		// to users who may already have connected agents.
		return true;
	}
}

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	url,
	depends
}) => {
	depends('app:auth');
	depends('app:billing');

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		serverTiming ? serverTiming.measure(name, fn) : fn();

	const { user } = await safeGetSession();

	const stripeEnabled = StripeService.isEnabled();

	const baseData = {
		url: url.origin,
		stripeEnabled
	};

	if (!user) {
		return {
			...baseData,
			user: null,
			completedOnboarding: true,
			onboardingProgress: 100,
			billingContext: createEmptyBillingContext(false),
			pendingInvites: [],
			hasConnectedAgents: false
		};
	}

	depends('app:invites');
	depends('app:agent-connections');

	const completedOnboarding = Boolean(user.onboarding_completed_at);
	const nowMs = Date.now();
	const routePath = url.pathname;
	const shouldLoadOnboardingProgress =
		!completedOnboarding && (routePath === '/' || routePath.startsWith('/onboarding'));
	const shouldLoadBillingContext = stripeEnabled && !routePath.startsWith('/auth');

	const webhookThrottleKey = `${user.id}:${url.origin}`;
	const lastWebhookCheck = webhookCheckThrottle.get(webhookThrottleKey) ?? 0;
	if (nowMs - lastWebhookCheck >= WEBHOOK_CHECK_TTL_MS) {
		webhookCheckThrottle.set(webhookThrottleKey, nowMs);
		checkAndRegisterWebhookIfNeeded(supabase, user.id, url.origin).catch((error) => {
			console.error('Background webhook check failed:', error);
		});
	}

	// Run all remaining queries in parallel instead of sequentially/streamed.
	// Awaiting here prevents layout shifts from TrialBanner/PaymentWarning
	// appearing late on the client when streamed promises resolve.
	const [pendingInvitesResult, onboardingProgress, billingContext, agentConnectionStatus] =
		await Promise.all([
			measure('db.pending_invites', async () => {
				const cacheKey = user.id;
				const cached = getCached(pendingInvitesCache, cacheKey, nowMs);
				if (cached) return cached;

				try {
					const { data, error } = await supabase.rpc('list_pending_project_invites');
					if (error) {
						console.warn('[Layout] Failed to load pending invites:', error);
						return [] as PendingProjectInvite[];
					}
					const invites = Array.isArray(data)
						? (data as PendingProjectInvite[])
						: ([] as PendingProjectInvite[]);
					setCached(
						pendingInvitesCache,
						cacheKey,
						invites,
						PENDING_INVITES_TTL_MS,
						nowMs
					);
					return invites;
				} catch (error) {
					console.warn('[Layout] Failed to load pending invites:', error);
					return [] as PendingProjectInvite[];
				}
			}),

			completedOnboarding
				? 100
				: measure('db.onboarding_progress', async () => {
						const cacheKey = user.id;
						const cached = getCached(onboardingProgressCache, cacheKey, nowMs);
						if (cached !== null) return cached;
						if (!shouldLoadOnboardingProgress) {
							return 0;
						}
						try {
							const progress = await new OnboardingProgressService(supabase)
								.getOnboardingProgress(user.id)
								.then((data) => clampProgress(data?.progress));
							setCached(
								onboardingProgressCache,
								cacheKey,
								progress,
								ONBOARDING_PROGRESS_TTL_MS,
								nowMs
							);
							return progress;
						} catch (error) {
							console.error('Failed to load onboarding progress:', error);
							return 0;
						}
					}),

			shouldLoadBillingContext
				? measure('db.billing_context', async () => {
						const cached = getCachedBillingContext(user.id, nowMs);
						if (cached) return cached;

						try {
							const context = await fetchBillingContext(
								supabase,
								user.id,
								stripeEnabled,
								{
									consumptionGateMode: 'snapshot'
								}
							);
							const normalizedContext: BillingContext = {
								subscription: context?.subscription ?? null,
								trialStatus: context?.trialStatus ?? null,
								paymentWarnings: context?.paymentWarnings ?? [],
								isReadOnly: Boolean(context?.isReadOnly),
								consumptionGate: context?.consumptionGate ?? null,
								loading: false
							};
							setCachedBillingContext(user.id, normalizedContext, nowMs);
							return normalizedContext;
						} catch (error) {
							console.error('Failed to load billing context:', error);
							return createEmptyBillingContext(false);
						}
					})
				: createEmptyBillingContext(false),

			measure('db.agent_connections', () => hasConnectedAgents(supabase, user.id))
		]);

	return {
		...baseData,
		user,
		completedOnboarding,
		onboardingProgress,
		billingContext,
		pendingInvites: pendingInvitesResult,
		hasConnectedAgents: agentConnectionStatus
	};
};
