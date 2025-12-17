// apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts
/**
 * GET /api/onto/projects/[id]/briefs
 * Fetch paginated daily briefs for a project from ontology_project_briefs
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const { id: projectId } = params;
		if (!projectId) {
			return ApiResponse.badRequest('Project ID required');
		}

		// Parse pagination params
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '5', 10), 20);
		const offset = parseInt(url.searchParams.get('offset') || '0', 10);

		const supabase = locals.supabase;

		// Verify project access
		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Project Briefs API] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id, created_by')
			.eq('id', projectId)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project not found');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		// Fetch briefs from ontology_project_briefs with join to daily brief for date
		const {
			data: briefs,
			error: briefsError,
			count
		} = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				brief_content,
				metadata,
				created_at,
				daily_brief:ontology_daily_briefs!inner(
					id,
					brief_date,
					executive_summary,
					priority_actions
				)
			`,
				{ count: 'exact' }
			)
			.eq('project_id', projectId)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (briefsError) {
			console.error('[Project Briefs API] Failed to fetch briefs:', briefsError);
			return ApiResponse.error('Failed to fetch daily briefs', 500);
		}

		const total = count ?? 0;
		const hasMore = offset + (briefs?.length ?? 0) < total;

		// Transform the data for easier frontend consumption
		const transformedBriefs = (briefs || []).map((brief: any) => ({
			id: brief.id,
			brief_content: brief.brief_content,
			metadata: brief.metadata,
			created_at: brief.created_at,
			brief_date: brief.daily_brief?.brief_date,
			daily_brief_id: brief.daily_brief?.id,
			executive_summary: brief.daily_brief?.executive_summary,
			priority_actions: brief.daily_brief?.priority_actions
		}));

		return ApiResponse.success({
			briefs: transformedBriefs,
			total,
			hasMore
		});
	} catch (err) {
		console.error('[Project Briefs API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
