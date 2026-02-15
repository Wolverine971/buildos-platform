// apps/web/src/routes/api/daily-briefs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { mapOntologyDailyBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const briefDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0]!;

	try {
		const { data: brief, error } = await supabase
			.from('ontology_daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', briefDate)
			.order('created_at', { ascending: false })
			.order('id', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (error && error.code !== 'PGRST116') {
			throw error;
		}

		return ApiResponse.success({
			brief: brief ? mapOntologyDailyBriefRow(brief) : null
		});
	} catch (error) {
		console.error('Error fetching daily brief:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily brief');
	}
};
