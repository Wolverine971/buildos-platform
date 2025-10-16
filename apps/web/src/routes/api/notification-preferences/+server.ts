// apps/web/src/routes/api/notification-preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET: Get user notification preferences
 *
 * Returns global user preferences (one row per user)
 * Query params:
 * - ?daily_brief=true - Get daily brief preferences only (should_email_daily_brief, should_sms_daily_brief)
 * - No params - Get all global preferences
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const dailyBrief = url.searchParams.get('daily_brief') === 'true';

		// Get user's global notification preferences
		const { data, error } = await supabase
			.from('user_notification_preferences')
			.select(
				dailyBrief ? 'should_email_daily_brief, should_sms_daily_brief, updated_at' : '*'
			)
			.eq('user_id', user.id)
			.maybeSingle();

		if (error) throw error;

		// Return defaults if no preferences set yet
		if (!data && dailyBrief) {
			return json({
				preferences: {
					should_email_daily_brief: false,
					should_sms_daily_brief: false
				}
			});
		}

		return json({ preferences: data });
	} catch (error) {
		console.error('Error fetching notification preferences:', error);
		return json({ error: 'Failed to fetch preferences' }, { status: 500 });
	}
};

/**
 * PUT: Update or create user notification preferences
 *
 * Body: Global notification preferences for the user
 * Examples:
 * - { should_email_daily_brief: true, should_sms_daily_brief: false }
 * - { push_enabled: true, email_enabled: false, sms_enabled: true }
 */
export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { should_email_daily_brief, should_sms_daily_brief, ...updates } = body;

		// Validate phone number if enabling SMS (either daily brief or general SMS)
		if (should_sms_daily_brief === true || updates.sms_enabled === true) {
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

		// Check if user's brief generation is active (for daily brief preferences)
		if (should_email_daily_brief || should_sms_daily_brief) {
			const { data: briefPrefs, error: briefError } = await supabase
				.from('user_brief_preferences')
				.select('is_active')
				.eq('user_id', user.id)
				.single();

			if (briefError && briefError.code !== 'PGRST116') {
				throw new Error(`Failed to check brief preferences: ${briefError.message}`);
			}

			if (!briefPrefs?.is_active) {
				return json(
					{
						error: 'Daily brief generation is not active. Enable brief generation in Brief Preferences first.',
						requiresBriefActivation: true
					},
					{ status: 400 }
				);
			}
		}

		// Build update object for global preferences
		const updateData: Record<string, any> = {
			user_id: user.id,
			updated_at: new Date().toISOString(),
			...updates
		};

		if (should_email_daily_brief !== undefined) {
			updateData.should_email_daily_brief = should_email_daily_brief;
		}

		if (should_sms_daily_brief !== undefined) {
			updateData.should_sms_daily_brief = should_sms_daily_brief;
		}

		// Upsert global user preferences (one row per user)
		const { data, error } = await supabase
			.from('user_notification_preferences')
			.upsert(updateData, {
				onConflict: 'user_id'
			})
			.select()
			.single();

		if (error) throw error;

		return json({ success: true, preference: data });
	} catch (error) {
		console.error('Error updating notification preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};
