// apps/web/src/routes/profile/calendar/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';

// Removed - now using GoogleOAuthService.generateCalendarAuthUrl()

export const GET: RequestHandler = async ({ locals: { safeGetSession, supabase }, url }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		console.log('Loading calendar settings for user:', user.id);

		// Create OAuth service instance
		const oAuthService = new GoogleOAuthService(supabase);

		// Load calendar data in parallel
		const [calendarStatus, calendarPreferences, scheduledTasks] = await Promise.all([
			// Get calendar connection status
			oAuthService.safeGetCalendarStatus(user.id),

			// Get calendar preferences
			supabase
				.from('user_calendar_preferences')
				.select('*')
				.eq('user_id', user.id)
				.single()
				.then(({ data, error }) => {
					if (error && error.code !== 'PGRST116') {
						console.error('Error fetching calendar preferences:', error);
					}
					return (
						data || {
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
				}),

			// Get scheduled tasks only if calendar is connected
			oAuthService.safeGetCalendarStatus(user.id).then(async (status) => {
				if (!status.isConnected) return [];

				const { data, error } = await supabase
					.from('tasks')
					.select(
						`
						*,
						project:projects(name, slug),
						task_calendar_events!inner(
							calendar_event_id,
							event_link,
							event_start,
							event_end,
							last_synced_at
						)
					`
					)
					.eq('user_id', user.id)
					.not('task_calendar_events.calendar_event_id', 'is', null)
					.order('start_date', { ascending: true })
					.limit(10);

				if (error) {
					console.error('Error fetching scheduled tasks:', error);
					return [];
				}
				return data || [];
			})
		]);

		// Generate calendar auth URL, preserving optional redirect path
		const calendarRedirectUri = `${url.origin}/auth/google/calendar-callback`;
		const requestedRedirect = url.searchParams.get('redirect');
		const redirectPath =
			requestedRedirect && requestedRedirect.startsWith('/') ? requestedRedirect : undefined;
		const calendarAuthUrl = oAuthService.generateCalendarAuthUrl(calendarRedirectUri, user.id, {
			redirectPath
		});

		console.log('Calendar settings loaded successfully');

		return json({
			calendarStatus,
			calendarAuthUrl,
			calendarPreferences,
			scheduledTasks
		});
	} catch (error) {
		console.error('Error loading calendar settings:', error);
		return json(
			{
				error: error instanceof Error ? error.message : 'Failed to load calendar settings'
			},
			{ status: 500 }
		);
	}
};
