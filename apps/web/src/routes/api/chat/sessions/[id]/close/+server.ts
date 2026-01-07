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
		.select(
			'id, user_id, message_count, context_type, entity_id, last_message_at, last_classified_at, auto_title, chat_topics, summary'
		)
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
	const lastMessageAt = session.last_message_at ? new Date(session.last_message_at) : null;
	const lastClassifiedAt = session.last_classified_at
		? new Date(session.last_classified_at)
		: null;
	const hasClassification =
		!!session.auto_title &&
		!!session.summary &&
		Array.isArray(session.chat_topics) &&
		session.chat_topics.length > 0;

	let shouldQueueClassification = false;

	if (messageCount > 1) {
		if (lastClassifiedAt && lastMessageAt) {
			shouldQueueClassification = lastMessageAt > lastClassifiedAt;
		} else if (!lastClassifiedAt && !hasClassification) {
			shouldQueueClassification = true;
		} else if (!lastClassifiedAt && hasClassification) {
			const classificationTimestamp = session.last_message_at ?? new Date().toISOString();
			const { error: stampError } = await supabase
				.from('chat_sessions')
				.update({ last_classified_at: classificationTimestamp })
				.eq('id', sessionId)
				.eq('user_id', user.id);

			if (stampError) {
				console.warn(
					`[Chat Close] Failed to backfill last_classified_at for session ${sessionId}:`,
					stampError.message
				);
			}
		}
	}

	if (shouldQueueClassification) {
		try {
			await queueChatSessionClassification({ sessionId, userId: user.id });
		} catch (err) {
			console.warn('[Chat Close] Failed to queue classification:', err);
		}
	}

	return ApiResponse.success({
		updated: Object.keys(updates).length > 0,
		classificationQueued: shouldQueueClassification
	});
};
