// apps/web/src/routes/api/project-briefs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, handleConditionalRequest } from '$lib/utils/api-response';
import { mapOntologyProjectBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({
	url,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
	const userId = url.searchParams.get('userId') || user.id;
	if (!userId) {
		return ApiResponse.badRequest('User ID is required');
	}

	try {
		const { data: briefs, error } = await supabase
			.from('ontology_project_briefs')
			.select(
				`
				id,
				daily_brief_id,
				project_id,
				brief_content,
				metadata,
				created_at,
				updated_at,
				daily_brief:ontology_daily_briefs!inner(brief_date, user_id, generation_status),
				project:onto_projects(id, name, description)
			`
			)
			.eq('daily_brief.user_id', userId)
			.eq('daily_brief.brief_date', date)
			.order('created_at', { ascending: true });

		if (error) {
			throw error;
		}

		const mappedBriefs = ((briefs || []) as any[]).map((brief) =>
			mapOntologyProjectBriefRow({
				row: brief,
				userId,
				briefDate: brief.daily_brief?.brief_date || date,
				project: brief.project,
				generationStatus: brief.daily_brief?.generation_status
			})
		);

		const responseData = {
			briefs: mappedBriefs,
			count: mappedBriefs.length
		};

		const conditionalResponse = handleConditionalRequest(request, responseData);
		if (conditionalResponse) {
			return conditionalResponse;
		}

		return ApiResponse.cached(responseData, undefined, 600, {
			staleWhileRevalidate: 1800
		});
	} catch (error) {
		console.error('Error fetching project briefs:', error);
		return ApiResponse.databaseError(error);
	}
};
