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
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
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
				.is('deleted_at', null)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: goal, error: goalError } = goalResult;
		const projectId = goal?.project?.id;

		if (actorError || !actorId) {
			console.error('[Goal Full GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/goals/${goalId}/full`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'goal',
				entityId: goalId,
				operation: 'goal_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (goalError || !goal) {
			if (goalError) {
				console.error('[Goal Full GET] Failed to fetch goal:', goalError);
				await logOntologyApiError({
					supabase,
					error: goalError,
					endpoint: `/api/onto/goals/${goalId}/full`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'goal',
					entityId: goalId,
					operation: 'goal_full_fetch',
					tableName: 'onto_goals'
				});
				return ApiResponse.databaseError(goalError);
			}
			return ApiResponse.notFound('Goal');
		}

		// Authorization check
		if (goal.project.created_by !== actorId) {
			return ApiResponse.forbidden('Access denied');
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
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/goals/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'goal',
			entityId: params.id,
			operation: 'goal_full_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
