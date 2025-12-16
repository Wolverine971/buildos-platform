// apps/web/src/routes/api/onto/outputs/[id]/full/+server.ts
/**
 * GET /api/onto/outputs/[id]/full - Get output with all related data in a single request
 *
 * Returns output data and linked entities in one response,
 * reducing the number of API calls needed to load the OutputEditModal.
 *
 * Performance optimization endpoint that consolidates:
 * - Output data with project verification
 * - Linked entities (tasks, plans, goals, documents)
 *
 * Documentation:
 * - Ontology System: /apps/web/docs/features/ontology/README.md
 * - Performance: Modal optimization pattern
 *
 * Related Files:
 * - UI Component: /apps/web/src/lib/components/ontology/OutputEditModal.svelte
 * - Output Endpoint: /apps/web/src/routes/api/onto/outputs/[id]/+server.ts
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
	const outputId = params.id;

	try {
		// Phase 1: Parallelize initial queries
		const [actorResult, outputResult] = await Promise.all([
			supabase.rpc('ensure_actor_for_user', { p_user_id: session.user.id }),
			supabase
				.from('onto_outputs')
				.select(
					`
					*,
					project:onto_projects!inner(
						id,
						created_by
					)
				`
				)
				.eq('id', outputId)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: output, error: outputError } = outputResult;

		if (actorError || !actorId) {
			console.error('[Output Full GET] Failed to resolve actor:', actorError);
			return ApiResponse.error('Failed to get user actor', 500);
		}

		if (outputError || !output) {
			return ApiResponse.error('Output not found', 404);
		}

		// Authorization check
		if (output.project.created_by !== actorId) {
			return ApiResponse.error('Access denied', 403);
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, outputId, 'output');

		// Remove nested project data from response
		const { project, ...outputData } = output;

		return ApiResponse.success({
			output: outputData,
			linkedEntities
		});
	} catch (error) {
		console.error('[Output Full GET] Error fetching output data:', error);
		return ApiResponse.error('Internal server error', 500);
	}
};
