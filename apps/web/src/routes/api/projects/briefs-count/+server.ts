// apps/web/src/routes/api/projects/briefs-count/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals, url }) => {
	const { safeGetSession, supabase } = locals;

	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.error('Unauthorized', 401);
		}

		const projectIds =
			url.searchParams
				.get('projectIds')
				?.split(',')
				.map((id) => id.trim())
				.filter(Boolean) || [];

		if (projectIds.length === 0) {
			return ApiResponse.success({ briefCounts: {} });
		}

		const briefCounts: Record<string, number> = {};
		for (const projectId of projectIds) {
			briefCounts[projectId] = 0;
		}

		const { data: briefsData, error: briefsError } = await supabase
			.from('ontology_project_briefs')
			.select('project_id, daily_brief:ontology_daily_briefs!inner(user_id)')
			.in('project_id', projectIds)
			.eq('daily_brief.user_id', user.id);

		if (briefsError) {
			console.error('Error fetching briefs count:', briefsError);
			return ApiResponse.error('Failed to fetch briefs count');
		}

		for (const brief of (briefsData as any[]) || []) {
			if (!brief.project_id) continue;
			briefCounts[brief.project_id] = (briefCounts[brief.project_id] || 0) + 1;
		}

		return ApiResponse.success({ briefCounts });
	} catch (error) {
		console.error('Error in briefs count API:', error);
		return ApiResponse.error('An unexpected error occurred');
	}
};
