// apps/web/src/routes/api/onto/events/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';

type EventAccessResult =
	| {
			ok: true;
			userId: string;
			actorId: string;
	  }
	| {
			ok: false;
			response: Response;
	  };

async function requireEventAccess(locals: App.Locals, eventId: string): Promise<EventAccessResult> {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase;
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: user.id
	});

	if (actorError || !actorId) {
		return {
			ok: false,
			response: ApiResponse.internalError(
				actorError || new Error('Failed to resolve user actor'),
				'Failed to resolve user actor'
			)
		};
	}

	const { data: event, error: eventError } = await supabase
		.from('onto_events')
		.select('id, project_id, created_by, owner_entity_type, owner_entity_id')
		.eq('id', eventId)
		.maybeSingle();

	if (eventError) {
		return { ok: false, response: ApiResponse.databaseError(eventError) };
	}

	if (!event) {
		return { ok: false, response: ApiResponse.notFound('Event') };
	}

	if (event.project_id) {
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', event.project_id)
			.maybeSingle();

		if (projectError) {
			return { ok: false, response: ApiResponse.databaseError(projectError) };
		}

		if (!project || project.created_by !== actorId) {
			return { ok: false, response: ApiResponse.forbidden('Access denied') };
		}
	} else {
		const ownsEvent =
			event.created_by === actorId ||
			(event.owner_entity_type === 'actor' && event.owner_entity_id === actorId);

		if (!ownsEvent) {
			return { ok: false, response: ApiResponse.forbidden('Access denied') };
		}
	}

	return { ok: true, userId: user.id, actorId };
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const eventId = params.id;
	if (!eventId) {
		return ApiResponse.badRequest('Event ID required');
	}

	const access = await requireEventAccess(locals, eventId);
	if (!access.ok) return access.response;

	const eventService = new OntoEventSyncService(locals.supabase);
	const event = await eventService.getEvent(eventId);

	if (!event) {
		return ApiResponse.notFound('Event');
	}

	return ApiResponse.success({ event });
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const eventId = params.id;
	if (!eventId) {
		return ApiResponse.badRequest('Event ID required');
	}

	const access = await requireEventAccess(locals, eventId);
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const eventService = new OntoEventSyncService(locals.supabase);
	const updated = await eventService.updateEvent(access.userId, {
		eventId,
		title: body.title,
		description: body.description,
		location: body.location,
		startAt: body.start_at,
		endAt: body.end_at,
		allDay: body.all_day,
		timezone: body.timezone,
		stateKey: body.state_key,
		typeKey: body.type_key,
		recurrence: body.recurrence,
		externalLink: body.external_link,
		props: body.props,
		syncToCalendar: body.sync_to_calendar
	});

	return ApiResponse.success({ event: updated });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const eventId = params.id;
	if (!eventId) {
		return ApiResponse.badRequest('Event ID required');
	}

	const access = await requireEventAccess(locals, eventId);
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	const syncToCalendar =
		body && typeof body === 'object'
			? (body.sync_to_calendar as boolean | undefined)
			: undefined;

	const eventService = new OntoEventSyncService(locals.supabase);
	const event = await eventService.deleteEvent(access.userId, {
		eventId,
		syncToCalendar
	});

	return ApiResponse.success({ event });
};
