// apps/web/src/routes/api/onto/braindumps/+server.ts
/**
 * Ontology capture API endpoint for agent chat.
 *
 * This endpoint stores raw captured context for ontology/history processing.
 *
 * POST: Create a new captured context record
 * - Saves the raw content to onto_braindumps
 * - Queues async processing to generate title, topics, and summary
 *
 * GET: List user's captured context records
 * - Returns paginated list of captures
 * - Supports filtering by status
 */
import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { queueBraindumpProcessing } from '$lib/server/braindump-processing.service';

export const POST: RequestHandler = async ({ request, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Parse request body
		const body = await request.json();
		const { content, metadata = {}, chat_session_id } = body;

		// Validate required fields
		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			return ApiResponse.badRequest('Content is required');
		}

		// Validate content length (reasonable limits)
		const trimmedContent = content.trim();
		if (trimmedContent.length > 50000) {
			return ApiResponse.badRequest('Content exceeds maximum length of 50,000 characters');
		}

		// Create the captured context record.
		const braindumpData = {
			user_id: user.id,
			content: trimmedContent,
			status: 'pending' as const,
			metadata: {
				...metadata,
				source: 'agent_chat',
				content_length: trimmedContent.length,
				created_via: 'agent_chat'
			},
			chat_session_id: chat_session_id || null
		};

		const { data: braindump, error: createError } = await supabase
			.from('onto_braindumps')
			.insert(braindumpData)
			.select('id, content, status, created_at, metadata')
			.single();

		if (createError) {
			console.error('Error creating captured context:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Queue async processing (fire-and-forget)
		// This will generate title, topics, and summary in the background
		queueBraindumpProcessing({ braindumpId: braindump.id, userId: user.id }).catch((err) => {
			// Silently log - processing is optional enhancement
			console.warn('Failed to queue captured context processing:', err);
		});

		return ApiResponse.created({
			braindump: {
				id: braindump.id,
				status: braindump.status,
				created_at: braindump.created_at
			},
			message: 'Captured context saved successfully'
		});
	} catch (error) {
		console.error('Error in captured context create endpoint:', error);
		return ApiResponse.internalError(error);
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized('Authentication required');
	}

	const supabase = locals.supabase;

	try {
		// Parse query parameters
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
		const offset = parseInt(url.searchParams.get('offset') || '0');
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
