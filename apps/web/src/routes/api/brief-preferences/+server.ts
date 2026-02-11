// apps/web/src/routes/api/brief-preferences/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

// Default preferences
// NOTE: Brief preferences control WHEN briefs are generated.
// For notification delivery preferences (email/SMS), see user_notification_preferences.
// Timezone is now stored in users table, not here.
const DEFAULT_PREFERENCES = {
	frequency: 'daily',
	day_of_week: 1, // Monday
	time_of_day: '09:00:00',
	is_active: true
};

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Fetch timezone from users table (centralized source of truth)
		const { data: userData } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', user.id)
			.single();

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

			return ApiResponse.success({
				preferences: {
					...newPreferences,
					timezone: userData?.timezone || 'UTC'
				}
			});
		}

		// Merge timezone from users table (centralized source of truth)
		return ApiResponse.success({
			preferences: {
				...preferences,
				timezone: userData?.timezone || 'UTC'
			}
		});
	} catch (error) {
		console.error('Error fetching brief preferences:', error);
		return ApiResponse.internalError(error, 'Failed to fetch preferences');
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const body = await request.json();
		const { frequency, day_of_week, time_of_day, timezone, is_active } = body;

		// Validate input
		if (!frequency || !['daily', 'weekly'].includes(frequency)) {
			return ApiResponse.error(
				'Invalid frequency. Must be daily or weekly',
				HttpStatus.BAD_REQUEST,
				ErrorCode.INVALID_FIELD,
				{ field: 'frequency' }
			);
		}

		if (
			frequency === 'weekly' &&
			(day_of_week === null ||
				day_of_week === undefined ||
				day_of_week < 0 ||
				day_of_week > 6)
		) {
			return ApiResponse.error(
				'Invalid day_of_week. Must be 0-6 for weekly frequency',
				HttpStatus.BAD_REQUEST,
				ErrorCode.INVALID_FIELD,
				{ field: 'day_of_week' }
			);
		}

		if (!time_of_day || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(time_of_day)) {
			return ApiResponse.error(
				'Invalid time_of_day format. Use HH:MM:SS',
				HttpStatus.BAD_REQUEST,
				ErrorCode.INVALID_FIELD,
				{ field: 'time_of_day' }
			);
		}

		if (!timezone) {
			return ApiResponse.error(
				'Timezone is required',
				HttpStatus.BAD_REQUEST,
				ErrorCode.MISSING_FIELD,
				{ field: 'timezone' }
			);
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
			// Update timezone in users table (centralized source of truth)
			if (timezone) {
				await supabase.from('users').update({ timezone }).eq('id', user.id);
			}

			// Update existing preferences (timezone now stored in users table only)
			const { data, error: updateError } = await supabase
				.from('user_brief_preferences')
				.update({
					frequency,
					day_of_week: frequency === 'weekly' ? day_of_week : null,
					time_of_day,
					is_active: is_active !== undefined ? is_active : true,
					updated_at: new Date().toISOString()
				})
				.eq('user_id', user.id)
				.select()
				.single();

			preferences = data;
			error = updateError;
		} else {
			// Update timezone in users table (centralized source of truth)
			if (timezone) {
				await supabase.from('users').update({ timezone }).eq('id', user.id);
			}

			// Create new preferences (timezone now stored in users table only)
			const { data, error: createError } = await supabase
				.from('user_brief_preferences')
				.insert({
					user_id: user.id,
					frequency,
					day_of_week: frequency === 'weekly' ? day_of_week : null,
					time_of_day,
					is_active: is_active !== undefined ? is_active : true
				})
				.select()
				.single();

			preferences = data;
			error = createError;
		}

		if (error || !preferences) {
			throw error ?? new Error('Failed to save preferences');
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

		const responsePreferences = {
			...preferences,
			timezone
		};

		return ApiResponse.success(
			{
				preferences: responsePreferences
			},
			'Preferences updated successfully. New briefs will be scheduled according to your updated preferences.'
		);
	} catch (error) {
		console.error('Error updating brief preferences:', error);
		return ApiResponse.internalError(error, 'Failed to update preferences');
	}
};

export const PUT: RequestHandler = POST; // Same logic for PUT
