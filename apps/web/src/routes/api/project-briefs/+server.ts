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

	const date = (
		url.searchParams.get('date') ||
		new Date().toISOString().split('T')[0] ||
		''
	).trim();
	const briefIdParam = url.searchParams.get('brief_id')?.trim() || null;
	const userId = url.searchParams.get('userId') || user.id;
	if (!userId) {
		return ApiResponse.badRequest('User ID is required');
	}

	try {
		let resolvedBriefId: string | null = briefIdParam;
		let resolvedBriefDate = date;

		if (resolvedBriefId) {
			const { data: briefRow, error: briefError } = await supabase
				.from('ontology_daily_briefs')
				.select('id, brief_date')
				.eq('id', resolvedBriefId)
				.eq('user_id', userId)
				.maybeSingle();

			if (briefError) {
				throw briefError;
			}

			if (!briefRow?.id) {
				return ApiResponse.success({
					briefs: [],
					count: 0,
					activeBriefId: null
				});
			}

			resolvedBriefId = briefRow.id;
			resolvedBriefDate = briefRow.brief_date;
		} else {
			const { data: latestBriefRow, error: latestBriefError } = await supabase
				.from('ontology_daily_briefs')
				.select('id, brief_date')
				.eq('user_id', userId)
				.eq('brief_date', date)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (latestBriefError && latestBriefError.code !== 'PGRST116') {
				throw latestBriefError;
			}

			if (!latestBriefRow?.id) {
				return ApiResponse.success({
					briefs: [],
					count: 0,
					activeBriefId: null
				});
			}

			resolvedBriefId = latestBriefRow.id;
			resolvedBriefDate = latestBriefRow.brief_date;
		}

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
			.eq('daily_brief_id', resolvedBriefId)
			.order('created_at', { ascending: true });

		if (error) {
			throw error;
		}

		const mappedBriefs = ((briefs || []) as any[]).map((brief) =>
			mapOntologyProjectBriefRow({
				row: brief,
				userId,
				briefDate: brief.daily_brief?.brief_date || resolvedBriefDate,
				project: brief.project,
				generationStatus: brief.daily_brief?.generation_status
			})
		);

		const responseData = {
			briefs: mappedBriefs,
			count: mappedBriefs.length,
			activeBriefId: resolvedBriefId
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
