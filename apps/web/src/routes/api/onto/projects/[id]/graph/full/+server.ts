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

		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const supabase = locals.supabase;
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Project Graph Full API] Failed to resolve actor', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		const data = await loadProjectGraphData(supabase, id);

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
