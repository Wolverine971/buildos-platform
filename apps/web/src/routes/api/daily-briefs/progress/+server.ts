// apps/web/src/routes/api/daily-briefs/progress/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0]!;

	try {
		const { data: brief } = await supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', date)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (!brief) {
			return ApiResponse.success({
				exists: false,
				progress: null
			});
		}

		const { data: projectBriefs } = await supabase
			.from('ontology_project_briefs')
			.select('id, project_id, brief_content, project:onto_projects!inner(name)')
			.eq('daily_brief_id', brief.id);

		const completedCount = projectBriefs?.length || 0;
		const projectProgress = {
			total: completedCount,
			completed: completedCount,
			failed: 0,
			briefs:
				projectBriefs?.map((item: any) => ({
					id: item.id,
					project_name: item.project?.name || 'Project',
					content: item.brief_content
				})) || []
		};

		const summaryContent = brief.executive_summary || brief.llm_analysis || '';

		return ApiResponse.success({
			exists: true,
			brief_status: brief.generation_status,
			main_brief:
				brief.generation_status === 'completed'
					? {
							id: brief.id,
							content: summaryContent,
							priority_actions: brief.priority_actions || []
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
		return ApiResponse.internalError(err, 'Failed to get brief progress');
	}
};
