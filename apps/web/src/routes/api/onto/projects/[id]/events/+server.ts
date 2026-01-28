// apps/web/src/routes/api/onto/projects/[id]/events/+server.ts
import type { RequestHandler } from './$types';
import type { Json } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import { logOntologyApiError } from '../../../shared/error-logging';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

type ProjectAccessResult =
	| {
			ok: true;
			userId: string | null;
			actorId: string | null;
	  }
	| {
			ok: false;
			response: Response;
	  };

async function requireProjectAccess(
	locals: App.Locals,
	projectId: string,
	method: string,
	requiredAccess: 'read' | 'write' | 'admin'
): Promise<ProjectAccessResult> {
	const { user } = await locals.safeGetSession();
	const supabase = locals.supabase;
	const buildLogMetadata = (projectExists: boolean, metadata?: Record<string, unknown>) =>
		projectExists
			? metadata
			: {
					requested_project_id: projectId,
					...metadata
				};

	if (!user) {
		if (requiredAccess !== 'read') {
			return { ok: false, response: ApiResponse.unauthorized('Authentication required') };
		}

		const [accessResult, projectResult] = await Promise.all([
			supabase.rpc('current_actor_has_project_access', {
				p_project_id: projectId,
				p_required_access: 'read'
			}),
			supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.is('deleted_at', null)
				.maybeSingle()
		]);
		const projectExists = Boolean(projectResult.data);

		if (accessResult.error) {
			console.error(
				'[Project Events API] Failed to check public access:',
				accessResult.error
			);
			await logOntologyApiError({
				supabase,
				error: accessResult.error,
				endpoint: `/api/onto/projects/${projectId}/events`,
				method,
				projectId: projectExists ? projectId : undefined,
				entityType: 'event',
				operation: 'project_events_access',
				metadata: buildLogMetadata(projectExists)
			});
			return {
				ok: false,
				response: ApiResponse.internalError(
					accessResult.error,
					'Failed to check project access'
				)
			};
		}

		if (!accessResult.data) {
			return { ok: false, response: ApiResponse.notFound('Project') };
		}

		if (projectResult.error) {
			console.error('[Project Events API] Failed to fetch project:', projectResult.error);
			await logOntologyApiError({
				supabase,
				error: projectResult.error,
				endpoint: `/api/onto/projects/${projectId}/events`,
				method,
				projectId: projectExists ? projectId : undefined,
				entityType: 'project',
				operation: 'project_events_access',
				tableName: 'onto_projects',
				metadata: buildLogMetadata(projectExists)
			});
			return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
		}

		if (!projectResult.data) {
			return { ok: false, response: ApiResponse.notFound('Project') };
		}

		return { ok: true, userId: null, actorId: null };
	}

	const [actorResult, accessResult, projectResult] = await Promise.all([
		supabase.rpc('ensure_actor_for_user', { p_user_id: user.id }),
		supabase.rpc('current_actor_has_project_access', {
			p_project_id: projectId,
			p_required_access: requiredAccess
		}),
		supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle()
	]);
	const projectExists = Boolean(projectResult.data);

	if (actorResult.error || !actorResult.data) {
		console.error('[Project Events API] Failed to resolve actor:', actorResult.error);
		await logOntologyApiError({
			supabase,
			error: actorResult.error || new Error('Failed to resolve user actor'),
			endpoint: `/api/onto/projects/${projectId}/events`,
			method,
			userId: user.id,
			projectId: projectExists ? projectId : undefined,
			entityType: 'event',
			operation: 'project_events_access',
			metadata: buildLogMetadata(projectExists)
		});
		return {
			ok: false,
			response: ApiResponse.internalError(
				actorResult.error || new Error('Failed to resolve user actor'),
				'Failed to resolve user actor'
			)
		};
	}

	if (accessResult.error) {
		console.error('[Project Events API] Failed to check access:', accessResult.error);
		await logOntologyApiError({
			supabase,
			error: accessResult.error,
			endpoint: `/api/onto/projects/${projectId}/events`,
			method,
			userId: user.id,
			projectId: projectExists ? projectId : undefined,
			entityType: 'event',
			operation: 'project_events_access',
			metadata: buildLogMetadata(projectExists)
		});
		return {
			ok: false,
			response: ApiResponse.internalError(
				accessResult.error,
				'Failed to check project access'
			)
		};
	}

	if (!accessResult.data) {
		return { ok: false, response: ApiResponse.forbidden('Access denied') };
	}

	if (projectResult.error) {
		console.error('[Project Events API] Failed to fetch project:', projectResult.error);
		await logOntologyApiError({
			supabase,
			error: projectResult.error,
			endpoint: `/api/onto/projects/${projectId}/events`,
			method,
			userId: user.id,
			projectId: projectExists ? projectId : undefined,
			entityType: 'project',
			operation: 'project_events_access',
			tableName: 'onto_projects',
			metadata: buildLogMetadata(projectExists)
		});
		return { ok: false, response: ApiResponse.databaseError(projectResult.error) };
	}

	if (!projectResult.data) {
		return { ok: false, response: ApiResponse.notFound('Project') };
	}

	return { ok: true, userId: user.id, actorId: actorResult.data as string };
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}
	if (!isValidUUID(projectId)) {
		return ApiResponse.badRequest('Invalid project ID');
	}

	const access = await requireProjectAccess(locals, projectId, 'GET', 'read');
	if (!access.ok) return access.response;

	const timeMin = url.searchParams.get('timeMin');
	const timeMax = url.searchParams.get('timeMax');
	const ownerType = url.searchParams.get('owner_type');
	const ownerId = url.searchParams.get('owner_id');
	const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
	const limitParam = url.searchParams.get('limit');
	const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 0, 1000) : null;

	try {
		const eventService = new OntoEventSyncService(locals.supabase);
		const events = await eventService.listProjectEvents(projectId, {
			timeMin,
			timeMax,
			ownerType,
			ownerId,
			includeDeleted,
			limit
		});

		return ApiResponse.success({ events });
	} catch (error) {
		console.error('[Project Events API] Failed to list events:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${projectId}/events`,
			method: 'GET',
			userId: access.userId ?? undefined,
			projectId,
			entityType: 'event',
			operation: 'project_events_list'
		});
		return ApiResponse.internalError(error, 'Failed to load events');
	}
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID required');
	}
	if (!isValidUUID(projectId)) {
		return ApiResponse.badRequest('Invalid project ID');
	}

	const access = await requireProjectAccess(locals, projectId, 'POST', 'write');
	if (!access.ok) return access.response;
	if (!access.userId || !access.actorId) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const userId = access.userId;
	const actorId = access.actorId;

	const body = await request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return ApiResponse.badRequest('Invalid request body');
	}

	const title = body.title as string | undefined;
	const startAt = body.start_at as string | undefined;
	const endAt = body.end_at as string | undefined;
	const description = body.description as string | undefined;
	const location = body.location as string | undefined;
	const allDay = body.all_day as boolean | undefined;
	const timezone = body.timezone as string | undefined;
	const typeKey = body.type_key as string | undefined;
	const stateKey = body.state_key as string | undefined;
	const props = body.props as Record<string, unknown> | undefined;
	const ownerType = body.owner_entity_type as string | undefined;
	const ownerId = body.owner_entity_id as string | undefined;
	const taskId = body.task_id as string | undefined;
	const calendarScope = body.calendar_scope as 'project' | 'user' | 'calendar_id' | undefined;
	const calendarId = body.calendar_id as string | undefined;
	const syncToCalendar = body.sync_to_calendar as boolean | undefined;

	if (!title || !startAt) {
		return ApiResponse.badRequest('title and start_at are required');
	}

	let resolvedOwnerType = ownerType;
	let resolvedOwnerId = ownerId;

	if (!resolvedOwnerType) {
		resolvedOwnerType = taskId ? 'task' : 'project';
	}

	if (resolvedOwnerType === 'task' && taskId) {
		resolvedOwnerId = taskId;
	}

	if (resolvedOwnerType !== 'standalone' && !resolvedOwnerId) {
		return ApiResponse.badRequest('owner_entity_id is required for this owner type');
	}

	let taskMetadata: { id: string; title: string; projectId: string } | null = null;

	try {
		if (taskId) {
			const { data: task, error: taskError } = await locals.supabase
				.from('onto_tasks')
				.select('id, project_id, title')
				.eq('id', taskId)
				.eq('project_id', projectId)
				.is('deleted_at', null)
				.maybeSingle();

			if (taskError) {
				await logOntologyApiError({
					supabase: locals.supabase,
					error: taskError,
					endpoint: `/api/onto/projects/${projectId}/events`,
					method: 'POST',
					userId: access.userId ?? undefined,
					projectId,
					entityType: 'task',
					entityId: taskId,
					operation: 'event_task_lookup',
					tableName: 'onto_tasks'
				});
				return ApiResponse.databaseError(taskError);
			}

			if (!task) {
				return ApiResponse.notFound('Task');
			}

			taskMetadata = {
				id: task.id,
				title: task.title ?? 'Task',
				projectId: task.project_id
			};
		}

		const mergedProps = taskMetadata
			? {
					...(props ?? {}),
					task_id: taskMetadata.id,
					task_title: taskMetadata.title,
					task_link: `/projects/${taskMetadata.projectId}/tasks/${taskMetadata.id}`,
					project_id: taskMetadata.projectId
				}
			: props;

		const eventService = new OntoEventSyncService(locals.supabase);
		const result = await eventService.createEvent(userId, {
			orgId: null,
			projectId,
			owner: {
				type: resolvedOwnerType as any,
				id: resolvedOwnerType === 'standalone' ? null : (resolvedOwnerId ?? null)
			},
			typeKey:
				typeKey ?? (resolvedOwnerType === 'task' ? 'event.task_work' : 'event.general'),
			stateKey,
			title,
			description,
			location,
			startAt,
			endAt,
			allDay,
			timezone,
			props: mergedProps as Json | undefined,
			createdBy: actorId,
			calendarScope,
			calendarId,
			syncToCalendar,
			deferCalendarSync: true
		});

		if (resolvedOwnerType === 'task' && resolvedOwnerId) {
			await locals.supabase.from('onto_edges').insert({
				project_id: projectId,
				src_id: resolvedOwnerId,
				src_kind: 'task',
				dst_id: result.event.id,
				dst_kind: 'event',
				rel: 'has_event'
			});
		}

		return ApiResponse.created({
			event: result.event,
			sync: result.sync ?? null
		});
	} catch (error) {
		console.error('[Project Events API] Failed to create event:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/projects/${projectId}/events`,
			method: 'POST',
			userId: access.userId ?? undefined,
			projectId,
			entityType: 'event',
			operation: 'event_create'
		});
		return ApiResponse.internalError(error, 'Failed to create event');
	}
};
