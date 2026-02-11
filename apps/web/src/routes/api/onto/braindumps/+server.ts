// apps/web/src/routes/api/onto/braindumps/+server.ts
/**
 * Braindump API Endpoint for the Agent Chat braindump context
 *
 * This endpoint handles raw braindump capture from the agent chat modal.
 * Braindumps can be saved directly or used as conversation starters.
 *
 * POST: Create a new braindump
 * - Saves the raw content to onto_braindumps
 * - Queues async processing to generate title, topics, and summary
 *
 * GET: List user's braindumps
 * - Returns paginated list of braindumps
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

		// Create the braindump
		const braindumpData = {
			user_id: user.id,
			content: trimmedContent,
			status: 'pending' as const,
			metadata: {
				...metadata,
				source: 'agent_chat',
				content_length: trimmedContent.length,
				created_via: 'braindump_context'
			},
			chat_session_id: chat_session_id || null
		};

		const { data: braindump, error: createError } = await supabase
			.from('onto_braindumps')
			.insert(braindumpData)
			.select('id, content, status, created_at, metadata')
			.single();

		if (createError) {
			console.error('Error creating braindump:', createError);
			return ApiResponse.databaseError(createError);
		}

		// Queue async processing (fire-and-forget)
		// This will generate title, topics, and summary in the background
		queueBraindumpProcessing({ braindumpId: braindump.id, userId: user.id }).catch((err) => {
			// Silently log - processing is optional enhancement
			console.warn('Failed to queue braindump processing:', err);
		});

		return ApiResponse.created({
			braindump: {
				id: braindump.id,
				status: braindump.status,
				created_at: braindump.created_at
			},
			message: 'Braindump saved successfully'
		});
	} catch (error) {
		console.error('Error in braindump create endpoint:', error);
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

		// Build query
		let query = supabase
			.from('onto_braindumps')
			.select(
				'id, title, topics, summary, status, content, created_at, updated_at, chat_session_id, metadata',
				{ count: 'exact' }
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
			console.error('Error fetching braindumps:', error);
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
		console.error('Error in braindump list endpoint:', error);
		return ApiResponse.internalError(error);
	}
};
