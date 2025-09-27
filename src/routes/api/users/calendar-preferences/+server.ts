// src/routes/api/users/calendar-preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { data: preferences, error } = await supabase
			.from('user_calendar_preferences')
			.select('*')
			.eq('user_id', user.id)
			.single();

		if (error && error.code !== 'PGRST116') {
			// PGRST116 = no rows returned
			console.error('Error fetching calendar preferences:', error);
			return json({ error: 'Failed to fetch preferences' }, { status: 500 });
		}

		// Return preferences or defaults
		return json(
			preferences || {
				work_start_time: '09:00',
				work_end_time: '17:00',
				working_days: [1, 2, 3, 4, 5],
				default_task_duration_minutes: 60,
				min_task_duration_minutes: 30,
				max_task_duration_minutes: 240,
				exclude_holidays: true,
				holiday_country_code: 'US',
				timezone: 'America/New_York',
				prefer_morning_for_important_tasks: false
			}
		);
	} catch (error) {
		console.error('Error in calendar preferences GET:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};

export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const updates = await request.json();

		// Validate working days
		if (updates.working_days && !Array.isArray(updates.working_days)) {
			return json({ error: 'working_days must be an array' }, { status: 400 });
		}

		// Validate time format
		const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
		if (updates.work_start_time && !timeRegex.test(updates.work_start_time)) {
			return json({ error: 'Invalid work_start_time format' }, { status: 400 });
		}
		if (updates.work_end_time && !timeRegex.test(updates.work_end_time)) {
			return json({ error: 'Invalid work_end_time format' }, { status: 400 });
		}

		// Validate duration limits
		if (updates.min_task_duration_minutes && updates.min_task_duration_minutes < 15) {
			return json(
				{ error: 'Minimum task duration must be at least 15 minutes' },
				{ status: 400 }
			);
		}
		if (updates.max_task_duration_minutes && updates.max_task_duration_minutes > 480) {
			return json({ error: 'Maximum task duration cannot exceed 8 hours' }, { status: 400 });
		}

		// Upsert preferences
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
			return json({ error: 'Failed to update preferences' }, { status: 500 });
		}

		return json(data);
	} catch (error) {
		console.error('Error in calendar preferences PUT:', error);
		return json(
			{ error: error instanceof Error ? error.message : 'Internal server error' },
			{ status: 500 }
		);
	}
};
