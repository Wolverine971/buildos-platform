// src/routes/api/projects/briefs-count/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		// Get project IDs from query params
		const projectIds = url.searchParams.get('projectIds')?.split(',') || [];

		if (projectIds.length === 0) {
			return ApiResponse.success({ briefCounts: {} });
		}

		// Fetch brief counts for the specified projects
		const briefCounts: Record<string, number> = {};

		// Get daily briefs count for each project
		const { data: briefsData, error: briefsError } = await supabase
			.from('daily_briefs')
			.select('project_id')
			.in('project_id', projectIds)
			.eq('user_id', user.id);

		if (briefsError) {
			console.error('Error fetching briefs count:', briefsError);
			return ApiResponse.error('Failed to fetch briefs count');
		}

		// Count briefs per project
		projectIds.forEach((projectId) => {
			briefCounts[projectId] = 0;
		});

		briefsData?.forEach((brief) => {
			if (brief.project_id) {
				briefCounts[brief.project_id] = (briefCounts[brief.project_id] || 0) + 1;
			}
		});

		return ApiResponse.success({ briefCounts });
	} catch (error) {
		console.error('Error in briefs count API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};
