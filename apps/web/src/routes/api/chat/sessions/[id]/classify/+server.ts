// apps/web/src/routes/api/chat/sessions/[id]/classify/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { queueChatSessionClassification } from '$lib/server/chat-classification.service';

export const POST: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, user_id, message_count')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !session) {
		return ApiResponse.notFound('Session');
	}

	const result = await queueChatSessionClassification({ sessionId, userId: user.id });

	if (!result.queued) {
		return ApiResponse.internalError(
			new Error(result.reason || 'Failed to queue chat classification'),
			'Failed to queue chat classification'
		);
	}

	return ApiResponse.success({ queued: true, jobId: result.jobId });
};
