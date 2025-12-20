// apps/web/src/routes/api/onto/tasks/[id]/full/+server.ts
/**
 * GET /api/onto/tasks/[id]/full - Get task with all related data in a single request
 *
 * Returns task data and linked entities in one response,
 * reducing the number of API calls needed to load the TaskEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Task data with plan relationship
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
		return ApiResponse.error('Unauthorized', 401);
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
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (taskError || !task) {
			return ApiResponse.error('Task not found', 404);
		}

		// Authorization check
		if (task.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Phase 2: Parallelize secondary queries (plan, linked entities)
		const [planEdgeResult, linkedEntities] = await Promise.all([
			supabase
				.from('onto_edges')
				.select('dst_id')
				.eq('src_kind', 'task')
				.eq('src_id', taskId)
				.eq('rel', 'belongs_to_plan')
				.eq('dst_kind', 'plan')
				.single(),
			resolveLinkedEntities(supabase, taskId)
		]);

		// Phase 3: Fetch plan data if edge exists (dependent query)
		let plan = null;
		if (planEdgeResult.data?.dst_id) {
			const { data: planData } = await supabase
				.from('onto_plans')
				.select('id, name, type_key')
				.eq('id', planEdgeResult.data.dst_id)
				.single();

			if (planData) {
				plan = planData;
			}
		}

		// Extract project data and include project name in response
		const { project, ...taskData } = task;

		return ApiResponse.success({
			task: { ...taskData, plan, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Task Full GET] Error fetching task data:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
