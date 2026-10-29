// apps/web/src/lib/server/notification-preferences.ts
/**
 * Global notification preferences: one row per user plus the daily-brief event subscriptions
 * that follow it.
 *
 * Shared by the preferences API (what the browser calls after `pushManager.subscribe`) and by
 * native device registration (`/api/push/devices`), so enabling push on a phone writes exactly
 * the rows a browser subscribe does and `emit_notification_event` fans out to both.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type PreferencesTable = Database['public']['Tables']['user_notification_preferences'];

export type NotificationPreferencesRow = PreferencesTable['Row'];

/** Columns a caller may set; identity and timestamps are owned here. */
export type NotificationPreferencesInput = Omit<
	PreferencesTable['Insert'],
	'id' | 'user_id' | 'created_at' | 'updated_at'
>;

const DAILY_BRIEF_EVENT_TYPES = ['brief.completed', 'brief.failed'] as const;

/**
 * Upsert the user's global preferences and keep their brief subscriptions in step.
 *
 * A global channel change (including a push opt-in) must not overwrite an existing brief
 * opt-out; only an explicit `should_*_daily_brief` choice does. Throws the Supabase error
 * when either write fails.
 */
export async function saveNotificationPreferences(
	supabase: SupabaseClient<Database>,
	userId: string,
	input: NotificationPreferencesInput
): Promise<NotificationPreferencesRow> {
	const { should_email_daily_brief, should_sms_daily_brief, ...updates } = input;

	const updateData: PreferencesTable['Insert'] = {
		user_id: userId,
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
		.upsert(updateData, { onConflict: 'user_id' })
		.select()
		.single();

	if (error) throw error;

	const updatesDailyBrief =
		should_email_daily_brief !== undefined || should_sms_daily_brief !== undefined;
	const wantsDailyBriefNotifications = Boolean(
		data?.should_email_daily_brief ||
			data?.should_sms_daily_brief ||
			data?.push_enabled ||
			data?.in_app_enabled
	);

	const { error: subscriptionError } = await supabase.from('notification_subscriptions').upsert(
		DAILY_BRIEF_EVENT_TYPES.map((eventType) => ({
			user_id: userId,
			event_type: eventType,
			is_active: wantsDailyBriefNotifications,
			admin_only: false,
			updated_at: new Date().toISOString(),
			created_by: userId
		})),
		{
			onConflict: 'user_id,event_type',
			ignoreDuplicates: !updatesDailyBrief
		}
	);

	if (subscriptionError) {
		throw subscriptionError;
	}

	return data;
}
