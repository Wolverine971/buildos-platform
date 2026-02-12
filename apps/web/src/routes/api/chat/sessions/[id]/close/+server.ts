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

	let payload: {
		context_type?: string;
		entity_id?: string | null;
		reason?: string;
		has_messages_sent?: boolean;
		hasMessagesSent?: boolean;
	} = {};
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

	const { data: recentMessages, error: recentMessagesError } = await supabase
		.from('chat_messages')
		.select('id, created_at')
		.eq('session_id', sessionId)
		.eq('user_id', user.id)
		.order('created_at', { ascending: false })
		.limit(2);

	if (recentMessagesError) {
		console.warn(
			`[Chat Close] Failed to inspect recent messages for session ${sessionId}:`,
			recentMessagesError.message
		);
	}

	const messageCount = session.message_count ?? 0;
	const recentMessageCount = recentMessages?.length ?? 0;
	const hasClientMessageHint =
		payload.has_messages_sent === true || payload.hasMessagesSent === true;
	const inferredLastMessageAt =
		recentMessages?.[0]?.created_at ?? session.last_message_at ?? null;
	const lastMessageAt = inferredLastMessageAt ? new Date(inferredLastMessageAt) : null;
	const lastClassifiedAt = session.last_classified_at
		? new Date(session.last_classified_at)
		: null;
	const hasClassification =
		!!session.auto_title &&
		!!session.summary &&
		Array.isArray(session.chat_topics) &&
		session.chat_topics.length > 0;
	const hasMessageActivity =
		messageCount > 0 ||
		recentMessageCount > 0 ||
		!!session.last_message_at ||
		hasClientMessageHint;

	let shouldQueueClassification = false;

	if (hasMessageActivity) {
		if (!lastClassifiedAt && hasClassification) {
			const classificationTimestamp = inferredLastMessageAt ?? new Date().toISOString();
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
		} else if (!lastClassifiedAt) {
			shouldQueueClassification = true;
		} else if (!lastMessageAt) {
			// If timestamps are inconsistent, force a re-classification attempt to self-heal.
			shouldQueueClassification = true;
		} else {
			shouldQueueClassification = lastMessageAt > lastClassifiedAt;
		}
	}

	let classificationQueued = false;
	let classificationQueueReason: string | undefined;
	if (shouldQueueClassification) {
		try {
			const result = await queueChatSessionClassification({ sessionId, userId: user.id });
			classificationQueued = result.queued;
			classificationQueueReason = result.reason;
			if (!result.queued) {
				console.warn(
					`[Chat Close] Classification queue attempt did not enqueue for session ${sessionId}:`,
					result.reason
				);
			}
		} catch (err) {
			classificationQueueReason = err instanceof Error ? err.message : 'unknown_error';
			console.warn('[Chat Close] Failed to queue classification:', err);
		}
	}

	return ApiResponse.success({
		updated: Object.keys(updates).length > 0,
		classificationQueued,
		classificationQueueAttempted: shouldQueueClassification,
		classificationQueueReason
	});
};
