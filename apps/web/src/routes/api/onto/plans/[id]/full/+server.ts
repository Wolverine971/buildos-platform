// apps/web/src/routes/api/onto/plans/[id]/full/+server.ts
/**
 * GET /api/onto/plans/[id]/full - Get plan with all related data in a single request
 *
 * Returns plan data and linked entities in one response,
 * reducing the number of API calls needed to load the PlanEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Plan data with project verification
 * - Linked entities (goals, tasks, documents, milestones, outputs)
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Performance: Modal optimization pattern
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/PlanEditModal.svelte
 * - Plan Endpoint: /apps/web/src/routes/api/onto/plans/[id]/+server.ts
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
	const planId = params.id;

	try {
		// Phase 1: Parallelize initial queries
		const [actorResult, planResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_plans')
				.select(
					`
					*,
					project:onto_projects!inner(
						id,
						created_by
					)
				`
				)
				.eq('id', planId)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: plan, error: planError } = planResult;

		if (actorError || !actorId) {
			console.error('[Plan Full GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (planError || !plan) {
			return ApiResponse.error('Plan not found', 404);
		}

		// Authorization check
		if (plan.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, planId, 'plan');

		// Remove nested project data from response
		const { project, ...planData } = plan;

		return ApiResponse.success({
			plan: planData,
			linkedEntities
		});
	} catch (error) {
		console.error('[Plan Full GET] Error fetching plan data:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
