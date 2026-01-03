// apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts
/**
 * GET /api/onto/tasks/[id]/full - Get task with all related data in a single request
 *
 * Returns task data and linked entities in one response,
 * reducing the number of API calls needed to load the TaskEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Task data with project verification
 * - Linked entities (plans, goals, milestones, documents, tasks, outputs)
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
						name,
						created_by
					)
				`
				)
				.eq('id', taskId)
				.is('deleted_at', null) // Exclude soft-deleted tasks
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: task, error: taskError } = taskResult;

		if (actorError || !actorId) {
			console.error('[Task Full GET] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (taskError || !task) {
			return ApiResponse.notFound('Task');
		}

		// Authorization check
		if (task.project.created_by !== actorId) {
			return ApiResponse.forbidden('Access denied');
		}

		const linkedEntities = await resolveLinkedEntities(supabase, taskId);

		// Extract project data and include project name in response
		const { project, ...taskData } = task;

		return ApiResponse.success({
			task: { ...taskData, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Task Full GET] Error fetching task data:', error);
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
