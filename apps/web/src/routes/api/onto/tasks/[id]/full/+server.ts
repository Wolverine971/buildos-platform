// apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts
/**
 * GET /api/onto/tasks/[id]/full - Get task with all related data in a single request
 *
 * Returns task data and linked entities in one response,
 * reducing the number of API calls needed to load the TaskEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Task data with project verification
 * - Linked entities (plans, goals, milestones, documents, tasks)
 *
 * Note: Workspace documents are NOT included here as they are deferred
 * to when the user switches to the workspace tab.
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Performance: See TaskEditModal optimization notes
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
 * - Task Endpoint: /apps/web/src/routes/api/onto/tasks/[id]/+server.ts
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveLinkedEntities } from '../../task-linked-helpers';
import { logOntologyApiError } from '../../../shared/error-logging';
import { attachAssigneesToTask, fetchTaskAssigneesMap } from '$lib/server/task-assignment.service';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;
	const taskId = params.id;

	try {
		// Phase 1: Parallelize initial queries
		const [actorResult, taskResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_tasks')
				.select(
					`
					*,
					project:onto_projects!inner(
						id,
						name
					)
				`
				)
				.eq('id', taskId)
				.is('deleted_at', null) // Exclude soft-deleted tasks
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: task, error: taskError } = taskResult;
		const projectId = task?.project?.id;

		if (actorError || !actorId) {
			console.error('[Task Full GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/tasks/${taskId}/full`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (taskError || !task) {
			if (taskError) {
				console.error('[Task Full GET] Failed to fetch task:', taskError);
				await logOntologyApiError({
					supabase,
					error: taskError,
					endpoint: `/api/onto/tasks/${taskId}/full`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'task',
					entityId: taskId,
					operation: 'task_full_fetch',
					tableName: 'onto_tasks'
				});
				return ApiResponse.databaseError(taskError);
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
			console.error('[Task Full GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/tasks/${taskId}/full`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'task',
				entityId: taskId,
				operation: 'task_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		const linkedEntities = await resolveLinkedEntities(supabase, taskId);

		// Extract project data and include project name in response
		const { project, ...taskData } = task;
		let taskWithAssignees = { ...taskData, assignees: [] as unknown[] };
		try {
			const assigneeMap = await fetchTaskAssigneesMap({ supabase, taskIds: [taskId] });
			taskWithAssignees = attachAssigneesToTask(taskData, assigneeMap);
		} catch (assigneeError) {
			console.warn('[Task Full GET] Failed to enrich assignees in response:', assigneeError);
		}

		return ApiResponse.success({
			task: { ...taskWithAssignees, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Task Full GET] Error fetching task data:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/tasks/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'task',
			entityId: params.id,
			operation: 'task_full_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
