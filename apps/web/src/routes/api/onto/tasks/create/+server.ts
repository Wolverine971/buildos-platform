// apps/web/src/routes/api/onto/tasks/create/+server.ts
/**
 * Task Creation API Endpoint
 *
 * Creates a new task within the BuildOS ontology system.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Data Models: /apps/web/docs/features/ontology/DATA_MODELS.md
 * - Implementation: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
 * - API Patterns: /apps/web/docs/technical/api/PATTERNS.md
 *
 * Request Body:
 * - project_id: string (required) - Project UUID
 * - title: string (required) - Task title
 * - description?: string - Task description (stored in column)
 * - priority?: number (1-5) - Task priority
 * - plan_id?: string - Associated plan UUID (creates edge relationship)
 * - type_key?: string (ignored; auto-classified) - Task type
 * - state_key?: string (default: 'todo') - Initial state
 * - start_at?: string - Start date ISO string (when work should begin)
 * - due_at?: string - Due date ISO string
 * - props?: object (ignored; auto-classified)
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/TaskCreateModal.svelte
 * - Update/Delete: /apps/web/src/routes/api/onto/tasks/[id]/+server.ts
 * - Database Schema: onto_tasks table
 *
 * Security:
 * - Uses locals.supabase for RLS enforcement
 * - Requires authenticated user with actor
 * - Verifies project ownership
 */
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse } from '$lib/utils/api-response';
import type { EnsureActorResponse } from '$lib/types/onto-api';
import { TASK_STATES } from '$lib/types/onto';
import {
	logCreateAsync,
	getChangeSourceFromRequest,
	getChatSessionIdFromRequest
} from '$lib/services/async-activity-logger';
import { normalizeTaskStateInput } from '../../shared/task-state';
import { classifyOntologyEntity } from '$lib/server/ontology-classification.service';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';
import {
	AutoOrganizeError,
	autoOrganizeConnections,
	assertEntityRefsInProject,
	toParentRefs
} from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';
import { logOntologyApiError } from '../../shared/error-logging';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const chatSessionId = getChatSessionIdFromRequest(request);

	try {
		// Parse request body
		const body = await request.json();
		const {
			project_id,
			title,
			description,
			priority = 3,
			plan_id,
			state_key,
			goal_id,
			supporting_milestone_id,
			start_at,
			due_at,
			parent,
			parents,
			connections
		} = body;
		const classificationSource = body?.classification_source ?? body?.classificationSource;

		// Validate required fields
		if (!project_id || !title) {
			return ApiResponse.badRequest('Project ID and title are required');
		}
		const hasStateInput = Object.prototype.hasOwnProperty.call(body, 'state_key');
		const normalizedState = normalizeTaskStateInput(state_key);

		if (hasStateInput && !normalizedState) {
			return ApiResponse.badRequest(`state_key must be one of: ${TASK_STATES.join(', ')}`);
		}
		const finalState = normalizedState ?? 'todo';

		// Get user's actor ID
		const { data: actorData, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorData) {
			console.error('Error resolving actor for task creation:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'task',
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(new Error('Failed to get user actor'));
		}

		const actorId = actorData as EnsureActorResponse;

		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', project_id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: project_id,
				p_required_access: 'write'
			}
		);

		if (accessError) {
			console.error('[Task Create] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'task',
				operation: 'task_access_check'
			});
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden(
				'You do not have permission to create tasks in this project'
			);
		}

		// If plan_id is provided, verify it belongs to the project
		if (plan_id) {
			const { data: plan, error: planError } = await supabase
				.from('onto_plans')
				.select('id')
				.eq('id', plan_id)
				.is('deleted_at', null)
				.eq('project_id', project_id)
				.single();

			if (planError || !plan) {
				return ApiResponse.notFound('Plan');
			}
		}

		// Validate optional goal and milestone relationships
		let validatedGoalId: string | null = null;
		let validatedMilestoneId: string | null = null;
		const explicitParents = toParentRefs({ parent, parents });
		const normalizedPlanId =
			typeof plan_id === 'string' && plan_id.trim().length > 0 ? plan_id : null;
		const normalizedGoalId =
			typeof goal_id === 'string' && goal_id.trim().length > 0 ? goal_id : null;
		const normalizedMilestoneId =
			typeof supporting_milestone_id === 'string' && supporting_milestone_id.trim().length > 0
				? supporting_milestone_id
				: null;

		const invalidParent = explicitParents.find(
			(parentRef) => !['project', 'plan', 'goal', 'milestone'].includes(parentRef.kind)
		);
		if (invalidParent) {
			return ApiResponse.badRequest(`Unsupported parent kind: ${invalidParent.kind}`);
		}

		const legacyConnections: ConnectionRef[] = [
			...explicitParents,
			...(normalizedPlanId ? [{ kind: 'plan', id: normalizedPlanId }] : []),
			...(normalizedGoalId ? [{ kind: 'goal', id: normalizedGoalId }] : []),
			...(normalizedMilestoneId
				? [{ kind: 'milestone', id: normalizedMilestoneId, rel: 'targets_milestone' }]
				: [])
		];

		const connectionList: ConnectionRef[] =
			Array.isArray(connections) && connections.length > 0 ? connections : legacyConnections;

		if (connectionList.length > 0) {
			await assertEntityRefsInProject({
				supabase,
				projectId: project_id,
				refs: connectionList,
				allowProject: true
			});
		}

		if (normalizedGoalId) {
			validatedGoalId = normalizedGoalId;
		}

		if (normalizedMilestoneId) {
			validatedMilestoneId = normalizedMilestoneId;
		}

		// Create the task
		// Description is now a proper column (not just in props)
		// completed_at is auto-set when state_key is 'done'
		const taskData = {
			project_id,
			title,
			description: description || null,
			type_key: 'task.default',
			state_key: finalState,
			priority,
			start_at: start_at || null,
			due_at: due_at || null,
			created_by: actorId,
			props: {
				// Keep goal_id and milestone_id in props for edge reference
				...(validatedGoalId ? { goal_id: validatedGoalId } : {}),
				...(validatedMilestoneId ? { supporting_milestone_id: validatedMilestoneId } : {})
			},
			// Auto-set completed_at when creating a task as done
			...(finalState === 'done' ? { completed_at: new Date().toISOString() } : {})
		};

		const { data: task, error: createError } = await supabase
			.from('onto_tasks')
			.insert(taskData)
			.select('*')
			.single();

		if (createError) {
			console.error('Error creating task:', createError);
			await logOntologyApiError({
				supabase,
				error: createError,
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				userId: user.id,
				projectId: project_id,
				entityType: 'task',
				entityId: task?.id,
				operation: 'task_create',
				tableName: 'onto_tasks'
			});
			return ApiResponse.databaseError(createError);
		}

		await autoOrganizeConnections({
			supabase,
			projectId: project_id,
			entity: { kind: 'task', id: task.id },
			connections: connectionList,
			options: { mode: 'replace' }
		});

		// Create or update linked events when task is scheduled
		try {
			const taskEventSync = new TaskEventSyncService(supabase);
			await taskEventSync.syncTaskEvents(user.id, actorId, task);
		} catch (eventError) {
			console.warn('[Task Create] Failed to sync task events:', eventError);
		}

		// Log activity async (non-blocking)
		logCreateAsync(
			supabase,
			project_id,
			'task',
			task.id,
			{ title: task.title, type_key: task.type_key, state_key: task.state_key },
			user.id,
			getChangeSourceFromRequest(request),
			chatSessionId
		);

		if (classificationSource === 'create_modal') {
			void classifyOntologyEntity({
				entityType: 'task',
				entityId: task.id,
				userId: user.id,
				classificationSource: 'create_modal'
			}).catch((err) => {
				if (dev) console.warn('[Task Create] Classification failed:', err);
			});
		}

		return ApiResponse.created({ task });
	} catch (error) {
		if (error instanceof AutoOrganizeError) {
			return ApiResponse.error(error.message, error.status);
		}
		console.error('Error in task create endpoint:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: '/api/onto/tasks/create',
			method: 'POST',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: (error as any)?.project_id,
			entityType: 'task',
			operation: 'task_create'
		});
		return ApiResponse.internalError(error);
	}
};
