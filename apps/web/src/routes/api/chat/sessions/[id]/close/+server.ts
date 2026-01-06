// apps/web/src/routes/api/chat/sessions/[id]/close/+server.ts
import type { RequestHandler } from './$types';
import type { ChatSessionUpdate } from '@buildos/shared-types';
import { ApiResponse } from '$lib/utils/api-response';
import { normalizeContextType } from '../../../../agent/stream/utils/context-utils';
import { queueChatSessionClassification } from '$lib/server/chat-classification.service';

export const POST: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	let payload: { context_type?: string; entity_id?: string | null; reason?: string } = {};
	try {
		payload = (await request.json()) as typeof payload;
	} catch {
		payload = {};
	}

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, user_id, message_count, context_type, entity_id')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.single();

	if (sessionError || !session) {
		return ApiResponse.notFound('Session');
	}

	const updates: ChatSessionUpdate = {};
	const contextTypeRaw = typeof payload.context_type === 'string' ? payload.context_type : null;
	const hasEntityId = Object.prototype.hasOwnProperty.call(payload, 'entity_id');

	if (contextTypeRaw) {
		updates.context_type = normalizeContextType(contextTypeRaw);
	}

	if (hasEntityId) {
		updates.entity_id = payload.entity_id ?? null;
	}

	if (Object.keys(updates).length > 0) {
		updates.updated_at = new Date().toISOString();
		const { error: updateError } = await supabase
			.from('chat_sessions')
			.update(updates)
			.eq('id', sessionId)
			.eq('user_id', user.id);

		if (updateError) {
			return ApiResponse.databaseError(updateError);
		}
	}

	const messageCount = session.message_count ?? 0;
	if (messageCount > 1) {
		try {
			await queueChatSessionClassification({ sessionId, userId: user.id });
		} catch (err) {
			console.warn('[Chat Close] Failed to queue classification:', err);
		}
	}

	return ApiResponse.success({
		updated: Object.keys(updates).length > 0,
		classificationQueued: messageCount > 1
	});
};
