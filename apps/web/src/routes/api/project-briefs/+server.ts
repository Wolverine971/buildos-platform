// apps/web/src/routes/api/project-briefs/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, handleConditionalRequest } from '$lib/utils/api-response';

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

	try {
		const { data: briefs, error } = await supabase
			.from('project_daily_briefs')
			.select(
				`
				*,
				projects (
					name,
					description,
					slug
				)
			`
			)
			.eq('user_id', userId)
			.eq('brief_date', date as string)
			.order('created_at', { ascending: true });

		if (error) {
			throw error;
		}

		const responseData = {
			briefs: briefs || [],
			count: briefs?.length || 0
		};

		// Check for conditional request (304 Not Modified)
		const conditionalResponse = handleConditionalRequest(request, responseData);
		if (conditionalResponse) {
			return conditionalResponse;
		}

		// Briefs for specific dates don't change often, cache for 10 minutes
		return ApiResponse.cached(responseData, undefined, 600, {
			staleWhileRevalidate: 1800 // Allow stale data while revalidating for 30 minutes
		});
	} catch (error) {
		console.error('Error fetching project briefs:', error);
		return ApiResponse.databaseError(error);
	}
};
