// apps/web/src/routes/api/chat/sessions/[id]/pending-change/+server.ts
//
// Dismiss on the "didn't finish from earlier" strip. Clears the session's
// pending commission so later turns stop being told it is owed. The click is
// the consent; nothing reads message text. Refuses while a reply is running
// (that turn already carries the commission and may still finish it) and when
// the commission changed since the strip rendered, so a newer one is never
// cleared unseen.
import type { RequestHandler } from './$types';
import { FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY } from '@buildos/agentic-chat-runtime/loop';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { pendingChangeKey } from '$lib/services/agentic-chat-v2/pending-change';
import {
	loadPendingChangeView,
	readInScopePendingTurnContract
} from '$lib/server/chat-pending-change';

export const DELETE: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();

	const sessionId = params.id;
	const key = url.searchParams.get('key')?.trim();
	if (!sessionId || !key) return ApiResponse.badRequest('Session id and change key are required');

	const { data: session, error: sessionError } = await supabase
		.from('chat_sessions')
		.select('id, context_type, entity_id, agent_metadata')
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.maybeSingle();
	if (sessionError) return ApiResponse.databaseError(sessionError);
	if (!session) return ApiResponse.notFound('Chat session');

	const pending = readInScopePendingTurnContract(session);
	if (!pending) return ApiResponse.success({ dismissed: false, pendingChange: null });
	if (pendingChangeKey(pending) !== key) {
		return ApiResponse.error(
			'These changes were updated since you last saw them.',
			HttpStatus.CONFLICT,
			ErrorCode.ALREADY_EXISTS,
			{ pendingChange: await loadPendingChangeView(supabase, session) }
		);
	}

	const { data: activeTurns, error: activeError } = await supabase
		.from('chat_turn_runs')
		.select('id')
		.eq('session_id', sessionId)
		.eq('user_id', user.id)
		.in('status', ['queued', 'running'])
		.limit(1);
	if (activeError) return ApiResponse.databaseError(activeError);
	if ((activeTurns ?? []).length > 0) {
		return ApiResponse.error(
			'Wait for the current reply to finish, then dismiss.',
			HttpStatus.CONFLICT,
			ErrorCode.ALREADY_EXISTS
		);
	}

	// Atomic shallow merge (RLS-scoped RPC): other metadata keys written
	// concurrently survive, and the next terminal trigger sees no commission.
	const { error: mergeError } = await supabase.rpc('merge_chat_session_agent_metadata', {
		p_session_id: sessionId,
		p_patch: { [FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY]: null }
	});
	if (mergeError) return ApiResponse.databaseError(mergeError);

	return ApiResponse.success({ dismissed: true, pendingChange: null });
};
