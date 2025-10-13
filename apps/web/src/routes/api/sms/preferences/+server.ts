// apps/web/src/routes/api/sms/preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Default preferences structure
const DEFAULT_PREFERENCES = {
	phone_number: null,
	phone_verified: false,
	event_reminders_enabled: false,
	event_reminder_lead_time_minutes: 15,
	morning_kickoff_enabled: false,
	morning_kickoff_time: '08:00:00',
	evening_recap_enabled: false,
	urgent_alerts: false,
	quiet_hours_start: '22:00:00',
	quiet_hours_end: '08:00:00',
	timezone: null,
	opted_out: false
};

/**
 * GET /api/sms/preferences
 * Fetch SMS notification preferences for the current user
 */
export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Fetch timezone from users table (centralized source of truth)
		const { data: userData } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', user.id)
			.single();

		const { data: preferences, error } = await supabase
			.from('user_sms_preferences')
			.select('*')
			.eq('user_id', user.id)
			.maybeSingle();

		if (error) {
			console.error('Error fetching SMS preferences:', error);
			throw error;
		}

		// If no preferences exist, return defaults with timezone from users table
		if (!preferences) {
			return json({
				preferences: {
					user_id: user.id,
					...DEFAULT_PREFERENCES,
					timezone: userData?.timezone || DEFAULT_PREFERENCES.timezone
				}
			});
		}

		// Return preferences with timezone from users table (overrides preference table)
		return json({
			preferences: {
				...preferences,
				timezone: userData?.timezone || preferences.timezone
			}
		});
	} catch (error) {
		console.error('Error fetching SMS preferences:', error);
		return json({ error: 'Failed to fetch SMS preferences' }, { status: 500 });
	}
};

/**
 * PUT /api/sms/preferences
 * Update SMS notification preferences for the current user
 */
export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const {
			event_reminders_enabled,
			event_reminder_lead_time_minutes,
			morning_kickoff_enabled,
			evening_recap_enabled,
			morning_kickoff_time,
			urgent_alerts,
			quiet_hours_start,
			quiet_hours_end,
			timezone
		} = body;

		// Build update object with only provided fields
		const updateData: any = {
			user_id: user.id,
			updated_at: new Date().toISOString()
		};

		if (event_reminders_enabled !== undefined) {
			updateData.event_reminders_enabled = event_reminders_enabled;
		}
		if (event_reminder_lead_time_minutes !== undefined) {
			updateData.event_reminder_lead_time_minutes = event_reminder_lead_time_minutes;
		}
		if (morning_kickoff_enabled !== undefined) {
			updateData.morning_kickoff_enabled = morning_kickoff_enabled;
		}
		if (evening_recap_enabled !== undefined) {
			updateData.evening_recap_enabled = evening_recap_enabled;
		}
		if (morning_kickoff_time !== undefined) {
			updateData.morning_kickoff_time = morning_kickoff_time;
		}
		if (urgent_alerts !== undefined) {
			updateData.urgent_alerts = urgent_alerts;
		}
		if (quiet_hours_start !== undefined) {
			updateData.quiet_hours_start = quiet_hours_start;
		}
		if (quiet_hours_end !== undefined) {
			updateData.quiet_hours_end = quiet_hours_end;
		}
		if (timezone !== undefined) {
			updateData.timezone = timezone;

			// Also update users table (centralized source of truth)
			await supabase.from('users').update({ timezone }).eq('id', user.id);
		}

		// Use UPSERT to atomically insert or update - prevents race conditions
		// This handles the case where multiple requests try to create preferences simultaneously
		const { data: preferences, error } = await supabase
			.from('user_sms_preferences')
			.upsert(updateData, {
				onConflict: 'user_id',
				ignoreDuplicates: false
			})
			.select()
			.single();

		if (error) {
			console.error('Error updating SMS preferences:', error);
			throw error;
		}

		return json({
			success: true,
			preferences,
			message: 'SMS preferences updated successfully'
		});
	} catch (error: any) {
		console.error('Error updating SMS preferences:', error);
		return json(
			{
				success: false,
				error: error.message || 'Failed to update SMS preferences'
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/sms/preferences
 * Alias for PUT - same logic
 */
export const POST: RequestHandler = PUT;
