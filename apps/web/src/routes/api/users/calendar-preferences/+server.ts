// apps/web/src/routes/api/users/calendar-preferences/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { parseJsonRequest } from '$lib/utils/request-validation';

const calendarPreferenceUpdateSchema = z
	.object({
		work_start_time: z.string().optional(),
		work_end_time: z.string().optional(),
		working_days: z.array(z.number().int().min(0).max(6)).optional(),
		default_task_duration_minutes: z.number().int().positive().optional(),
		min_task_duration_minutes: z.number().int().positive().optional(),
		max_task_duration_minutes: z.number().int().positive().optional(),
		exclude_holidays: z.boolean().optional(),
		holiday_country_code: z.string().optional(),
		timezone: z.string().optional(),
		prefer_morning_for_important_tasks: z.boolean().optional(),
		show_events: z.boolean().optional(),
		show_task_scheduled: z.boolean().optional(),
		show_task_start: z.boolean().optional(),
		show_task_due: z.boolean().optional()
	})
	.strict();

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		// Fetch timezone from users table (centralized source of truth)
		const { data: userData } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', user.id)
			.single();

		const { data: preferences, error } = await supabase
			.from('user_calendar_preferences')
			.select('*')
			.eq('user_id', user.id)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 = no rows returned
			console.error('Error fetching calendar preferences:', error);
			return ApiResponse.internalError(error, 'Failed to fetch preferences');
		}

		// Default preferences with timezone from users table (centralized source of truth)
		const defaultPreferences = {
			work_start_time: '09:00',
			work_end_time: '17:00',
			working_days: [1, 2, 3, 4, 5],
			default_task_duration_minutes: 60,
			min_task_duration_minutes: 30,
			max_task_duration_minutes: 240,
			exclude_holidays: true,
			holiday_country_code: 'US',
			timezone: userData?.timezone || 'America/New_York',
			prefer_morning_for_important_tasks: false,
			show_events: true,
			show_task_scheduled: true,
			show_task_start: true,
			show_task_due: true
		};

		const timezone = userData?.timezone || 'America/New_York';
		const mergedPreferences = {
			...defaultPreferences,
			...(preferences ?? {}),
			timezone
		};

		// Return preferences with timezone from users table (centralized source of truth)
		return ApiResponse.success(mergedPreferences);
	} catch (error) {
		console.error('Error in calendar preferences GET:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Internal server error'
		);
	}
};

export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Unauthorized');
		}

		const parsed = await parseJsonRequest(request, calendarPreferenceUpdateSchema);
		if (!parsed.ok) return parsed.response;
		const updates = parsed.data;

		// Validate working days
		if (updates.working_days && !Array.isArray(updates.working_days)) {
			return ApiResponse.badRequest('working_days must be an array');
		}

		// Validate time format
		const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
		if (updates.work_start_time && !timeRegex.test(updates.work_start_time)) {
			return ApiResponse.badRequest('Invalid work_start_time format');
		}
		if (updates.work_end_time && !timeRegex.test(updates.work_end_time)) {
			return ApiResponse.badRequest('Invalid work_end_time format');
		}

		// Validate duration limits
		if (updates.min_task_duration_minutes && updates.min_task_duration_minutes < 15) {
			return ApiResponse.badRequest('Minimum task duration must be at least 15 minutes');
		}
		if (updates.max_task_duration_minutes && updates.max_task_duration_minutes > 480) {
			return ApiResponse.badRequest('Maximum task duration cannot exceed 8 hours');
		}

		// If timezone is being updated, update users table (centralized source of truth)
		if (updates.timezone) {
			await supabase.from('users').update({ timezone: updates.timezone }).eq('id', user.id);
			// Remove timezone from updates since it's not stored in user_calendar_preferences
			delete updates.timezone;
		}

		// Upsert preferences (timezone now stored in users table only)
		const { data, error } = await supabase
			.from('user_calendar_preferences')
			.upsert({
				user_id: user.id,
				...updates,
				updated_at: new Date().toISOString()
			})
			.select()
			.single();

		if (error) {
			console.error('Error updating calendar preferences:', error);
			return ApiResponse.internalError(error, 'Failed to update preferences');
		}

		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error in calendar preferences PUT:', error);
		return ApiResponse.internalError(
			error,
			error instanceof Error ? error.message : 'Internal server error'
		);
	}
};
