// src/routes/api/brief-preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Default preferences
const DEFAULT_PREFERENCES = {
	frequency: 'daily',
	day_of_week: 1, // Monday
	time_of_day: '09:00:00',
	timezone: 'UTC',
	is_active: true,
	email_daily_brief: false
};

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { data: preferences, error } = await supabase
			.from('user_brief_preferences')
			.select('*')
			.eq('user_id', user.id)
			.single();

		if (error && error.code !== 'PGRST116') {
			throw error;
		}

		// If no preferences exist, create default ones
		if (!preferences) {
			const { data: newPreferences, error: createError } = await supabase
				.from('user_brief_preferences')
				.insert({
					user_id: user.id,
					...DEFAULT_PREFERENCES
				})
				.select()
				.single();

			if (createError) {
				throw createError;
			}

			return json({ preferences: newPreferences });
		}

		return json({ preferences });
	} catch (error) {
		console.error('Error fetching brief preferences:', error);
		return json({ error: 'Failed to fetch preferences' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { frequency, day_of_week, time_of_day, timezone, is_active, email_daily_brief } =
			body;

		// Validate input
		if (!frequency || !['daily', 'weekly'].includes(frequency)) {
			return json({ error: 'Invalid frequency. Must be daily or weekly' }, { status: 400 });
		}

		if (
			frequency === 'weekly' &&
			(day_of_week === null ||
				day_of_week === undefined ||
				day_of_week < 0 ||
				day_of_week > 6)
		) {
			return json(
				{ error: 'Invalid day_of_week. Must be 0-6 for weekly frequency' },
				{ status: 400 }
			);
		}

		if (!time_of_day || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(time_of_day)) {
			return json({ error: 'Invalid time_of_day format. Use HH:MM:SS' }, { status: 400 });
		}

		if (!timezone) {
			return json({ error: 'Timezone is required' }, { status: 400 });
		}

		// Check if preferences exist
		const { data: existingPreferences } = await supabase
			.from('user_brief_preferences')
			.select('*')
			.eq('user_id', user.id)
			.single();

		let preferences;
		let error;

		if (existingPreferences) {
			// Update existing preferences
			const { data, error: updateError } = await supabase
				.from('user_brief_preferences')
				.update({
					frequency,
					day_of_week: frequency === 'weekly' ? day_of_week : null,
					time_of_day,
					timezone,
					is_active: is_active !== undefined ? is_active : true,
					email_daily_brief:
						email_daily_brief !== undefined
							? email_daily_brief
							: existingPreferences.email_daily_brief,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', user.id)
				.select()
				.single();

			preferences = data;
			error = updateError;
		} else {
			// Create new preferences
			const { data, error: createError } = await supabase
				.from('user_brief_preferences')
				.insert({
					user_id: user.id,
					frequency,
					day_of_week: frequency === 'weekly' ? day_of_week : null,
					time_of_day,
					timezone,
					is_active: is_active !== undefined ? is_active : true,
					email_daily_brief: email_daily_brief !== undefined ? email_daily_brief : false
				})
				.select()
				.single();

			preferences = data;
			error = createError;
		}

		if (error) {
			throw error;
		}

		// Cancel existing pending brief generation jobs and let the scheduler reschedule
		if (preferences.is_active) {
			await supabase
				.from('queue_jobs') // Updated table name
				.update({
					status: 'cancelled',
					error_message: 'Cancelled due to preference change',
					processed_at: new Date().toISOString()
				})
				.eq('user_id', user.id)
				.eq('job_type', 'generate_daily_brief') // Filter by job type
				.in('status', ['pending', 'processing']);
		}

		return json({
			preferences,
			message:
				'Preferences updated successfully. New briefs will be scheduled according to your updated preferences.'
		});
	} catch (error) {
		console.error('Error updating brief preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};

export const PUT: RequestHandler = POST; // Same logic for PUT
