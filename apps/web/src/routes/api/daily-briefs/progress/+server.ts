// apps/web/src/routes/api/daily-briefs/progress/+server.ts
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const userId = user.id;
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	try {
		// Get main brief status
		const { data: brief } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', date)
			.single();

		if (!brief) {
			return ApiResponse.success({
				exists: false,
				progress: null
			});
		}

		// Get project brief progress
		const { data: projectBriefs } = await supabase
			.from('project_daily_briefs')
			.select('id, project_id, generation_status, brief_content, projects!inner(name)')
			.eq('user_id', userId)
			.eq('brief_date', date);

		const projectProgress = {
			total: projectBriefs?.length || 0,
			completed:
				projectBriefs?.filter((b) => b.generation_status === 'completed').length || 0,
			failed: projectBriefs?.filter((b) => b.generation_status === 'failed').length || 0,
			briefs:
				projectBriefs
					?.filter((b) => b.generation_status === 'completed')
					.map((b) => ({
						id: b.id,
						project_name: b.projects.name,
						content: b.brief_content
					})) || []
		};

		return ApiResponse.success({
			exists: true,
			brief_status: brief.generation_status,
			main_brief:
				brief.generation_status === 'completed'
					? {
							id: brief.id,
							content: brief.summary_content,
							priority_actions: brief.priority_actions
						}
					: null,
			projects: projectProgress,
			overall_progress: {
				total_items: projectProgress.total,
				completed_items: projectProgress.completed,
				failed_items: projectProgress.failed
			}
		});
	} catch (err) {
		console.error('Error getting brief progress:', err);
		throw error(500, 'Failed to get brief progress');
	}
};
