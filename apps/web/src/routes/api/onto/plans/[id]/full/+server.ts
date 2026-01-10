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
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
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
						name
					)
				`
				)
				.eq('id', planId)
				.is('deleted_at', null)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: plan, error: planError } = planResult;
		const projectId = plan?.project?.id;

		if (actorError || !actorId) {
			console.error('[Plan Full GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/plans/${planId}/full`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'plan',
				entityId: planId,
				operation: 'plan_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (planError || !plan) {
			if (planError) {
				console.error('[Plan Full GET] Failed to fetch plan:', planError);
				await logOntologyApiError({
					supabase,
					error: planError,
					endpoint: `/api/onto/plans/${planId}/full`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'plan',
					entityId: planId,
					operation: 'plan_full_fetch',
					tableName: 'onto_plans'
				});
				return ApiResponse.databaseError(planError);
			}
			return ApiResponse.notFound('Plan');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: plan.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Plan Full GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/plans/${planId}/full`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'plan',
				entityId: planId,
				operation: 'plan_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, planId, 'plan');

		// Extract project data and include project name in response
		const { project, ...planData } = plan;

		return ApiResponse.success({
			plan: { ...planData, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Plan Full GET] Error fetching plan data:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/plans/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'plan',
			entityId: params.id,
			operation: 'plan_full_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
