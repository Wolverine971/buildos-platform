// apps/web/src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { OnboardingProgressService } from '$lib/services/onboardingProgress.service';
import { StripeService } from '$lib/services/stripe-service';
import { checkAndRegisterWebhookIfNeeded } from '$lib/services/calendar-webhook-check';
import { fetchBillingContext } from '$lib/server/billing-context';

const clampProgress = (progress?: number | null) => {
	if (typeof progress !== 'number' || Number.isNaN(progress)) {
		return 0;
	}

	return Math.max(0, Math.min(100, progress));
};

const createEmptyBillingContext = (loading: boolean) => ({
	subscription: null,
	trialStatus: null,
	paymentWarnings: [],
	isReadOnly: false,
	consumptionGate: null,
	loading
});

type BillingContext = ReturnType<typeof createEmptyBillingContext>;
type CacheEntry<T> = {
	expiresAt: number;
	value: T;
};

const PENDING_INVITES_TTL_MS = 20_000;
const ONBOARDING_PROGRESS_TTL_MS = 60_000;
const BILLING_CONTEXT_TTL_MS = 20_000;
const WEBHOOK_CHECK_TTL_MS = 5 * 60_000;

const pendingInvitesCache = new Map<string, CacheEntry<unknown[]>>();
const onboardingProgressCache = new Map<string, CacheEntry<number>>();
const billingContextCache = new Map<string, CacheEntry<BillingContext>>();
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

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase, serverTiming },
	url,
	depends
}) => {
	depends('app:auth');

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
			pendingInvites: []
		};
	}

	depends('app:invites');

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
	const [pendingInvitesResult, onboardingProgress, billingContext] = await Promise.all([
		measure('db.pending_invites', async () => {
			const cacheKey = user.id;
			const cached = getCached(pendingInvitesCache, cacheKey, nowMs);
			if (cached) return cached;

			try {
				const { data, error } = await supabase.rpc('list_pending_project_invites');
				if (error) {
					console.warn('[Layout] Failed to load pending invites:', error);
					return [] as unknown[];
				}
				const invites = Array.isArray(data) ? (data as unknown[]) : ([] as unknown[]);
				setCached(pendingInvitesCache, cacheKey, invites, PENDING_INVITES_TTL_MS, nowMs);
				return invites;
			} catch (error) {
				console.warn('[Layout] Failed to load pending invites:', error);
				return [] as unknown[];
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
					const cacheKey = user.id;
					const cached = getCached(billingContextCache, cacheKey, nowMs);
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
						setCached(
							billingContextCache,
							cacheKey,
							normalizedContext,
							BILLING_CONTEXT_TTL_MS,
							nowMs
						);
						return normalizedContext;
					} catch (error) {
						console.error('Failed to load billing context:', error);
						return createEmptyBillingContext(false);
					}
				})
			: createEmptyBillingContext(false)
	]);

	return {
		...baseData,
		user,
		completedOnboarding,
		onboardingProgress,
		billingContext,
		pendingInvites: pendingInvitesResult
	};
};
