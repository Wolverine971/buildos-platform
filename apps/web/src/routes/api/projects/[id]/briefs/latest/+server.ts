// apps/web/src/routes/api/projects/[id]/briefs/latest/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Unauthorized');
	}

	try {
		// First, verify the project belongs to the user
		const { data: project, error: projectError } = await supabase
			.from('projects')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (projectError) {
			return ApiResponse.notFound('Project');
		}

		if (project.user_id !== user.id) {
			return ApiResponse.forbidden('Forbidden');
		}

		// Get the latest brief for this project
		const { data: brief, error: briefError } = await supabase
			.from('project_daily_briefs')
			.select('*')
			.eq('project_id', params.id)
			.eq('user_id', user.id)
			.order('brief_date', { ascending: false })
			.limit(1)
			.single();

		if (briefError) {
			if (briefError.code === 'PGRST116') {
				// No brief found - this is okay
				return ApiResponse.success({ brief: null });
			}
			console.error('Error fetching latest project brief:', briefError);
			return ApiResponse.internalError(briefError, briefError.message);
		}

		return ApiResponse.success({ brief });
	} catch (err) {
		console.error('Error in GET /api/projects/[id]/briefs/latest:', err);
		return ApiResponse.internalError(err, 'Internal server error');
	}
};
