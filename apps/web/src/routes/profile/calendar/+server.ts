// apps/web/src/routes/profile/calendar/+server.ts
import type { RequestHandler } from './$types';
import { GoogleOAuthService } from '$lib/services/google-oauth-service';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { ApiResponse } from '$lib/utils/api-response';
import { logRouteError, routeErrorResponse } from '$lib/server/route-error';

// Removed - now using GoogleOAuthService.generateCalendarAuthUrl()

function getSafeRedirectPath(candidate: string | null, origin: string): string | undefined {
	if (!candidate) return undefined;

	try {
		const redirectUrl = new URL(candidate, origin);
		if (redirectUrl.origin !== origin) return undefined;
		return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
	} catch {
		return undefined;
	}
}

export const GET: RequestHandler = async (event) => {
	const {
		locals: { safeGetSession, supabase },
		url
	} = event;
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
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
						void logRouteError(event, error, {
							operation: 'profile_calendar.preferences',
							userId: user.id,
							severity: 'warning',
							metadata: {
								resource: 'user_calendar_preferences'
							}
						});
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
					void logRouteError(event, error, {
						operation: 'profile_calendar.resolve_actor',
						userId: user.id,
						severity: 'warning'
					});
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
						void logRouteError(event, eventsError, {
							operation: 'profile_calendar.scheduled_events',
							userId: user.id,
							severity: 'warning',
							metadata: {
								actorId
							}
						});
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
					void logRouteError(event, tasksError, {
						operation: 'profile_calendar.scheduled_tasks',
						userId: user.id,
						severity: 'warning',
						metadata: {
							actorId,
							taskCount: taskIds.length
						}
					});
					return [];
				}
				if (projectsError) {
					void logRouteError(event, projectsError, {
						operation: 'profile_calendar.scheduled_projects',
						userId: user.id,
						severity: 'warning',
						metadata: {
							projectCount: projectIds.length
						}
					});
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
		const redirectPath = getSafeRedirectPath(url.searchParams.get('redirect'), url.origin);
		const calendarAuthUrl = oAuthService.generateCalendarAuthUrl(calendarRedirectUri, user.id, {
			redirectPath
		});

		return ApiResponse.success({
			calendarStatus,
			calendarAuthUrl,
			calendarPreferences,
			scheduledTasks
		});
	} catch (error) {
		return routeErrorResponse(event, error, {
			operation: 'profile_calendar.load',
			userId: user.id,
			message: error instanceof Error ? error.message : 'Failed to load calendar settings',
			metadata: {
				redirect: url.searchParams.get('redirect')
			}
		});
	}
};
