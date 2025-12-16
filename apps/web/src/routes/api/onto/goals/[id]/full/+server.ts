// apps/web/src/routes/api/onto/goals/[id]/full/+server.ts
/**
 * GET /api/onto/goals/[id]/full - Get goal with all related data in a single request
 *
 * Returns goal data and linked entities in one response,
 * reducing the number of API calls needed to load the GoalEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Goal data with project verification
 * - Linked entities (plans, tasks, documents, milestones, outputs)
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Performance: Modal optimization pattern
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/GoalEditModal.svelte
 * - Goal Endpoint: /apps/web/src/routes/api/onto/goals/[id]/+server.ts
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { resolveLinkedEntitiesGeneric } from '../../../shared/entity-linked-helpers';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.error('Unauthorized', 401);
	}

	const supabase = locals.supabase;
	const goalId = params.id;

	try {
		// Phase 1: Parallelize initial queries
		const [actorResult, goalResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_goals')
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
				.eq('id', goalId)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: goal, error: goalError } = goalResult;

		if (actorError || !actorId) {
			console.error('[Goal Full GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (goalError || !goal) {
			return ApiResponse.error('Goal not found', 404);
		}

		// Authorization check
		if (goal.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, goalId, 'goal');

		// Extract project data and include project name in response
		const { project, ...goalData } = goal;

		return ApiResponse.success({
			goal: { ...goalData, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Goal Full GET] Error fetching goal data:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
