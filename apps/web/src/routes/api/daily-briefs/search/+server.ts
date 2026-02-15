// apps/web/src/routes/api/daily-briefs/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const query = url.searchParams.get('q')?.trim();
	const limit = parseInt(url.searchParams.get('limit') || '10', 10);

	if (!query) {
		return ApiResponse.success({ results: [] });
	}

	try {
		const [dailyBriefs, projectBriefs] = await Promise.all([
			supabase
				.from('ontology_daily_briefs')
				.select(
					'id, brief_date, executive_summary, llm_analysis, priority_actions, created_at'
				)
				.eq('user_id', user.id)
				.or(`executive_summary.ilike.%${query}%,llm_analysis.ilike.%${query}%`)
				.order('brief_date', { ascending: false })
				.limit(limit),
			supabase
				.from('ontology_project_briefs')
				.select(
					`
					id,
					brief_content,
					created_at,
					project:onto_projects(name),
					daily_brief:ontology_daily_briefs!inner(brief_date, user_id)
				`
				)
				.eq('daily_brief.user_id', user.id)
				.ilike('brief_content', `%${query}%`)
				.order('created_at', { ascending: false })
				.limit(limit)
		]);

		const results = [
			...((dailyBriefs.data || []) as any[]).map((brief) => {
				const content = brief.executive_summary || brief.llm_analysis || '';
				return {
					type: 'daily' as const,
					id: brief.id,
					date: brief.brief_date,
					title: `Daily Brief - ${new Date(brief.brief_date).toLocaleDateString()}`,
					content,
					preview: content.substring(0, 200) + '...',
					created_at: brief.created_at
				};
			}),
			...((projectBriefs.data || []) as any[]).map((brief) => {
				const date = brief.daily_brief?.brief_date || brief.created_at;
				const projectName = brief.project?.name || 'Project';
				return {
					type: 'project' as const,
					id: brief.id,
					date,
					title: `${projectName} Brief - ${new Date(date).toLocaleDateString()}`,
					content: brief.brief_content,
					preview: brief.brief_content.substring(0, 200) + '...',
					created_at: brief.created_at,
					project_name: projectName
				};
			})
		];

		const normalizedQuery = query.toLowerCase();
		const sortedResults = results
			.sort((a, b) => {
				const aIndex = a.content.toLowerCase().indexOf(normalizedQuery);
				const bIndex = b.content.toLowerCase().indexOf(normalizedQuery);

				if (aIndex !== -1 && bIndex !== -1) {
					return aIndex - bIndex;
				}
				if (aIndex !== -1) return -1;
				if (bIndex !== -1) return 1;

				return new Date(b.date).getTime() - new Date(a.date).getTime();
			})
			.slice(0, limit);

		return ApiResponse.success({
			results: sortedResults,
			total: results.length,
			query
		});
	} catch (error) {
		console.error('Error searching briefs:', error);
		return ApiResponse.internalError(error, 'Failed to search briefs');
	}
};
