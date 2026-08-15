// apps/web/src/routes/profile/+page.server.ts
import { redirect, fail, Actions, type RequestEvent } from '@sveltejs/kit';
import { CalendarService } from '$lib/services/calendar-service';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { StripeService } from '$lib/services/stripe-service';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { CalendarDisconnectService } from '$lib/services/calendar-disconnect-service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Database } from '@buildos/shared-types';

// Type for subscription details
type SubscriptionDetails = {
	subscription: Database['public']['Tables']['customer_subscriptions']['Row'] & {
		subscription_plans: Database['public']['Tables']['subscription_plans']['Row'] | null;
	};
	invoices: Database['public']['Tables']['invoices']['Row'][];
};

// Type for page load return
type PageLoadReturn = {
	user: any;
	userContext: Database['public']['Tables']['user_context']['Row'] | null;
	progressData: {
		completed: boolean;
		progress: number;
		missingFields: string[];
		completedFields: string[];
		missingRequiredFields: string[];
		categoryProgress: Record<string, boolean>;
		categoryCompletion: Record<string, boolean>;
		missingCategories: string[];
	};
	completedOnboarding: boolean;
	isAdmin: boolean;
	voiceNarrationEnabled: boolean;
	justCompletedOnboarding: boolean;
	activeTab: string;
	subscriptionDetails: SubscriptionDetails | null;
	stripeEnabled: boolean;
};

function getCalendarReturnPath(): string {
	return '/profile?tab=calendar&calendar=1';
}

function getActiveProfileTab(requestedTab: string | null, stripeEnabled: boolean): string {
	const validTabs = new Set([
		'account',
		'contacts',
		'preferences',
		'briefs',
		'calendar',
		'email',
		'notifications',
		'agent-keys',
		...(stripeEnabled ? ['billing'] : [])
	]);

	return requestedTab && validTabs.has(requestedTab) ? requestedTab : 'account';
}

export const load = async (event: RequestEvent): Promise<PageLoadReturn> => {
	const {
		locals: { safeGetSession, supabase },
		url
	} = event;
	const { user } = await safeGetSession();

	if (!user) {
		throw redirect(303, '/auth/login');
	}

	const stripeEnabled = StripeService.isEnabled();

	// Load core profile data (not calendar data - that's loaded lazily).
	// Progress is computed inline from userContext below, so we don't need to
	// fetch it via OnboardingProgressService (would duplicate the user_context
	// query).
	const [userContext, userData, subscription] = await Promise.all([
		// Get user context
		supabase
			.from('user_context')
			.select('*')
			.eq('user_id', user.id)
			.single()
			.then(({ data, error }) => {
				if (error && error.code !== 'PGRST116') {
					console.error('Error fetching user context:', error);
				}
				return data;
			}),

		// Get user metadata
		supabase
			.from('users')
			.select('onboarding_completed_at, is_admin, voice_narration_enabled')
			.eq('id', user.id)
			.single()
			.then(({ data, error }) => {
				if (error) {
					console.error('Error fetching user data:', error);
					return {
						onboarding_completed_at: null,
						is_admin: false,
						voice_narration_enabled: false
					};
				}
				return (
					data || {
						onboarding_completed_at: null,
						is_admin: false,
						voice_narration_enabled: false
					}
				);
			}),

		// Get active subscription (only when Stripe is enabled)
		stripeEnabled
			? (
					supabase.from('customer_subscriptions').select(
						`
						*,
						subscription_plans (
							name,
							description,
							price,
							currency,
							interval,
							interval_count
						)
					`
					) as any
				)
					.eq('user_id', user.id)
					.order('created_at', { ascending: false })
					.limit(1)
					.maybeSingle()
					.then(({ data }: { data: any }) => data ?? null)
			: Promise.resolve(null)
	]);

	// Check if coming from completed onboarding
	const justCompletedOnboarding = url.searchParams.get('onboarding') === 'complete';

	// Get active tab from URL params
	const activeTab = getActiveProfileTab(url.searchParams.get('tab'), stripeEnabled);

	// Fetch recent invoices once we have the subscription id.
	let subscriptionDetails: SubscriptionDetails | null = null;
	if (subscription) {
		const { data: invoices } = await supabase
			.from('invoices')
			.select('*')
			.eq('subscription_id', subscription.id as string)
			.order('created_at', { ascending: false })
			.limit(10);

		subscriptionDetails = {
			subscription: subscription as SubscriptionDetails['subscription'],
			invoices: (invoices || []) as SubscriptionDetails['invoices']
		};
	}

	// Onboarding completion is derived from users.onboarding_completed_at.
	// Fall back to the already-loaded session user so a duplicate users lookup
	// cannot disagree with the root layout/nav state.
	const completedOnboarding = Boolean(
		userData.onboarding_completed_at ?? user.onboarding_completed_at
	);

	const completedCategoryCompletion: Record<string, boolean> = {
		projects: true,
		work_style: true,
		challenges: true,
		help_focus: true
	};

	// Enhanced progress data calculation for new structure
	const categoryCompletion: Record<string, boolean> = {
		projects: !!userContext?.input_projects?.trim(),
		work_style: !!userContext?.input_work_style?.trim(),
		challenges: !!userContext?.input_challenges?.trim(),
		help_focus: !!userContext?.input_help_focus?.trim()
	};

	const effectiveCategoryCompletion = completedOnboarding
		? completedCategoryCompletion
		: categoryCompletion;

	const missingCategoriesArray = completedOnboarding
		? []
		: ['projects', 'work_style', 'challenges', 'help_focus'].filter((category) => {
				const inputField = `input_${category}`;
				const value = (userContext as Record<string, any> | null)?.[inputField];
				return !(value && typeof value === 'string' && (value as string).trim().length > 0);
			});

	const progressPercentage = completedOnboarding
		? 100
		: userContext
			? Math.round((Object.values(categoryCompletion).filter(Boolean).length / 4) * 100)
			: 0;

	const enhancedProgressData = {
		completed: completedOnboarding,
		progress: progressPercentage,
		missingFields: missingCategoriesArray,
		completedFields: Object.keys(effectiveCategoryCompletion).filter(
			(cat) => effectiveCategoryCompletion[cat]
		),
		missingRequiredFields: missingCategoriesArray.filter((cat) =>
			['projects', 'work_style', 'challenges'].includes(cat)
		),
		categoryProgress: effectiveCategoryCompletion as Record<string, boolean>,
		categoryCompletion: effectiveCategoryCompletion,
		missingCategories: missingCategoriesArray
	};

	return {
		user,
		userContext,
		progressData: enhancedProgressData,
		completedOnboarding,
		isAdmin: userData.is_admin ?? user.is_admin ?? false,
		voiceNarrationEnabled: userData.voice_narration_enabled ?? false,
		justCompletedOnboarding,
		activeTab, // Pass the active tab to the client
		subscriptionDetails,
		stripeEnabled
	};
};

export const actions: Actions = {
	// Connect calendar action
	connectCalendar: async ({ locals: { safeGetSession, supabase }, url }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			console.log('Initiating calendar connection for user:', user.id);

			// Generate the enhanced auth URL
			const calendarRedirectUri = `${url.origin}/auth/google/calendar-callback`;
			const calendarAuthUrl = new GoogleOAuthService(supabase).generateCalendarAuthUrl(
				calendarRedirectUri,
				user.id,
				{ redirectPath: getCalendarReturnPath() }
			);

			console.log('Redirecting to Google OAuth with enhanced scopes');
			throw redirect(303, calendarAuthUrl);
		} catch (error) {
			if (error instanceof Response) {
				// This is a redirect, re-throw it
				throw error;
			}

			console.error('Error initiating calendar connection:', error);
			return fail(500, {
				error:
					error instanceof Error
						? error.message
						: 'Failed to initiate calendar connection'
			});
		}
	},

	// Update calendar preferences
	updateCalendarPreferences: async ({ request, locals: { supabase, safeGetSession } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();

			// Parse working days from form data
			const workingDays = formData.getAll('working_days').map(Number);

			const preferences = {
				user_id: user.id,
				work_start_time: formData.get('work_start_time') as string,
				work_end_time: formData.get('work_end_time') as string,
				working_days: workingDays,
				default_task_duration_minutes: parseInt(
					formData.get('default_task_duration_minutes') as string
				),
				min_task_duration_minutes: parseInt(
					formData.get('min_task_duration_minutes') as string
				),
				max_task_duration_minutes: parseInt(
					formData.get('max_task_duration_minutes') as string
				),
				exclude_holidays: formData.get('exclude_holidays') === 'on',
				holiday_country_code: formData.get('holiday_country_code') as string,
				timezone: formData.get('timezone') as string,
				prefer_morning_for_important_tasks:
					formData.get('prefer_morning_for_important_tasks') === 'on',
				updated_at: new Date().toISOString()
			};

			console.log('Updating calendar preferences for user:', user.id);

			const { error } = await supabase
				.from('user_calendar_preferences')
				.upsert(preferences, { onConflict: 'user_id' });

			if (error) {
				throw error;
			}

			console.log('Calendar preferences updated successfully');
			return { success: true, calendarPreferencesUpdated: true };
		} catch (error) {
			console.error('Error updating calendar preferences:', error);
			return fail(500, {
				error:
					error instanceof Error ? error.message : 'Failed to update calendar preferences'
			});
		}
	},

	// Disconnect calendar action
	disconnectCalendar: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			// Get the removeData parameter from the form
			const formData = await request.formData();
			const removeData = formData.get('removeData') === 'true';

			// Unregister webhook first
			const webhookService = new CalendarWebhookService(createAdminSupabaseClient());
			await webhookService.unregisterWebhook(user.id, 'primary');

			// Optionally remove calendar data
			if (removeData) {
				const disconnectService = new CalendarDisconnectService(supabase);
				await disconnectService.removeCalendarData(user.id);
			}

			// Then disconnect calendar
			// GoogleOAuthService removes service-only legacy webhook state as part of
			// the disconnect, so this server-validated user action needs the admin client.
			const calendarService = new CalendarService(createAdminSupabaseClient());
			await calendarService.disconnectCalendar(user.id);

			const activityLogger = new ActivityLogger(supabase);

			// Log the manual disconnection
			await activityLogger.logActivity(user.id, 'admin_action', {
				action: 'calendar_manually_disconnected',
				data_removed: removeData,
				timestamp: new Date().toISOString()
			});

			return {
				success: true,
				calendarDisconnected: true,
				dataRemoved: removeData
			};
		} catch (error) {
			console.error('Error disconnecting calendar:', error);
			return fail(500, { error: 'Failed to disconnect calendar' });
		}
	},

	// Reconnect calendar action
	reconnectCalendar: async ({ locals: { safeGetSession, supabase }, url }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			console.log('Reconnecting calendar with enhanced permissions for user:', user.id);

			// First disconnect existing connection
			// Keep reconnect cleanup on the same service-only path as disconnect.
			const calendarService = new CalendarService(createAdminSupabaseClient());
			await calendarService.disconnectCalendar(user.id);

			// Then redirect to new OAuth flow with enhanced scopes
			const calendarRedirectUri = `${url.origin}/auth/google/calendar-callback`;
			const calendarAuthUrl = new GoogleOAuthService(supabase).generateCalendarAuthUrl(
				calendarRedirectUri,
				user.id,
				{ redirectPath: getCalendarReturnPath() }
			);

			console.log('Redirecting to Google OAuth for reconnection');
			throw redirect(303, calendarAuthUrl);
		} catch (error) {
			if (error instanceof Response) {
				// This is a redirect, re-throw it
				throw error;
			}

			console.error('Error reconnecting calendar:', error);
			return fail(500, {
				error: error instanceof Error ? error.message : 'Failed to reconnect calendar'
			});
		}
	}
};
