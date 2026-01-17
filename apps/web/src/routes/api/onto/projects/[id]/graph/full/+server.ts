// apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts
/**
 * GET /api/onto/projects/[id]/graph/full
 * Returns the full project graph payload (all entities + edges).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;
		if (user) {
			const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

			if (actorResult.error || !actorResult.data) {
				console.error(
					'[Project Graph Full API] Failed to resolve actor',
					actorResult.error
				);
				return ApiResponse.error('Failed to resolve user actor', 500);
			}
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Project Graph Full API] Failed to check access', accessError);
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return user
				? ApiResponse.forbidden('You do not have permission to access this project')
				: ApiResponse.notFound('Project not found');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		const data = await loadProjectGraphData(supabase, id, { excludeCompletedTasks: true });

		return ApiResponse.success({
			graph: data,
			metadata: {
				projectId: id,
				queryPattern: 'project-graph-loader',
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Project Graph Full API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load project graph');
	}
};
