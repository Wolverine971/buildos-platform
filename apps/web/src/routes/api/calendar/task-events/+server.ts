// apps/web/src/routes/api/calendar/task-events/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';

/**
 * GET /api/calendar/task-events
 *
 * Fetches calendar event IDs for scheduled tasks within a date range.
 * Used to correlate BuildOS tasks with Google Calendar events.
 */
export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	const timeMin = url.searchParams.get('timeMin');
	const timeMax = url.searchParams.get('timeMax');

	if (!timeMin || !timeMax) {
		return ApiResponse.badRequest('timeMin and timeMax query parameters are required');
	}

	try {
		await ensureActorId(supabase, user.id);

		const { data: events, error: eventsError } = await supabase
			.from('onto_events')
			.select('id, project_id, props')
			.eq('owner_entity_type', 'task')
			.is('deleted_at', null)
			.gte('start_at', timeMin)
			.lte('start_at', timeMax);

		if (eventsError) {
			console.error('[API] Failed to fetch ontology task events:', eventsError);
			return ApiResponse.error('Failed to fetch task calendar events', 500);
		}

		if (!events?.length) {
			return ApiResponse.success({ calendar_event_ids: [] });
		}

		const eventIds = events.map((event) => event.id);
		const { data: syncRows, error: syncError } = await supabase
			.from('onto_event_sync')
			.select('event_id, external_event_id')
			.eq('user_id', user.id)
			.in('event_id', eventIds);

		if (syncError) {
			console.error('[API] Failed to fetch ontology event sync rows:', syncError);
		}

		const syncMap = new Map(
			(syncRows ?? []).map((row) => [row.event_id, row.external_event_id])
		);
		const calendarEventIds = Array.from(
			new Set(
				events
					.map((event) => {
						const synced = syncMap.get(event.id);
						if (synced) return synced;

						const props = (event.props as Record<string, unknown> | null) ?? {};
						const propExternal = props.external_event_id;
						if (
							!event.project_id &&
							typeof propExternal === 'string' &&
							propExternal.length > 0
						) {
							return propExternal;
						}
						return null;
					})
					.filter((eventId): eventId is string => Boolean(eventId))
			)
		);

		return ApiResponse.success({
			calendar_event_ids: calendarEventIds
		});
	} catch (err) {
		console.error('[API] Error in task-events endpoint:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};
