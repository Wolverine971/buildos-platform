// apps/web/src/routes/api/notification-preferences/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

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
		return ApiResponse.unauthorized();
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
			return ApiResponse.success({
				preferences: {
					should_email_daily_brief: false,
					should_sms_daily_brief: false
				}
			});
		}

		return ApiResponse.success({ preferences: data });
	} catch (error) {
		console.error('Error fetching notification preferences:', error);
		return ApiResponse.internalError(error, 'Failed to fetch preferences');
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
		return ApiResponse.unauthorized();
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
				return ApiResponse.error(
					'Phone number required',
					HttpStatus.BAD_REQUEST,
					ErrorCode.MISSING_FIELD,
					{ requiresPhoneSetup: true }
				);
			}

			if (!smsPrefs?.phone_verified) {
				return ApiResponse.error(
					'Phone number not verified',
					HttpStatus.BAD_REQUEST,
					ErrorCode.INVALID_FIELD,
					{ requiresPhoneVerification: true }
				);
			}

			if (smsPrefs?.opted_out) {
				return ApiResponse.error(
					'You have opted out of SMS notifications',
					HttpStatus.BAD_REQUEST,
					ErrorCode.FORBIDDEN,
					{ requiresOptIn: true }
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
				return ApiResponse.error(
					'Daily brief generation is not active. Enable brief generation in Brief Preferences first.',
					HttpStatus.BAD_REQUEST,
					ErrorCode.INVALID_FIELD,
					{ requiresBriefActivation: true }
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

		// Ensure daily brief subscriptions are explicitly opted in/out
		// A user is considered opted-in if any daily brief channel is enabled
		const wantsDailyBriefNotifications = Boolean(
			data?.should_email_daily_brief ||
				data?.should_sms_daily_brief ||
				data?.push_enabled ||
				data?.in_app_enabled
		);

		const { error: subscriptionError } = await supabase
			.from('notification_subscriptions')
			.upsert(
				['brief.completed', 'brief.failed'].map((eventType) => ({
					user_id: user.id,
					event_type: eventType,
					is_active: wantsDailyBriefNotifications,
					admin_only: false,
					updated_at: new Date().toISOString(),
					created_by: user.id
				})),
				{
					onConflict: 'user_id,event_type'
				}
			);

		if (subscriptionError) {
			throw subscriptionError;
		}

		return ApiResponse.success(
			{ preference: data },
			'Notification preferences updated successfully'
		);
	} catch (error) {
		console.error('Error updating notification preferences:', error);
		return ApiResponse.internalError(error, 'Failed to update preferences');
	}
};
