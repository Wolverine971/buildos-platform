// apps/web/src/routes/api/onto/events/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { logOntologyApiError } from '../../shared/error-logging';

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

async function requireEventAccess(
	locals: App.Locals,
	eventId: string,
	method: string,
	requiredAccess: 'read' | 'write' | 'admin'
): Promise<EventAccessResult> {
	const { user } = await locals.safeGetSession();
	if (!user) {
		return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
	}

	const supabase = locals.supabase;
	const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
		p_user_id: user.id
	});

	if (actorError || !actorId) {
		await logOntologyApiError({
			supabase,
			error: actorError || new Error('Failed to resolve user actor'),
			endpoint: `/api/onto/events/${eventId}`,
			method,
			userId: user.id,
			entityType: 'event',
			entityId: eventId,
			operation: 'event_actor_resolve'
		});
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
		await logOntologyApiError({
			supabase,
			error: eventError,
			endpoint: `/api/onto/events/${eventId}`,
			method,
			userId: user.id,
			entityType: 'event',
			entityId: eventId,
			operation: 'event_fetch',
			tableName: 'onto_events'
		});
		return { ok: false, response: ApiResponse.databaseError(eventError) };
	}

	if (!event) {
		return { ok: false, response: ApiResponse.notFound('Event') };
	}

	if (event.project_id) {
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: event.project_id,
				p_required_access: requiredAccess
			}
		);

		if (accessError) {
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/events/${eventId}`,
				method,
				userId: user.id,
				projectId: event.project_id,
				entityType: 'project',
				operation: 'event_access_check'
			});
			return {
				ok: false,
				response: ApiResponse.internalError(accessError, 'Failed to check project access')
			};
		}

		if (!hasAccess) {
			return { ok: false, response: ApiResponse.forbidden('Access denied') };
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', event.project_id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError) {
			await logOntologyApiError({
				supabase,
				error: projectError,
				endpoint: `/api/onto/events/${eventId}`,
				method,
				userId: user.id,
				projectId: event.project_id,
				entityType: 'project',
				operation: 'event_project_fetch',
				tableName: 'onto_projects'
			});
			return { ok: false, response: ApiResponse.databaseError(projectError) };
		}

		if (!project) {
			return { ok: false, response: ApiResponse.notFound('Project') };
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

	const access = await requireEventAccess(locals, eventId, 'GET', 'read');
	if (!access.ok) return access.response;

	try {
		const eventService = new OntoEventSyncService(locals.supabase);
		const event = await eventService.getEvent(eventId);

		if (!event) {
			return ApiResponse.notFound('Event');
		}

		return ApiResponse.success({ event });
	} catch (error) {
		console.error('[Event API] Failed to load event:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/events/${eventId}`,
			method: 'GET',
			userId: access.userId,
			entityType: 'event',
			entityId: eventId,
			operation: 'event_get'
		});
		return ApiResponse.internalError(error, 'Failed to load event');
	}
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const eventId = params.id;
	if (!eventId) {
		return ApiResponse.badRequest('Event ID required');
	}

	const access = await requireEventAccess(locals, eventId, 'PATCH', 'write');
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	try {
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
			syncToCalendar: body.sync_to_calendar,
			deferCalendarSync: true
		});

		return ApiResponse.success({ event: updated });
	} catch (error) {
		console.error('[Event API] Failed to update event:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/events/${eventId}`,
			method: 'PATCH',
			userId: access.userId,
			entityType: 'event',
			entityId: eventId,
			operation: 'event_update'
		});
		return ApiResponse.internalError(error, 'Failed to update event');
	}
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const eventId = params.id;
	if (!eventId) {
		return ApiResponse.badRequest('Event ID required');
	}

	const access = await requireEventAccess(locals, eventId, 'DELETE', 'write');
	if (!access.ok) return access.response;

	const body = await request.json().catch(() => null);
	const syncToCalendar =
		body && typeof body === 'object'
			? (body.sync_to_calendar as boolean | undefined)
			: undefined;

	try {
		const eventService = new OntoEventSyncService(locals.supabase);
		const event = await eventService.deleteEvent(access.userId, {
			eventId,
			syncToCalendar,
			deferCalendarSync: true
		});

		return ApiResponse.success({ event });
	} catch (error) {
		console.error('[Event API] Failed to delete event:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/events/${eventId}`,
			method: 'DELETE',
			userId: access.userId,
			entityType: 'event',
			entityId: eventId,
			operation: 'event_delete'
		});
		return ApiResponse.internalError(error, 'Failed to delete event');
	}
};
