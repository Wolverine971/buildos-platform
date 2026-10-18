// apps/web/src/routes/api/onto/braindumps/+server.ts
/**
 * Ontology capture history API endpoint.
 *
 * GET: List user's captured context records (legacy onto_braindumps rows)
 * - Returns paginated list of captures
 * - Supports filtering by status
 */
import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { validatePaginationCustom } from '$lib/utils/api-helpers';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Parse query parameters
		const { limit, offset } = validatePaginationCustom(
			{
				limit: url.searchParams.get('limit'),
				offset: url.searchParams.get('offset')
			},
			{ defaultLimit: 20, maxLimit: 100 }
		);
		const status = url.searchParams.get('status'); // pending, processing, processed, failed

		// Build query.
		// Narrowed select drops the raw `content` blob (up to 50 KB) — list callers
		// only render title/topics/summary/status. Detail endpoints still return content.
		// Switched count to 'estimated' (pg_class snapshot) — `total` is informational only.
		let query = supabase
			.from('onto_braindumps')
			.select(
				'id, title, topics, summary, status, created_at, updated_at, chat_session_id, metadata',
				{ count: 'estimated' }
			)
			.eq('user_id', user.id)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.range(offset, offset + limit - 1);

		// Apply status filter if provided
		if (status && ['pending', 'processing', 'processed', 'failed'].includes(status)) {
			query = query.eq(
				'status',
				status as Database['public']['Enums']['onto_braindump_status']
			);
		}

		const { data: braindumps, error, count } = await query;

		if (error) {
			console.error('Error fetching captured context:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({
			braindumps: braindumps || [],
			total: count || 0,
			limit,
			offset,
			hasMore: (count || 0) > offset + limit
		});
	} catch (error) {
		console.error('Error in captured context list endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
