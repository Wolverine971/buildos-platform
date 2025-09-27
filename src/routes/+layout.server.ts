// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { OnboardingProgressService } from '$lib/services/onboardingProgress.service';
import { checkUserSubscription } from '$lib/utils/subscription';
import { StripeService } from '$lib/services/stripe-service';
import { isInTrial, isInGracePeriod, isTrialExpired } from '$lib/config/trial';
import { checkAndRegisterWebhookIfNeeded } from '$lib/services/calendar-webhook-check';

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase },
	cookies,
	url,
	depends
}) => {
	// Track dependencies for more granular invalidation
	depends('app:auth');

	const { user } = await safeGetSession();

	// Base data that's always returned
	const baseData = {
		url: url.origin,
		cookies: cookies.getAll(),
		stripeEnabled: StripeService.isEnabled()
	};

	// Early return for non-authenticated users
	if (!user) {
		return {
			...baseData,
			user: null,
			completedOnboarding: true,
			onboardingProgress: 100,
			onboardingProgressData: null, // Don't send unnecessary data
			subscription: null,
			paymentWarnings: [],
			trialStatus: null,
			isReadOnly: false
		};
	}

	// Check subscription status
	const subscription = await checkUserSubscription(supabase, user.id);

	// Get trial status
	const { data: trialStatus } = await supabase
		.rpc('get_user_trial_status', { p_user_id: user.id })
		.single();

	// Determine if user is in read-only mode
	const isReadOnly = trialStatus?.is_read_only || false;

	// Check and register calendar webhook if needed (for users who connected before webhooks were added)
	// This runs asynchronously to not block page load
	checkAndRegisterWebhookIfNeeded(supabase, user.id, url.origin).catch((error) => {
		console.error('Background webhook check failed:', error);
	});

	// Check for active payment warnings
	let paymentWarnings = [];
	if (StripeService.isEnabled() && subscription?.subscriptionStatus === 'past_due') {
		const { data: notifications } = await supabase
			.from('user_notifications')
			.select('*')
			.eq('user_id', user.id)
			.eq('type', 'payment_warning')
			.is('read_at', null)
			.is('dismissed_at', null)
			.or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
			.order('created_at', { ascending: false });

		paymentWarnings = notifications || [];
	}

	// OPTIMIZATION: Only load onboarding data if user hasn't completed onboarding
	// This reduces database calls for most users
	if (user.completed_onboarding) {
		return {
			...baseData,
			user,
			completedOnboarding: true,
			onboardingProgress: 100,
			onboardingProgressData: {
				completed: true,
				progress: 100,
				missingFields: [],
				completedFields: [],
				missingRequiredFields: [],
				categoryProgress: {}
			},
			subscription,
			paymentWarnings,
			trialStatus,
			isReadOnly
		};
	}

	// Only fetch detailed onboarding progress for users who need it
	try {
		const progressService = new OnboardingProgressService(supabase);
		const progressData = await progressService.getOnboardingProgress(user.id);

		const normalizedProgress = Math.max(0, Math.min(100, progressData.progress || 0));

		return {
			...baseData,
			user,
			completedOnboarding: false,
			onboardingProgress: normalizedProgress,
			onboardingProgressData: progressData,
			subscription,
			paymentWarnings,
			trialStatus,
			isReadOnly
		};
	} catch (err) {
		// Error loading onboarding progress - fail gracefully
		return {
			...baseData,
			user,
			completedOnboarding: false,
			onboardingProgress: 0,
			onboardingProgressData: {
				completed: false,
				progress: 0,
				missingFields: [],
				completedFields: [],
				missingRequiredFields: [],
				categoryProgress: {}
			},
			subscription,
			paymentWarnings,
			trialStatus,
			isReadOnly
		};
	}
};
