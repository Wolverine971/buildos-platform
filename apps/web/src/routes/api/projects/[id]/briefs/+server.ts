// apps/web/src/routes/api/projects/[id]/briefs/+server.ts
// import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

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
		// Verify user owns the project
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('id, name')
			.eq('id', projectId)
			.eq('user_id', user.id)
			.single();

		if (projectError || !project) {
			return ApiResponse.badRequest('Project not found');
		}

		// Load project briefs
		const { data: briefs, error: briefsError } = await supabase
			.from('project_daily_briefs')
			.select(
				'id, brief_content, brief_date, created_at, metadata, generation_status, generation_error'
			)
			.eq('project_id', projectId)
			.eq('user_id', user.id)
			.order('brief_date', { ascending: false })
			.limit(50); // Reasonable limit

		if (briefsError) {
			console.error('Error loading briefs:', briefsError);
			return ApiResponse.badRequest('Failed to load briefs');
		}

		// Transform briefs data
		const transformedBriefs = (briefs || []).map((brief) => ({
			...brief,
			project_name: project.name,
			project_id: projectId
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
