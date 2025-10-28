// apps/web/src/routes/api/chat/generate-title/+server.ts
/**
 * Chat Title Generation API Endpoint
 *
 * Generates titles for chat sessions based on conversation content.
 */

import type { RequestHandler } from './$types';
import { ChatCompressionService } from '$lib/services/chat-compression-service';
import { ApiResponse } from '$lib/utils/api-response';

/**
 * POST /api/chat/generate-title
 * Generate a title for a chat session
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
		const { session_id } = body;

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

		// Check if title already exists
		if (chatSession.title && chatSession.title !== 'Untitled Chat') {
			return ApiResponse.success({ title: chatSession.title });
		}

		// Get first few messages for title generation
		const { data: messages, error: messagesError } = await supabase
			.from('chat_messages')
			.select('*')
			.eq('session_id', session_id)
			.order('created_at', { ascending: true })
			.limit(5);

		if (messagesError) {
			console.error('Failed to fetch messages:', messagesError);
			return ApiResponse.internalError(messagesError, 'Failed to fetch messages');
		}

		if (!messages || messages.length < 2) {
			return ApiResponse.success({ title: 'New Chat' });
		}

		// Generate title using compression service
		const compressionService = new ChatCompressionService(supabase);
		const title = await compressionService.generateTitle(session_id, messages, userId);

		return ApiResponse.success({ title });
	} catch (err) {
		console.error('Title generation error:', err);
		return ApiResponse.internalError(err, 'Failed to generate title');
	}
};
