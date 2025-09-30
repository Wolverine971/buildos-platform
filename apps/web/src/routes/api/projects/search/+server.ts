// apps/web/src/routes/api/projects/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get search parameters
		const query = url.searchParams.get('q') || '';
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const offset = (page - 1) * limit;

		if (query.length < 2) {
			return ApiResponse.success({
				projects: [],
				total: 0,
				page,
				limit
			});
		}

		// Get total count for search results
		const { count, error: countError } = await supabase
			.from('projects')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', user.id)
			.eq('status', 'active')
			.or(`name.ilike.%${query}%,description.ilike.%${query}%`);

		if (countError) {
			return ApiResponse.databaseError(countError);
		}

		// Get paginated search results
		const { data: projects, error: searchError } = await supabase
			.from('projects')
			.select('*')
			.eq('user_id', user.id)
			.eq('status', 'active')
			.or(`name.ilike.%${query}%,description.ilike.%${query}%`)
			.order('updated_at', { ascending: false })
			.range(offset, offset + limit - 1);

		if (searchError) {
			return ApiResponse.databaseError(searchError);
		}

		return ApiResponse.success({
			projects: projects || [],
			total: count || 0,
			page,
			limit,
			query
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
