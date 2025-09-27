// src/routes/api/search/more/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody, requireAuth } from '$lib/utils/api-response';
import type { SearchResult } from '$lib/types/search';

interface LoadMoreRequest {
	query: string;
	type: 'braindump' | 'project' | 'task';
	offset?: number;
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
		const data = await parseRequestBody<LoadMoreRequest>(request);
		if (!data) {
			return ApiResponse.badRequest('Invalid request body');
		}

		// Validate required fields
		if (!data.query || typeof data.query !== 'string') {
			return ApiResponse.badRequest('Search query is required');
		}

		if (!data.type || !['braindump', 'project', 'task'].includes(data.type)) {
			return ApiResponse.badRequest(
				'Valid search type is required (braindump, project, or task)'
			);
		}

		const trimmedQuery = data.query.trim();
		if (trimmedQuery.length < 2) {
			return ApiResponse.badRequest('Search query must be at least 2 characters');
		}

		// Default offset to 0 if not provided
		const offset = typeof data.offset === 'number' && data.offset >= 0 ? data.offset : 0;

		// Call the type-specific search function
		const { data: searchResults, error } = await locals.supabase.rpc('search_by_type' as any, {
			search_query: trimmedQuery,
			current_user_id: user.id,
			search_type: data.type,
			page_offset: offset,
			page_limit: 20
		});

		if (error) {
			console.error('Search by type RPC error:', error);
			return ApiResponse.databaseError(error);
		}

		// Type the results properly
		const results = (searchResults || []) as SearchResult[];

		// Check if there are more results (if we got the full page size)
		const hasMore = results.length === 20;

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
		console.error('Search more endpoint error:', error);
		return ApiResponse.internalError(error, 'Failed to load more search results');
	}
};
