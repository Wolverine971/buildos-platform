// apps/web/src/routes/api/agent/v2/stream/cancel/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	createFastChatCancelHint,
	isFastChatCancelReason,
	mergeFastChatCancelHintIntoMetadata,
	normalizeFastChatStreamRunId,
	recordTransientFastChatCancelHint
} from '$lib/services/agentic-chat-v2/cancel-reason-channel';

const logger = createLogger('API:AgentStreamV2Cancel');

type FastChatCancelRequest = {
	session_id?: string;
	stream_run_id?: string | number;
	client_turn_id?: string;
	reason?: string;
};

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	let body: FastChatCancelRequest;
	try {
		body = (await request.json()) as FastChatCancelRequest;
	} catch (error) {
		logger.warn('Failed to parse stream cancel request', { error });
		return ApiResponse.badRequest('Invalid request body');
	}

	const streamRunId = normalizeFastChatStreamRunId(body.stream_run_id);
	if (!streamRunId) {
		return ApiResponse.badRequest('stream_run_id is required');
	}
	if (!isFastChatCancelReason(body.reason)) {
		return ApiResponse.badRequest('reason must be user_cancelled or superseded');
	}

	const sessionId =
		typeof body.session_id === 'string' && body.session_id.trim().length > 0
			? body.session_id.trim()
			: null;
	const clientTurnId =
		typeof body.client_turn_id === 'string' && body.client_turn_id.trim().length > 0
			? body.client_turn_id.trim()
			: undefined;

	recordTransientFastChatCancelHint({
		userId: user.id,
		streamRunId,
		reason: body.reason,
		clientTurnId
	});

	if (!sessionId) {
		return ApiResponse.success({ accepted: true, persisted: false });
	}

	if (!isValidUUID(sessionId)) {
		return ApiResponse.badRequest('Invalid session_id');
	}

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, agent_metadata')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (sessionError) {
		logger.warn('Failed to load session for stream cancel', {
			error: sessionError,
			sessionId,
			userId: user.id,
			streamRunId
		});
		return ApiResponse.success({ accepted: true, persisted: false });
	}

	if (!session) {
		return ApiResponse.success({ accepted: true, persisted: false });
	}

	const hint = createFastChatCancelHint({
		reason: body.reason,
		streamRunId,
		clientTurnId
	});
	const nextMetadata = mergeFastChatCancelHintIntoMetadata({
		agentMetadata: session.agent_metadata,
		streamRunId,
		hint
	});

	const { error: updateError } = await supabase
		.from('chat_sessions')
		.update({
			agent_metadata: nextMetadata,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId)
		.eq('user_id', user.id);

	if (updateError) {
		logger.warn('Failed to persist stream cancel hint', {
			error: updateError,
			sessionId,
			userId: user.id,
			streamRunId
		});
		return ApiResponse.success({ accepted: true, persisted: false });
	}

	return ApiResponse.success({
		accepted: true,
		persisted: true,
		stream_run_id: streamRunId,
		reason: body.reason
	});
};
