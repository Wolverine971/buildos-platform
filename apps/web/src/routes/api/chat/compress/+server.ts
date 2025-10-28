// apps/web/src/routes/api/chat/compress/+server.ts
/**
 * Chat Compression API Endpoint
 *
 * Compresses chat conversations to maintain token budgets.
 */

import type { RequestHandler } from './$types';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * POST /api/chat/compress
 * Compress a chat session's messages
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;

	try {
		const body = await request.json();
		const { session_id, target_tokens = 2000 } = body;

		if (!session_id) {
			return ApiResponse.badRequest('Session ID is required');
		}

		// Verify session ownership
		const { data: chatSession, error: sessionError } = await supabase
			.from('chat_sessions')
			.select('*')
			.eq('id', session_id)
			.eq('user_id', userId)
			.single();

		if (sessionError || !chatSession) {
			return ApiResponse.notFound('Session');
		}

		// Get all messages for the session
		const { data: messages, error: messagesError } = await supabase
			.from('chat_messages')
			.select('*')
			.eq('session_id', session_id)
			.order('created_at', { ascending: true });

		if (messagesError) {
			console.error('Failed to fetch messages:', messagesError);
			return ApiResponse.internalError(messagesError, 'Failed to fetch messages');
		}

		if (!messages || messages.length < 10) {
			return ApiResponse.success({
				compressed: false,
				reason: 'Not enough messages to compress',
				tokensSaved: 0
			});
		}

		// Check if compression is needed
		const compressionService = new ChatCompressionService(supabase);
		const shouldCompress = await compressionService.shouldCompress(messages);

		if (!shouldCompress) {
			return ApiResponse.success({
				compressed: false,
				reason: 'Compression not needed',
				tokensSaved: 0
			});
		}

		// Perform smart compression
		const result = await compressionService.smartCompress(
			session_id,
			messages,
			chatSession.context_type || 'global',
			userId
		);

		// Update session with compression metadata
		await supabase
			.from('chat_sessions')
			.update({
				last_compression_at: new Date().toISOString(),
				compression_count: (chatSession.compression_count || 0) + 1,
				updated_at: new Date().toISOString()
			})
			.eq('id', session_id);

		return ApiResponse.success({
			compressed: true,
			metadata: result.metadata,
			compressionId: session_id,
			tokensSaved: result.metadata.originalCount * 50 - result.metadata.estimatedTokens // Rough estimate
		});
	} catch (err) {
		console.error('Compression error:', err);
		return ApiResponse.internalError(err, 'Failed to compress conversation');
	}
};

/**
 * GET /api/chat/compress?session_id=xxx
 * Get compression history for a session
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const sessionId = url.searchParams.get('session_id');

	if (!sessionId) {
		return ApiResponse.badRequest('Session ID is required');
	}

	try {
		// Verify session ownership
		const { data: chatSession, error: sessionError } = await supabase
			.from('chat_sessions')
			.select('id')
			.eq('id', sessionId)
			.eq('user_id', userId)
			.single();

		if (sessionError || !chatSession) {
			return ApiResponse.notFound('Session');
		}

		// Get compression history
		const compressionService = new ChatCompressionService(supabase);
		const history = await compressionService.getCompressionHistory(sessionId);

		return ApiResponse.success({ history });
	} catch (err) {
		console.error('Failed to get compression history:', err);
		return ApiResponse.internalError(err, 'Failed to get compression history');
	}
};
