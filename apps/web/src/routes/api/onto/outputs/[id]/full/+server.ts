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
import { logOntologyApiError } from '../../../shared/error-logging';

export const GET: RequestHandler = async ({ params, locals }) => {
	const session = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized('Authentication required');
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
					name
				)
			`
				)
				.eq('id', outputId)
				.is('deleted_at', null)
				.single()
		]);

		const { data: actorId, error: actorError } = actorResult;
		const { data: output, error: outputError } = outputResult;
		const projectId = output?.project?.id;

		if (actorError || !actorId) {
			console.error('[Output Full GET] Failed to resolve actor:', actorError);
			await logOntologyApiError({
				supabase,
				error: actorError || new Error('Failed to resolve user actor'),
				endpoint: `/api/onto/outputs/${outputId}/full`,
				method: 'GET',
				userId: session.user.id,
				entityType: 'output',
				entityId: outputId,
				operation: 'output_actor_resolve'
			});
			return ApiResponse.internalError(
				actorError || new Error('Failed to get user actor'),
				'Failed to get user actor'
			);
		}

		if (outputError || !output) {
			if (outputError) {
				console.error('[Output Full GET] Failed to fetch output:', outputError);
				await logOntologyApiError({
					supabase,
					error: outputError,
					endpoint: `/api/onto/outputs/${outputId}/full`,
					method: 'GET',
					userId: session.user.id,
					projectId,
					entityType: 'output',
					entityId: outputId,
					operation: 'output_full_fetch',
					tableName: 'onto_outputs'
				});
				return ApiResponse.databaseError(outputError);
			}
			return ApiResponse.notFound('Output');
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: output.project.id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Output Full GET] Failed to check access:', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/outputs/${outputId}/full`,
				method: 'GET',
				userId: session.user.id,
				projectId,
				entityType: 'output',
				entityId: outputId,
				operation: 'output_access_check'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('Access denied');
		}

		// Phase 2: Fetch linked entities (can run after auth is verified)
		const linkedEntities = await resolveLinkedEntitiesGeneric(supabase, outputId, 'output');

		// Extract project data and include project name in response
		const { project, ...outputData } = output;

		return ApiResponse.success({
			output: { ...outputData, project: { name: project.name } },
			linkedEntities
		});
	} catch (error) {
		console.error('[Output Full GET] Error fetching output data:', error);
		await logOntologyApiError({
			supabase: locals.supabase,
			error,
			endpoint: `/api/onto/outputs/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			entityType: 'output',
			entityId: params.id,
			operation: 'output_full_get'
		});
		return ApiResponse.internalError(error, 'Internal server error');
	}
};
