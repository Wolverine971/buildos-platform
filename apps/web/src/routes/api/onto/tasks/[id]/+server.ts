// apps/web/src/routes/api/onto/tasks/[id]/+server.ts
/**
 * Task CRUD API Endpoints (GET, PATCH, DELETE)
 *
 * Handles read, update, and delete operations for tasks in the ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * GET /api/onto/tasks/[id]:
 * - Returns task with FSM information
 * - Includes project ownership verification
 *
 * PATCH /api/onto/tasks/[id]:
 * - Updates task properties
 * - Validates state transitions against FSM
 * - Maintains props object integrity
 *
 * DELETE /api/onto/tasks/[id]:
 * - Removes task and associated edges
 * - Verifies ownership before deletion
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
 * - Create Endpoint: /apps/web/src/routes/api/onto/tasks/create/+server.ts
 * - Database: onto_tasks, onto_edges tables
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Actor-based authorization
 * - Project ownership verification
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveLinkedEntities } from '../task-linked-helpers';
import { TASK_STATES } from '$lib/types/onto';
import {
	logUpdateAsync,
	logDeleteAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeTaskStateInput } from '../../shared/task-state';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';
import { OntoEventSyncService } from '$lib/services/ontology/onto-event-sync.service';
import {
	AutoOrganizeError,
	ENTITY_TABLES,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import type { EntityKind } from '$lib/services/ontology/edge-direction';
import { logOntologyApiError } from '../../shared/error-logging';

const ALLOWED_PARENT_KINDS = new Set(Object.keys(ENTITY_TABLES));

// GET /api/onto/tasks/[id] - Get a single task
export const GET: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const _chatSessionId = getChatSessionIdFromRequest(request);
	let projectId: string | undefined;

	try {
		// Parallelize initial queries: actor resolution and task fetch
		const [actorResult, taskResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_tasks')
				.select(
					`
					*,
					project:onto_projects!inner(
						id,
						created_by
					)
				`
				)
				.eq('id', params.id)
				.is('deleted_at', null) // Exclude soft-deleted tasks
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: task, error } = taskResult;
		projectId = task?.project?.id;

		if (actorError || !actorId) {
			console.error('[Task GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (error || !task) {
			if (error) {
				console.error('[Task GET] Failed to fetch task:', error);
				await logOntologyApiError({
					supabase,
					error,
					endpoint: `/api/onto/tasks/${params.id}`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'task',
					entityId: params.id,
					operation: 'task_fetch',
					tableName: 'onto_tasks'
				});
				return ApiResponse.databaseError(error);
			}
			return ApiResponse.notFound('Task');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: task.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Task GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const linkedEntities = await resolveLinkedEntities(supabase, params.id);

		// Remove nested project data from response
		const { project: _project, ...taskData } = task;

		return ApiResponse.success({ task: taskData, linkedEntities });
	} catch (error) {
		console.error('Error fetching task:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tasks/${params.id}`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId,
			entityType: 'task',
			entityId: params.id,
			operation: 'task_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// PATCH /api/onto/tasks/[id] - Update a task
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		const body = await request.json();
		const {
			title,
			description,
			priority,
			state_key,
			type_key,
			props,
			plan_id,
			goal_id,
			supporting_milestone_id,
			start_at,
			due_at,
			parent,
			parents,
			connections
		} = body;

		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task PATCH] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		const hasGoalInput = Object.prototype.hasOwnProperty.call(body, 'goal_id');
		const hasPlanInput = Object.prototype.hasOwnProperty.call(body, 'plan_id');
		const hasMilestoneInput = Object.prototype.hasOwnProperty.call(
			body,
			'supporting_milestone_id'
		);
		const hasParentField = Object.prototype.hasOwnProperty.call(body, 'parent');
		const hasParentsField = Object.prototype.hasOwnProperty.call(body, 'parents');
		const explicitParents = toParentRefs({ parent, parents });

		let validatedGoalId: string | null | undefined = undefined;
		let validatedMilestoneId: string | null | undefined = undefined;
		let normalizedPlanId: string | null | undefined = undefined;

		// Get task with project to verify ownership
		const { data: existingTask, error: fetchError } = await supabase
			.from('onto_tasks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null)
			.single();

		if (fetchError || !existingTask) {
			return ApiResponse.notFound('Task');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: existingTask.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Task PATCH] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingTask.project_id,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const invalidParent = explicitParents.find(
			(parentRef) => !ALLOWED_PARENT_KINDS.has(parentRef.kind)
		);
		if (invalidParent) {
			return ApiResponse.badRequest(`Unsupported parent kind: ${invalidParent.kind}`);
		}

		if (hasPlanInput) {
			normalizedPlanId =
				typeof plan_id === 'string' && plan_id.trim().length > 0 ? plan_id : null;
		}

		if (hasGoalInput) {
			const targetGoalId =
				typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
			if (targetGoalId) {
				validatedGoalId = targetGoalId;
			} else {
				validatedGoalId = null;
			}
		}

		if (hasMilestoneInput) {
			const targetMilestoneId =
				typeof supporting_milestone_id === 'string' &&
				supporting_milestone_id.trim().length > 0
					? supporting_milestone_id
					: null;
			if (targetMilestoneId) {
				validatedMilestoneId = targetMilestoneId;
			} else {
				validatedMilestoneId = null;
			}
		}

		const makeConnection = (
			kind: EntityKind,
			id: string,
			rel?: ConnectionRef['rel']
		): ConnectionRef => (rel ? { kind, id, rel } : { kind, id });

		const legacyConnections: ConnectionRef[] = [
			...explicitParents.map((parent) => makeConnection(parent.kind, parent.id)),
			...(normalizedPlanId ? [makeConnection('plan', normalizedPlanId)] : []),
			...(validatedGoalId ? [makeConnection('goal', validatedGoalId)] : []),
			...(validatedMilestoneId
				? [makeConnection('milestone', validatedMilestoneId, 'targets_milestone')]
				: [])
		];

		const hasConnectionsInput = Array.isArray(connections);
		const connectionList: ConnectionRef[] =
			hasConnectionsInput && connections.length > 0
				? (connections as ConnectionRef[])
				: legacyConnections;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: existingTask.project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		// Build update object
		const updateData: any = {
			updated_at: new Date().toISOString()
		};

		if (title !== undefined) updateData.title = title;
		if (priority !== undefined) updateData.priority = priority;
		if (type_key !== undefined) updateData.type_key = type_key;
		if (start_at !== undefined) updateData.start_at = start_at || null;
		if (due_at !== undefined) updateData.due_at = due_at;

		// Handle description as a direct column (no longer in props)
		if (description !== undefined) {
			updateData.description = description || null;
		}

		// Handle state_key transitions and completed_at
		if (state_key !== undefined) {
			const normalizedState = normalizeTaskStateInput(state_key);
			if (!normalizedState) {
				return ApiResponse.badRequest(
					`state_key must be one of: ${TASK_STATES.join(', ')}`
				);
			}
			updateData.state_key = normalizedState;
			const wasNotDone = existingTask.state_key !== 'done';
			const isNowDone = normalizedState === 'done';
			const wasAlreadyDone = existingTask.state_key === 'done';
			const isNoLongerDone = normalizedState !== 'done';

			// Transitioning TO done: set completed_at
			if (wasNotDone && isNowDone) {
				updateData.completed_at = new Date().toISOString();
			}
			// Transitioning FROM done: clear completed_at
			else if (wasAlreadyDone && isNoLongerDone) {
				updateData.completed_at = null;
			}
		}

		// Handle props update - merge with existing (description no longer stored here)
		const currentProps = (existingTask.props as Record<string, unknown> | null) ?? {};
		const nextProps = { ...currentProps, ...(props || {}) };
		let includeProps = false;

		if (props !== undefined) {
			includeProps = true;
		}

		if (hasGoalInput) {
			if (validatedGoalId) {
				nextProps.goal_id = validatedGoalId;
			} else {
				nextProps.goal_id = null;
			}
			includeProps = true;
		}

		if (hasMilestoneInput) {
			if (validatedMilestoneId) {
				nextProps.supporting_milestone_id = validatedMilestoneId;
			} else {
				nextProps.supporting_milestone_id = null;
			}
			includeProps = true;
		}

		if (includeProps) {
			updateData.props = nextProps;
		}

		// Update the task
		const { data: updatedTask, error: updateError } = await supabase
			.from('onto_tasks')
			.update(updateData)
			.eq('id', params.id)
			.select('*')
			.single();

		if (updateError) {
			console.error('Error updating task:', updateError);
			await logOntologyApiError({
				supabase,
				error: updateError,
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'PATCH',
				userId: session.user.id,
				projectId: existingTask.project_id,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_update',
				tableName: 'onto_tasks'
			});
			return ApiResponse.databaseError(updateError);
		}

		const hasContainmentInput =
			hasPlanInput ||
			hasGoalInput ||
			hasParentField ||
			hasParentsField ||
			hasConnectionsInput;
		const hasSemanticInput = hasMilestoneInput;
		const shouldOrganize = hasContainmentInput || hasSemanticInput;

		if (shouldOrganize) {
			const explicitKinds: EntityKind[] = [];
			if (hasConnectionsInput) {
				explicitKinds.push('goal', 'milestone');
			} else {
				if (hasGoalInput) explicitKinds.push('goal');
				if (hasMilestoneInput) explicitKinds.push('milestone');
			}

			const skipContainment = !hasContainmentInput && hasSemanticInput;

			await autoOrganizeConnections({
				supabase,
				projectId: existingTask.project_id,
				entity: { kind: 'task', id: params.id },
				connections: connectionList,
				options: {
					mode: 'replace',
					explicitKinds,
					skipContainment
				}
			});
		}

		const shouldSyncEvents =
			title !== undefined || start_at !== undefined || due_at !== undefined;

		if (shouldSyncEvents) {
			try {
				const taskEventSync = new TaskEventSyncService(supabase);
				await taskEventSync.syncTaskEvents(session.user.id, actorId, updatedTask);
			} catch (eventError) {
				console.warn('[Task Update] Failed to sync task events:', eventError);
			}
		}

		// Log activity async (non-blocking)
		logUpdateAsync(
			supabase,
			existingTask.project_id,
			'task',
			params.id,
			{
				title: existingTask.title,
				state_key: existingTask.state_key,
				props: existingTask.props
			},
			{
				title: updatedTask.title,
				state_key: updatedTask.state_key,
				props: updatedTask.props
			},
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ task: updatedTask });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error updating task:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tasks/${params.id}`,
			method: 'PATCH',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'task',
			entityId: params.id,
			operation: 'task_update'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};

// DELETE /api/onto/tasks/[id] - Soft delete a task
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);
	const body = await request.json().catch(() => null);
	const shouldSyncEventsToCalendar =
		body && typeof body === 'object'
			? (body.sync_to_calendar as boolean | undefined) !== false
			: true;
	const shouldDeleteLinkedEvents =
		body && typeof body === 'object'
			? (body.delete_linked_events as boolean | undefined) !== false
			: true;

	try {
		// Get user's actor ID
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: session.user.id
		});

		if (actorError || !actorId) {
			console.error('[Task DELETE] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		// Get task with project to verify ownership (fetch full data for logging)
		const { data: task, error: fetchError } = await supabase
			.from('onto_tasks')
			.select(
				`
				*,
				project:onto_projects!inner(
					id,
					created_by
				)
			`
			)
			.eq('id', params.id)
			.is('deleted_at', null) // Only allow deleting non-deleted tasks
			.single();

		if (fetchError || !task) {
			return ApiResponse.notFound('Task');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: task.project.id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Task DELETE] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId: task.project_id,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const projectId = task.project_id;
		const taskDataForLog = {
			title: task.title,
			type_key: task.type_key,
			state_key: task.state_key
		};

		// Soft delete: set deleted_at timestamp instead of hard delete
		const { error: deleteError } = await supabase
			.from('onto_tasks')
			.update({
				deleted_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.id);

		if (deleteError) {
			console.error('Error soft-deleting task:', deleteError);
			await logOntologyApiError({
				supabase,
				error: deleteError,
				endpoint: `/api/onto/tasks/${params.id}`,
				method: 'DELETE',
				userId: session.user.id,
				projectId,
				entityType: 'task',
				entityId: params.id,
				operation: 'task_delete',
				tableName: 'onto_tasks'
			});
			return ApiResponse.error('Failed to delete task', 500);
		}

		if (shouldDeleteLinkedEvents) {
			try {
				const { data: taskEvents, error: taskEventsError } = await supabase
					.from('onto_events')
					.select('id')
					.eq('owner_entity_type', 'task')
					.eq('owner_entity_id', params.id)
					.is('deleted_at', null);

				if (taskEventsError) {
					console.error('[Task DELETE] Failed to load linked events:', taskEventsError);
					await logOntologyApiError({
						supabase,
						error: taskEventsError,
						endpoint: `/api/onto/tasks/${params.id}`,
						method: 'DELETE',
						userId: session.user.id,
						projectId,
						entityType: 'event',
						operation: 'task_delete_linked_events_fetch',
						tableName: 'onto_events'
					});
				} else if (taskEvents && taskEvents.length > 0) {
					const eventService = new OntoEventSyncService(supabase);
					for (const taskEvent of taskEvents) {
						await eventService.deleteEvent(session.user.id, {
							eventId: taskEvent.id,
							syncToCalendar: shouldSyncEventsToCalendar
						});
					}
				}
			} catch (error) {
				console.error('[Task DELETE] Failed to delete linked events:', error);
				await logOntologyApiError({
					supabase,
					error,
					endpoint: `/api/onto/tasks/${params.id}`,
					method: 'DELETE',
					userId: session.user.id,
					projectId,
					entityType: 'event',
					operation: 'task_delete_linked_events'
				});
			}
		}

		// Note: We keep the edges for soft-deleted tasks to preserve relationships
		// They will be filtered out when querying active tasks

		// Log activity async (non-blocking)
		logDeleteAsync(
			supabase,
			projectId,
			'task',
			params.id,
			taskDataForLog,
			session.user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		return ApiResponse.success({ message: 'Task deleted successfully' });
	} catch (error) {
		console.error('Error deleting task:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tasks/${params.id}`,
			method: 'DELETE',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'task',
			entityId: params.id,
			operation: 'task_delete'
		});
		return ApiResponse.error('Internal server error', 500);
	}
};
