// apps/web/src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { OnboardingProgressService } from '$lib/services/onboardingProgress.service';
import { checkUserSubscription } from '$lib/utils/subscription';
import { StripeService } from '$lib/services/stripe-service';
import { checkAndRegisterWebhookIfNeeded } from '$lib/services/calendar-webhook-check';

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
			subscription: null,
			paymentWarnings: [],
			trialStatus: null,
			isReadOnly: false
		};
	}

	const subscriptionPromise = stripeEnabled
		? checkUserSubscription(supabase, user.id)
		: Promise.resolve(null);
	const trialStatusPromise = supabase
		.rpc('get_user_trial_status', { p_user_id: user.id })
		.single();

	const onboardingPromise = user.completed_onboarding
		? Promise.resolve(null)
		: new OnboardingProgressService(supabase).getOnboardingProgress(user.id).catch((error) => {
				console.error('Failed to load onboarding progress:', error);
				return null;
			});

	const [subscriptionResult, trialStatusResult, onboardingData] = await Promise.all([
		subscriptionPromise,
		trialStatusPromise,
		onboardingPromise
	]);
	const subscription = stripeEnabled ? subscriptionResult : null;

	let trialStatus = trialStatusResult?.data ?? null;
	if (trialStatusResult?.error) {
		console.error('Failed to fetch trial status:', trialStatusResult.error);
		trialStatus = null;
	}

	let paymentWarnings: any[] = [];
	if (stripeEnabled && subscription?.subscriptionStatus === 'past_due') {
		const { data: notifications, error } = await supabase
			.from('user_notifications')
			.select('*')
			.eq('user_id', user.id)
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

	checkAndRegisterWebhookIfNeeded(supabase, user.id, url.origin).catch((error) => {
		console.error('Background webhook check failed:', error);
	});

	const completedOnboarding = Boolean(user.completed_onboarding);
	const onboardingProgress = completedOnboarding
		? 100
		: Math.max(0, Math.min(100, onboardingData?.progress ?? 0));

	return {
		...baseData,
		user,
		completedOnboarding,
		onboardingProgress,
		subscription,
		paymentWarnings,
		trialStatus,
		isReadOnly: Boolean(trialStatus?.is_read_only)
	};
};
