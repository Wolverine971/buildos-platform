// src/routes/api/daily-briefs/search/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;
	const query = url.searchParams.get('q')?.trim();
	const limit = parseInt(url.searchParams.get('limit') || '10');

	if (!query) {
		return json({ results: [] });
	}

	try {
		// Search across daily briefs, project briefs
		const [dailyBriefs, projectBriefs] = await Promise.all([
			// Search daily briefs
			supabase
				.from('daily_briefs')
				.select('id, brief_date, summary_content, insights, priority_actions, created_at')
				.eq('user_id', userId)
				.or(`summary_content.ilike.%${query}%,insights.ilike.%${query}%`)
				.order('brief_date', { ascending: false })
				.limit(limit),

			// Search project briefs
			supabase
				.from('project_daily_briefs')
				.select(
					`
                    id,
                    brief_date,
                    brief_content,
                    created_at,
                    projects (
                        name,
                        slug
                    )
                `
				)
				.eq('user_id', userId)
				.ilike('brief_content', `%${query}%`)
				.order('brief_date', { ascending: false })
				.limit(limit)
		]);

		const results = [
			...(dailyBriefs.data || []).map((brief) => ({
				type: 'daily' as const,
				id: brief.id,
				date: brief.brief_date,
				title: `Daily Brief - ${new Date(brief.brief_date).toLocaleDateString()}`,
				content: brief.summary_content,
				preview: brief.summary_content.substring(0, 200) + '...',
				created_at: brief.created_at
			})),
			...(projectBriefs.data || []).map((brief) => ({
				type: 'project' as const,
				id: brief.id,
				date: brief.brief_date,
				title: `${brief.projects?.name || 'Project'} Brief - ${new Date(brief.brief_date).toLocaleDateString()}`,
				content: brief.brief_content,
				preview: brief.brief_content.substring(0, 200) + '...',
				created_at: brief.created_at,
				project_name: brief.projects?.name
			}))
		];

		// Sort by relevance and date
		const sortedResults = results
			.sort((a, b) => {
				// Simple relevance scoring based on query position
				const aIndex = a.content.toLowerCase().indexOf(query.toLowerCase());
				const bIndex = b.content.toLowerCase().indexOf(query.toLowerCase());

				if (aIndex !== -1 && bIndex !== -1) {
					return aIndex - bIndex; // Earlier occurrences rank higher
				}
				if (aIndex !== -1) return -1;
				if (bIndex !== -1) return 1;

				// Fall back to date sorting
				return new Date(b.date).getTime() - new Date(a.date).getTime();
			})
			.slice(0, limit);

		return json({
			results: sortedResults,
			total: results.length,
			query
		});
	} catch (error) {
		console.error('Error searching briefs:', error);
		return json({ error: 'Failed to search briefs' }, { status: 500 });
	}
};
