// apps/web/src/routes/api/onto/projects/[id]/full/+server.ts
/**
 * GET /api/onto/projects/[id]/full
 * OPTIMIZED: Fetch project with all related entities using single RPC
 *
 * This endpoint uses the get_project_full() database function which
 * fetches all project data in a single database round-trip, replacing
 * 13+ separate queries.
 *
 * Performance improvement: ~100-300ms faster than the standard endpoint
 *
 * Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';

// Type for the RPC response
interface ProjectFullData {
	project: Record<string, unknown>;
	goals: unknown[];
	requirements: unknown[];
	plans: unknown[];
	tasks: unknown[];
	outputs: unknown[];
	documents: unknown[];
	sources: unknown[];
	milestones: unknown[];
	risks: unknown[];
	decisions: unknown[];
	metrics: unknown[];
	context_document: unknown | null;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();

		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;
		let actorId: string | null = null;

		// Get actor ID for authorization check
		if (user) {
			const { data, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
				p_user_id: user.id
			});

			if (actorError || !data) {
				console.error('[Project Full API] Failed to get actor:', actorError);
				await logOntologyApiError({
					supabase,
					error: actorError || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}/full`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_actor_resolve'
				});
				return ApiResponse.internalError(
					actorError || new Error('Failed to resolve user actor'),
					'Failed to resolve user actor'
				);
			}

			actorId = data as string;
		}

		// OPTIMIZED: Single RPC call for all project data
		const { data, error } = (await supabase.rpc('get_project_full', {
			p_project_id: id,
			p_actor_id: actorId
		})) as { data: ProjectFullData | null; error: unknown };

		if (error) {
			console.error('[Project Full API] RPC error:', error);
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${id}/full`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_full_get'
			});
			const errorMessage = error instanceof Error ? error.message : String(error);
			return ApiResponse.error(`Failed to fetch project: ${errorMessage}`, 500);
		}

		if (!data) {
			return ApiResponse.notFound('Project');
		}

		return ApiResponse.success({
			project: data.project,
			goals: data.goals || [],
			requirements: data.requirements || [],
			plans: data.plans || [],
			tasks: data.tasks || [],
			outputs: data.outputs || [],
			documents: data.documents || [],
			sources: data.sources || [],
			milestones: data.milestones || [],
			risks: data.risks || [],
			decisions: data.decisions || [],
			metrics: data.metrics || [],
			context_document: data.context_document
		});
	} catch (err) {
		console.error('[Project Full API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_full_get'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
