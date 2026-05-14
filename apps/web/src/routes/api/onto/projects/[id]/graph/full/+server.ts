// apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts
/**
 * GET /api/onto/projects/[id]/graph/full
 * Returns the full project graph payload (all entities + edges).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { id } = params;
		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const access = await requireProjectMemberAccess({
			locals,
			projectId: id,
			requiredAccess: 'read',
			notFoundMessage: 'Project not found'
		});
		if (!access.ok) return access.response;

		const supabase = locals.supabase;
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
