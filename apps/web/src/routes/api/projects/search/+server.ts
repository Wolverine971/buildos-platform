// apps/web/src/routes/api/projects/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePagination, buildSearchFilter } from '$lib/utils/api-helpers';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Get and validate search parameters (security fix: 2026-01-03)
		const rawQuery = url.searchParams.get('q') || '';
		const { page, limit, offset } = validatePagination(url, { defaultLimit: 20, maxLimit: 50 });

		if (rawQuery.length < 2) {
			return ApiResponse.success({
				projects: [],
				total: 0,
				page,
				limit
			});
		}

		// Build sanitized search filter (security fix: 2026-01-03)
		const searchFilter = buildSearchFilter(rawQuery, ['name', 'description']);
		if (!searchFilter) {
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
			.or(searchFilter);

		if (countError) {
			return ApiResponse.databaseError(countError);
		}

		// Get paginated search results
		const { data: projects, error: searchError } = await supabase
			.from('projects')
			.select('*')
			.eq('user_id', user.id)
			.eq('status', 'active')
			.or(searchFilter)
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
			query: rawQuery
		});
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
