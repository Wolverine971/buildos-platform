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
	loading
});

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase },
	url,
	depends
}) => {
	depends('app:auth');

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
			billingContext: createEmptyBillingContext(false)
		};
	}

	checkAndRegisterWebhookIfNeeded(supabase, user.id, url.origin).catch((error) => {
		console.error('Background webhook check failed:', error);
	});

	const completedOnboarding = Boolean(user.completed_onboarding);
	const onboardingProgressPromise = completedOnboarding
		? Promise.resolve(100)
		: new OnboardingProgressService(supabase)
				.getOnboardingProgress(user.id)
				.then((data) => clampProgress(data?.progress))
				.catch((error) => {
					console.error('Failed to load onboarding progress:', error);
					return 0;
				});

	const billingContextPromise = stripeEnabled
		? fetchBillingContext(supabase, user.id, stripeEnabled)
				.then((context) => ({
					subscription: context?.subscription ?? null,
					trialStatus: context?.trialStatus ?? null,
					paymentWarnings: context?.paymentWarnings ?? [],
					isReadOnly: Boolean(context?.isReadOnly),
					loading: false
				}))
				.catch((error) => {
					console.error('Failed to load billing context:', error);
					return createEmptyBillingContext(false);
				})
		: createEmptyBillingContext(false);

	return {
		...baseData,
		user,
		completedOnboarding,
		onboardingProgress: completedOnboarding ? 100 : onboardingProgressPromise,
		billingContext: billingContextPromise
	};
};
