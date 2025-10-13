// apps/web/src/routes/api/notification-preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET: Get user notification preferences
 *
 * Query params:
 * - ?event_type=brief.completed - Get event-based preferences for a specific event
 * - ?daily_brief=true - Get user-level daily brief preferences (should_email_daily_brief, should_sms_daily_brief)
 * - No params - Get all event-based preferences
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const eventType = url.searchParams.get('event_type');
		const dailyBrief = url.searchParams.get('daily_brief') === 'true';

		// Special handling for daily brief preferences
		if (dailyBrief) {
			const { data, error } = await supabase
				.from('user_notification_preferences')
				.select('should_email_daily_brief, should_sms_daily_brief, updated_at')
				.eq('user_id', user.id)
				.eq('event_type', 'user')
				.maybeSingle();

			if (error) throw error;

			// Return defaults if no preferences set yet
			return json({
				preferences: data || {
					should_email_daily_brief: false,
					should_sms_daily_brief: false
				}
			});
		}

		// Original event-based preference handling
		let query = supabase
			.from('user_notification_preferences')
			.select('*')
			.eq('user_id', user.id);

		if (eventType) {
			query = query.eq('event_type', eventType);
		}

		const { data, error } = await query;

		if (error) throw error;

		return json({ preferences: data });
	} catch (error) {
		console.error('Error fetching notification preferences:', error);
		return json({ error: 'Failed to fetch preferences' }, { status: 500 });
	}
};

/**
 * PUT: Update or create user notification preferences
 *
 * For event-based preferences:
 * Body: { event_type: string, push_enabled?: boolean, email_enabled?: boolean, sms_enabled?: boolean, ... }
 *
 * For user-level daily brief preferences:
 * Body: { should_email_daily_brief?: boolean, should_sms_daily_brief?: boolean }
 * (automatically uses event_type='user' for storage)
 */
export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { event_type, should_email_daily_brief, should_sms_daily_brief, ...updates } = body;

		// Check if this is a user-level daily brief preference update
		const isDailyBriefUpdate =
			(should_email_daily_brief !== undefined || should_sms_daily_brief !== undefined) &&
			!event_type;

		if (isDailyBriefUpdate) {
			// Handle user-level daily brief preferences
			// Validate phone number if enabling SMS
			if (should_sms_daily_brief === true) {
				const { data: smsPrefs, error: smsError } = await supabase
					.from('user_sms_preferences')
					.select('phone_number, phone_verified, opted_out')
					.eq('user_id', user.id)
					.single();

				if (smsError && smsError.code !== 'PGRST116') {
					throw new Error(`Failed to check SMS preferences: ${smsError.message}`);
				}

				if (!smsPrefs?.phone_number) {
					return json(
						{ error: 'Phone number required', requiresPhoneSetup: true },
						{ status: 400 }
					);
				}

				if (!smsPrefs?.phone_verified) {
					return json(
						{ error: 'Phone number not verified', requiresPhoneVerification: true },
						{ status: 400 }
					);
				}

				if (smsPrefs?.opted_out) {
					return json(
						{ error: 'You have opted out of SMS notifications', requiresOptIn: true },
						{ status: 400 }
					);
				}
			}

			// Check if user's brief generation is active
			const { data: briefPrefs, error: briefError } = await supabase
				.from('user_brief_preferences')
				.select('is_active')
				.eq('user_id', user.id)
				.single();

			if (briefError && briefError.code !== 'PGRST116') {
				throw new Error(`Failed to check brief preferences: ${briefError.message}`);
			}

			if (!briefPrefs?.is_active && (should_email_daily_brief || should_sms_daily_brief)) {
				return json(
					{
						error: 'Daily brief generation is not active. Enable brief generation in Brief Preferences first.',
						requiresBriefActivation: true
					},
					{ status: 400 }
				);
			}

			// Store user-level preferences with event_type='user'
			const dailyBriefUpdates: Record<string, any> = {
				user_id: user.id,
				event_type: 'user',
				updated_at: new Date().toISOString()
			};

			if (should_email_daily_brief !== undefined) {
				dailyBriefUpdates.should_email_daily_brief = should_email_daily_brief;
			}

			if (should_sms_daily_brief !== undefined) {
				dailyBriefUpdates.should_sms_daily_brief = should_sms_daily_brief;
			}

			const { data, error } = await supabase
				.from('user_notification_preferences')
				.upsert(dailyBriefUpdates, {
					onConflict: 'user_id,event_type'
				})
				.select()
				.single();

			if (error) throw error;

			return json({ success: true, preference: data });
		}

		// Handle event-based preferences (original behavior)
		if (!event_type) {
			return json(
				{ error: 'event_type is required for event-based preferences' },
				{ status: 400 }
			);
		}

		const { data, error } = await supabase
			.from('user_notification_preferences')
			.upsert(
				{
					user_id: user.id,
					event_type,
					...updates,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id,event_type'
				}
			)
			.select()
			.single();

		if (error) throw error;

		return json({ success: true, preference: data });
	} catch (error) {
		console.error('Error updating notification preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};
