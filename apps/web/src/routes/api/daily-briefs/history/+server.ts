// apps/web/src/routes/api/daily-briefs/history/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { mapOntologyDailyBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
	const rawLimit = parseInt(url.searchParams.get('limit') || '50', 10);
	const limit = Math.min(Math.max(rawLimit, 1), 100);
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');
	const search = url.searchParams.get('search')?.trim();
	const offset = (page - 1) * limit;

	try {
		// Narrowed select: drop `llm_analysis` (unbounded LLM output, 5–50 KB per brief).
		// For full analysis, callers should use the single-brief endpoint at `/briefs?brief_id=...`.
		// `count: 'estimated'` per project convention — list pagination tolerates approximation.
		let query = supabase
			.from('ontology_daily_briefs')
			.select(
				'id, user_id, brief_date, executive_summary, priority_actions, generation_status, generation_error, generation_started_at, generation_completed_at, metadata, created_at, updated_at',
				{ count: 'estimated' }
			)
			.eq('user_id', userId);

		if (startDate) {
			query = query.gte('brief_date', startDate);
		}
		if (endDate) {
			query = query.lte('brief_date', endDate);
		}
		if (search) {
			query = query.or(`executive_summary.ilike.%${search}%,llm_analysis.ilike.%${search}%`);
		}

		query = query
			.order('brief_date', { ascending: false })
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		const { data: briefs, error, count } = await query;

		if (error) throw error;

		return ApiResponse.success({
			briefs: (briefs || []).map((row: any) => mapOntologyDailyBriefRow(row)),
			pagination: {
				page,
				limit,
				total: count || 0,
				totalPages: Math.ceil((count || 0) / limit),
				hasNext: offset + limit < (count || 0),
				hasPrev: page > 1
			}
		});
	} catch (error) {
		console.error('Error fetching brief history:', error);
		return ApiResponse.internalError(error, 'Failed to fetch brief history');
	}
};
