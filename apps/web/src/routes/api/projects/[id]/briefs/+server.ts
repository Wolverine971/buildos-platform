// apps/web/src/routes/api/projects/[id]/briefs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { verifyProjectAccess } from '$lib/utils/api-helpers';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { safeGetSession, supabase } = locals;
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	const projectId = params.id;
	if (!projectId) {
		return ApiResponse.badRequest('Project ID is required');
	}

	try {
		const access = await verifyProjectAccess(supabase, projectId, user.id);
		if (!access.authorized) {
			return access.error || ApiResponse.forbidden('Access denied');
		}

		const { data: briefs, error } = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				project_id,
				brief_content,
				metadata,
				created_at,
				updated_at,
				daily_brief:ontology_daily_briefs!inner(user_id, brief_date, generation_status, generation_error),
				project:onto_projects(id, name)
			`
			)
			.eq('project_id', projectId)
			.eq('daily_brief.user_id', user.id)
			.order('brief_date', { ascending: false, foreignTable: 'daily_brief' })
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error loading briefs:', error);
			return ApiResponse.badRequest('Failed to load briefs');
		}

		const projectName = (briefs as any[])?.[0]?.project?.name || 'Project';
		const transformedBriefs = ((briefs || []) as any[]).map((brief) => ({
			id: brief.id,
			project_id: brief.project_id,
			brief_content: brief.brief_content,
			brief_date: brief.daily_brief?.brief_date,
			created_at: brief.created_at,
			updated_at: brief.updated_at,
			metadata: brief.metadata,
			generation_status: brief.daily_brief?.generation_status,
			generation_error: brief.daily_brief?.generation_error,
			project_name: brief.project?.name || projectName
		}));

		return ApiResponse.success({
			briefs: transformedBriefs,
			count: transformedBriefs.length
		});
	} catch (error) {
		console.error('Error in project briefs API:', error);
		return ApiResponse.databaseError('Internal server error');
	}
};
