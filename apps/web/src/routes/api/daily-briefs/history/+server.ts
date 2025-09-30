// apps/web/src/routes/api/daily-briefs/history/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;

	// Query parameters for pagination and filtering
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '50');
	const startDate = url.searchParams.get('start_date');
	const endDate = url.searchParams.get('end_date');
	const search = url.searchParams.get('search');

	const offset = (page - 1) * limit;

	try {
		// Build the query
		let query = supabase.from('daily_briefs').select('*').eq('user_id', userId);

		// Apply date filters
		if (startDate) {
			query = query.gte('brief_date', startDate);
		}
		if (endDate) {
			query = query.lte('brief_date', endDate);
		}

		// Apply search filter (searches in summary_content and insights)
		if (search) {
			query = query.or(`summary_content.ilike.%${search}%,insights.ilike.%${search}%`);
		}

		// Apply pagination and ordering
		query = query.order('brief_date', { ascending: false }).range(offset, offset + limit - 1);

		const { data: briefs, error, count } = await query;

		if (error) throw error;

		// Get total count for pagination info
		let totalQuery = supabase
			.from('daily_briefs')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId);

		if (startDate) {
			totalQuery = totalQuery.gte('brief_date', startDate);
		}
		if (endDate) {
			totalQuery = totalQuery.lte('brief_date', endDate);
		}
		if (search) {
			totalQuery = totalQuery.or(
				`summary_content.ilike.%${search}%,insights.ilike.%${search}%`
			);
		}

		const { count: totalCount } = await totalQuery;

		return json({
			briefs: briefs || [],
			pagination: {
				page,
				limit,
				total: totalCount || 0,
				totalPages: Math.ceil((totalCount || 0) / limit),
				hasNext: offset + limit < (totalCount || 0),
				hasPrev: page > 1
			}
		});
	} catch (error) {
		console.error('Error fetching brief history:', error);
		return json({ error: 'Failed to fetch brief history' }, { status: 500 });
	}
};
