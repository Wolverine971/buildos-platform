// apps/web/src/routes/profile/+page.server.ts
import { redirect, fail, Actions, type RequestEvent } from '@sveltejs/kit';
import { OnboardingProgressService } from '$lib/services/onboardingProgress.service';
import { CalendarService } from '$lib/services/calendar-service';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { PRIVATE_GOOGLE_CLIENT_ID } from '$env/static/private';
import { StripeService } from '$lib/services/stripe-service';
import { CalendarWebhookService } from '$lib/services/calendar-webhook-service';
import { CalendarDisconnectService } from '$lib/services/calendar-disconnect-service';
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
	projectTemplates: Database['public']['Tables']['project_brief_templates']['Row'][];
	completedOnboarding: boolean;
	isAdmin: boolean;
	justCompletedOnboarding: boolean;
	activeTab: string;
	subscriptionDetails: SubscriptionDetails | null;
	stripeEnabled: boolean;
};

// Enhanced function to generate calendar auth URL with proper scopes
function generateEnhancedCalendarAuthUrl(
	clientId: string,
	redirectUri: string,
	state: string
): string {
	// OPTIMIZED: Required scopes for calendar integration and calendar creation
	const scopes = [
		'https://www.googleapis.com/auth/calendar', // Full calendar access (includes events)
		'https://www.googleapis.com/auth/userinfo.email', // Email for user identification
		'openid' // OpenID Connect for secure identification
	].join(' ');

	const params = new URLSearchParams({
		client_id: clientId,
		response_type: 'code',
		scope: scopes,
		redirect_uri: redirectUri,
		state: state,
		access_type: 'offline', // Get refresh token
		prompt: 'consent', // Force consent to ensure refresh token
		include_granted_scopes: 'true' // Include previously granted scopes
	});

	const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

	console.log('Generated calendar auth URL with enhanced scopes:', {
		scopes,
		redirectUri,
		state
	});

	return authUrl;
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

	// Initialize services
	const progressService = new OnboardingProgressService(supabase);

	// Load core profile data (not calendar data - that's loaded lazily)
	const [userContext, progressData, projectTemplates, userData] = await Promise.all([
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

		// Get detailed progress data using updated service
		progressService.getOnboardingProgress(user.id),

		// Get project brief templates (system + user's own)
		supabase
			.from('project_brief_templates')
			.select('*')
			.or(`user_id.is.null,user_id.eq.${user.id}`)
			.order('is_default', { ascending: false })
			.order('name', { ascending: true })
			.then(({ data, error }) => {
				if (error) {
					console.error('Error fetching project templates:', error);
					return [];
				}
				return data || [];
			}),

		// Get user metadata
		supabase
			.from('users')
			.select('completed_onboarding, is_admin')
			.eq('id', user.id)
			.single()
			.then(({ data, error }) => {
				if (error) {
					console.error('Error fetching user data:', error);
					return { completed_onboarding: false, is_admin: false };
				}
				return data || { completed_onboarding: false, is_admin: false };
			})
	]);

	// Check if coming from completed onboarding
	const justCompletedOnboarding = url.searchParams.get('onboarding') === 'complete';

	// Get active tab from URL params
	const activeTab = url.searchParams.get('tab') || 'account';

	// Get subscription data if Stripe is enabled
	let subscription = null;
	let subscriptionDetails: SubscriptionDetails | null = null;
	const stripeEnabled = StripeService.isEnabled();
	if (stripeEnabled) {
		const { data: subData } = await (
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
			.single();

		subscription = subData;

		// Get payment history
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
	}

	// Calculate completion based on new 4-field structure
	let completedOnboarding = userData.completed_onboarding || false;

	if (userContext && !completedOnboarding) {
		// Check completion using new input fields
		const inputFields = [
			'input_projects',
			'input_work_style',
			'input_challenges',
			'input_help_focus'
		];

		const completedFields = inputFields.filter((field) => {
			const value = userContext[field];
			return value && typeof value === 'string' && value.trim().length > 0;
		});

		// Consider complete if at least 3 of 4 fields are filled
		completedOnboarding = completedFields.length >= 3;
	}

	// Enhanced progress data calculation for new structure
	const categoryCompletion: Record<string, boolean> = {
		projects: !!userContext?.input_projects?.trim(),
		work_style: !!userContext?.input_work_style?.trim(),
		challenges: !!userContext?.input_challenges?.trim(),
		help_focus: !!userContext?.input_help_focus?.trim()
	};

	const missingCategoriesArray = ['projects', 'work_style', 'challenges', 'help_focus'].filter(
		(category) => {
			const inputField = `input_${category}` as any;
			const value = userContext?.[inputField];
			return !(value && typeof value === 'string' && (value as string).trim().length > 0);
		}
	);

	const progressPercentage = userContext
		? Math.round((Object.values(categoryCompletion).filter(Boolean).length / 4) * 100)
		: 0;

	const enhancedProgressData = {
		completed: completedOnboarding,
		progress: progressPercentage,
		missingFields: missingCategoriesArray,
		completedFields: Object.keys(categoryCompletion).filter((cat) => categoryCompletion[cat]),
		missingRequiredFields: missingCategoriesArray.filter((cat) =>
			['projects', 'work_style', 'challenges'].includes(cat)
		),
		categoryProgress: categoryCompletion as Record<string, boolean>,
		categoryCompletion,
		missingCategories: missingCategoriesArray
	};

	return {
		user,
		userContext,
		progressData: enhancedProgressData,
		projectTemplates,
		completedOnboarding,
		isAdmin: userData.is_admin || false,
		justCompletedOnboarding,
		activeTab, // Pass the active tab to the client
		subscriptionDetails,
		stripeEnabled
	};
};

export const actions: Actions = {
	// Connect calendar action
	connectCalendar: async ({ locals: { safeGetSession }, url }) => {
		const { user } = await safeGetSession();
		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			console.log('Initiating calendar connection for user:', user.id);

			// Generate the enhanced auth URL
			const calendarRedirectUri = `${url.origin}/auth/google/calendar-callback`;
			const calendarAuthUrl = generateEnhancedCalendarAuthUrl(
				PRIVATE_GOOGLE_CLIENT_ID,
				calendarRedirectUri,
				user.id
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
			const webhookService = new CalendarWebhookService(supabase);
			await webhookService.unregisterWebhook(user.id, 'primary');

			// Optionally remove calendar data
			if (removeData) {
				const disconnectService = new CalendarDisconnectService(supabase);
				await disconnectService.removeCalendarData(user.id);
			}

			// Then disconnect calendar
			const calendarService = new CalendarService(supabase);
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
			const calendarService = new CalendarService(supabase);
			await calendarService.disconnectCalendar(user.id);

			// Then redirect to new OAuth flow with enhanced scopes
			const calendarRedirectUri = `${url.origin}/auth/google/calendar-callback`;
			const calendarAuthUrl = generateEnhancedCalendarAuthUrl(
				PRIVATE_GOOGLE_CLIENT_ID,
				calendarRedirectUri,
				user.id
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
	},

	// Create a new template
	createTemplate: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();
			const type = formData.get('type') as string;
			const name = formData.get('name') as string;
			const description = formData.get('description') as string;
			const template_content = formData.get('template_content') as string;

			if (!type || !name || !template_content || !['project'].includes(type)) {
				return fail(400, { error: 'Missing or invalid required fields' });
			}

			const tableName = 'project_brief_templates';

			// First, set all user's templates of this type to not in_use
			await supabase
				.from(tableName as any)
				.update({ in_use: false })
				.eq('user_id', user.id);

			// Create new template and set as active
			const { data: template, error } = await supabase
				.from(tableName as any)
				.insert({
					user_id: user.id,
					name: name.trim(),
					description: description?.trim() || '',
					template_content: template_content.trim(),
					in_use: true,
					is_default: false,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.select()
				.single();

			if (error) {
				console.error('Error creating template:', error);
				return fail(500, { error: 'Failed to create template' });
			}

			// Log activity
			try {
				await supabase.from('user_activity_logs' as any).insert({
					user_id: user.id,
					activity_type: 'template_created',
					metadata: {
						template_id: (template as any).id,
						template_type: type,
						template_name: (template as any).name,
						onboarding_version: '4_question_focused'
					},
					created_at: new Date().toISOString()
				});
			} catch (logError) {
				console.warn('Failed to log template creation:', logError);
			}

			return { success: true, template };
		} catch (error) {
			console.error('Error in createTemplate action:', error);
			return fail(500, { error: 'Failed to create template' });
		}
	},

	// Update an existing template
	updateTemplate: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();
			const id = formData.get('id') as string;
			const type = formData.get('type') as string;
			const name = formData.get('name') as string;
			const description = formData.get('description') as string;
			const template_content = formData.get('template_content') as string;

			if (!id || !type || !name || !template_content || !['project'].includes(type)) {
				return fail(400, { error: 'Missing or invalid required fields' });
			}

			const tableName = 'project_brief_templates';

			// Update template (only user's own templates)
			const { data: template, error } = await supabase
				.from(tableName as any)
				.update({
					name: name.trim(),
					description: description?.trim() || '',
					template_content: template_content.trim(),
					updated_at: new Date().toISOString()
				})
				.eq('id', id)
				.eq('user_id', user.id) // Security: only update user's own templates
				.select()
				.single();

			if (error) {
				console.error('Error updating template:', error);
				return fail(500, { error: 'Failed to update template' });
			}

			// Log activity
			try {
				await supabase.from('user_activity_logs' as any).insert({
					user_id: user.id,
					activity_type: 'template_updated',
					metadata: {
						template_id: id,
						template_type: type,
						template_name: (template as any).name,
						onboarding_version: '4_question_focused'
					},
					created_at: new Date().toISOString()
				});
			} catch (logError) {
				console.warn('Failed to log template update:', logError);
			}

			return { success: true, template };
		} catch (error) {
			console.error('Error in updateTemplate action:', error);
			return fail(500, { error: 'Failed to update template' });
		}
	},

	// Set a template as active (in_use)
	setActiveTemplate: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();
			const templateId = formData.get('templateId') as string;
			const type = formData.get('type') as string;

			if (!templateId || !type || !['project'].includes(type)) {
				return fail(400, { error: 'Missing or invalid required fields' });
			}

			const tableName = 'project_brief_templates';

			// First, set all user's templates of this type to not in_use
			await supabase
				.from(tableName as any)
				.update({ in_use: false })
				.eq('user_id', user.id);

			// Then set the specified template as in_use
			const { data: template, error } = await supabase
				.from(tableName as any)
				.update({ in_use: true })
				.or(
					`and(id.eq.${templateId},user_id.eq.${user.id}),and(id.eq.${templateId},user_id.is.null)`
				)
				.select()
				.single();

			if (error) {
				console.error('Error setting active template:', error);
				return fail(500, { error: 'Failed to set active template' });
			}

			// Log activity
			try {
				await supabase.from('user_activity_logs' as any).insert({
					user_id: user.id,
					activity_type: 'template_set_active',
					metadata: {
						template_id: templateId,
						template_type: type,
						template_name: template?.name,
						onboarding_version: '4_question_focused'
					},
					created_at: new Date().toISOString()
				});
			} catch (logError) {
				console.warn('Failed to log template activation:', logError);
			}

			return { success: true, template };
		} catch (error) {
			console.error('Error in setActiveTemplate action:', error);
			return fail(500, { error: 'Failed to set active template' });
		}
	},

	// Copy a template (system or user's own)
	copyTemplate: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();
			const templateId = formData.get('templateId') as string;
			const type = formData.get('type') as string;
			const name = formData.get('name') as string;

			if (!templateId || !type || !name || !['project'].includes(type)) {
				return fail(400, { error: 'Missing or invalid required fields' });
			}

			const tableName = 'project_brief_templates';

			// Get the original template
			const { data: originalTemplate, error: fetchError } = await supabase
				.from(tableName as any)
				.select('*')
				.eq('id', templateId)
				.single();

			if (fetchError || !originalTemplate) {
				return fail(404, { error: 'Template not found' });
			}

			// First, set all user's templates of this type to not in_use
			await supabase
				.from(tableName as any)
				.update({ in_use: false })
				.eq('user_id', user.id);

			// Create a copy for the user
			const { data: newTemplate, error: createError } = await supabase
				.from(tableName as any)
				.insert({
					user_id: user.id,
					name: name.trim(),
					description: (originalTemplate as any).description,
					template_content: (originalTemplate as any).template_content,
					variables: (originalTemplate as any).variables,
					in_use: true, // Set as active by default
					is_default: false,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				})
				.select()
				.single();

			if (createError) {
				console.error('Error copying template:', createError);
				return fail(500, { error: 'Failed to copy template' });
			}

			// Log activity
			try {
				await supabase.from('user_activity_logs' as any).insert({
					user_id: user.id,
					activity_type: 'template_copied',
					metadata: {
						original_template_id: templateId,
						new_template_id: newTemplate.id,
						template_type: type,
						template_name: newTemplate.name,
						onboarding_version: '4_question_focused'
					},
					created_at: new Date().toISOString()
				});
			} catch (logError) {
				console.warn('Failed to log template copy:', logError);
			}

			return { success: true, template: newTemplate };
		} catch (error) {
			console.error('Error in copyTemplate action:', error);
			return fail(500, { error: 'Failed to copy template' });
		}
	},

	// Delete a template (only user's own)
	deleteTemplate: async ({ request, locals: { safeGetSession, supabase } }) => {
		const { user } = await safeGetSession();

		if (!user) {
			return fail(401, { error: 'Unauthorized' });
		}

		try {
			const formData = await request.formData();
			const templateId = formData.get('templateId') as string;
			const type = formData.get('type') as string;

			if (!templateId || !type || !['project'].includes(type)) {
				return fail(400, { error: 'Missing or invalid required fields' });
			}

			const tableName = 'project_brief_templates';

			// Delete template (only user's own templates)
			const { error } = await supabase
				.from(tableName as any)
				.delete()
				.eq('id', templateId)
				.eq('user_id', user.id); // Security: only delete user's own templates

			if (error) {
				console.error('Error deleting template:', error);
				return fail(500, { error: 'Failed to delete template' });
			}

			// Log activity
			try {
				await supabase.from('user_activity_logs' as any).insert({
					user_id: user.id,
					activity_type: 'template_deleted',
					metadata: {
						template_id: templateId,
						template_type: type,
						onboarding_version: '4_question_focused'
					},
					created_at: new Date().toISOString()
				});
			} catch (logError) {
				console.warn('Failed to log template deletion:', logError);
			}

			return { success: true };
		} catch (error) {
			console.error('Error in deleteTemplate action:', error);
			return fail(500, { error: 'Failed to delete template' });
		}
	}
};
