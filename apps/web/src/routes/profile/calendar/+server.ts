// apps/web/src/routes/profile/calendar/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

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

		const calendarStatusPromise = oAuthService.safeGetCalendarStatus(user.id);

		// Load calendar data in parallel
		const [calendarStatus, calendarPreferences, scheduledTasks] = await Promise.all([
			calendarStatusPromise,

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

			// Get scheduled ontology tasks only if calendar is connected
			calendarStatusPromise.then(async (status) => {
				if (!status.isConnected) return [];

				let actorId: string;
				try {
					actorId = await ensureActorId(supabase, user.id);
				} catch (error) {
					console.error('Error resolving actor for scheduled tasks:', error);
					return [];
				}

				const { data: events, error: eventsError } = await supabase
					.from('onto_events')
					.select(
						'id, owner_entity_id, project_id, start_at, end_at, external_link, last_synced_at'
					)
					.eq('created_by', actorId)
					.eq('owner_entity_type', 'task')
					.is('deleted_at', null)
					.gte('start_at', new Date().toISOString())
					.order('start_at', { ascending: true })
					.limit(10);

				if (eventsError || !events?.length) {
					if (eventsError) {
						console.error('Error fetching scheduled ontology events:', eventsError);
					}
					return [];
				}

				const taskIds = Array.from(
					new Set(events.map((event) => event.owner_entity_id).filter(Boolean))
				) as string[];
				const projectIds = Array.from(
					new Set(events.map((event) => event.project_id).filter(Boolean))
				) as string[];

				const [
					{ data: tasks, error: tasksError },
					{ data: projects, error: projectsError }
				] = await Promise.all([
					taskIds.length > 0
						? supabase
								.from('onto_tasks')
								.select('id, title, start_at, project_id')
								.in('id', taskIds)
								.is('deleted_at', null)
						: Promise.resolve({ data: [], error: null }),
					projectIds.length > 0
						? supabase.from('onto_projects').select('id, name').in('id', projectIds)
						: Promise.resolve({ data: [], error: null })
				]);

				if (tasksError) {
					console.error('Error fetching scheduled ontology tasks:', tasksError);
					return [];
				}
				if (projectsError) {
					console.error('Error fetching scheduled ontology projects:', projectsError);
				}

				const taskMap = new Map((tasks ?? []).map((task) => [task.id, task]));
				const projectMap = new Map(
					(projects ?? []).map((project) => [project.id, project])
				);

				return events
					.map((event) => {
						if (!event.owner_entity_id) return null;
						const task = taskMap.get(event.owner_entity_id);
						if (!task) return null;
						const project = task.project_id ? projectMap.get(task.project_id) : null;

						return {
							id: task.id,
							title: task.title,
							start_date: task.start_at,
							project: {
								name: project?.name ?? 'Untitled Project',
								slug: null
							},
							task_calendar_events: [
								{
									calendar_event_id: event.id,
									event_link: event.external_link,
									event_start: event.start_at,
									event_end: event.end_at,
									last_synced_at: event.last_synced_at
								}
							]
						};
					})
					.filter(Boolean);
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
