// apps/web/src/routes/api/agent/v2/stream/cancel/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import {
	buildFastChatCancelHintsPatch,
	createFastChatCancelHint,
	isFastChatCancelReason,
	listFastChatCorrelationIds,
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
	// Capture the narrowed reason: TS discards `body.reason` narrowing across the
	// awaits below, so hold it in a local that keeps the FastChatCancelReason type.
	const reason = body.reason;

	const sessionId =
		typeof body.session_id === 'string' && body.session_id.trim().length > 0
			? body.session_id.trim()
			: null;
	const clientTurnId =
		typeof body.client_turn_id === 'string' && body.client_turn_id.trim().length > 0
			? body.client_turn_id.trim()
			: undefined;
	const correlationIds = listFastChatCorrelationIds({
		streamRunId,
		clientTurnId
	});

	for (const correlationId of correlationIds) {
		recordTransientFastChatCancelHint({
			userId: user.id,
			streamRunId: correlationId,
			reason,
			clientTurnId
		});
	}

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

	// Shallow-merge only the cancel-hints key so we never clobber concurrently
	// written agent_metadata (e.g. `focus`). The hints object is rebuilt from the
	// row we just read, preserving hints for other stream runs. NOTE: because the
	// RPC merges at the top level only, the hints sub-object is replaced wholesale,
	// so two cancels for different stream runs racing within the same read/write
	// window could clobber each other's hint (rare; hints are also carried via the
	// transient in-memory channel, which is the primary same-process cancel path).
	const hintPatch = buildFastChatCancelHintsPatch({
		agentMetadata: session.agent_metadata,
		hints: correlationIds.map((correlationId) => ({
			streamRunId: correlationId,
			hint: createFastChatCancelHint({
				reason,
				streamRunId: correlationId,
				clientTurnId
			})
		}))
	});

	const { error: updateError } = await supabase.rpc('merge_chat_session_agent_metadata', {
		p_session_id: sessionId,
		p_patch: hintPatch
	});

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
