// src/routes/api/search/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody, requireAuth } from '$lib/utils/api-response';
import type { SearchResult } from '$lib/types/search';

interface SearchRequest {
	query: string;
	userId?: string; // Optional since we'll get from session
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Validate authentication
		const authResult = await requireAuth(locals);
		if ('error' in authResult) {
			return authResult.error;
		}
		const { user } = authResult;
		if (!user) {
			return ApiResponse.unauthorized('User not found');
		}

		// Parse request body
		const data = await parseRequestBody<SearchRequest>(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		// Validate search query
		if (!data.query || typeof data.query !== 'string') {
			return ApiResponse.badRequest('Search query is required');
		}

		const trimmedQuery = data.query.trim();
		if (trimmedQuery.length < 2) {
			return ApiResponse.badRequest('Search query must be at least 2 characters');
		}

		// Call the Supabase RPC function
		const { data: searchResults, error } = await locals.supabase.rpc(
			'search_all_content' as any,
			{
				search_query: trimmedQuery,
				current_user_id: user.id,
				items_per_category: 5
			}
		);

		if (error) {
			console.error('Search RPC error:', error);
			return ApiResponse.databaseError(error);
		}

		// Type the results properly
		const results = (searchResults || []) as SearchResult[];

		// Check if there are more results available for each category
		const hasMore = {
			braindumps: results.filter((r) => r.item_type === 'braindump').length >= 5,
			projects: results.filter((r) => r.item_type === 'project').length >= 5,
			tasks: results.filter((r) => r.item_type === 'task').length >= 5
		};

		// Return success response with caching
		return ApiResponse.success(
			{
				results,
				hasMore
			},
			undefined,
			{
				maxAge: 60, // Cache for 1 minute
				public: false, // Private cache per user
				staleWhileRevalidate: 120 // Allow stale content for 2 minutes while revalidating
			}
		);
	} catch (error) {
		console.error('Search endpoint error:', error);
		return ApiResponse.internalError(error, 'Search operation failed');
	}
};
