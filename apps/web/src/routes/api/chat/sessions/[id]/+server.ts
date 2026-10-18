// apps/web/src/routes/api/chat/sessions/[id]/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import type { ProjectFocus } from '@buildos/shared-types';
import {
	buildProjectWideFocus,
	isProjectScopedContext,
	normalizeProjectFocus
} from '$lib/services/agentic-chat-v2/scope';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { buildAgentTimeline } from '$lib/components/agent/agent-chat-timeline';
import {
	readDurableChatWorkflowProgress,
	workflowMessageTurnId
} from '$lib/components/agent/agent-chat-workflow';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	loadPendingChangeView,
	readInScopePendingTurnContract
} from '$lib/server/chat-pending-change';
import { loadChatSessionRestore } from '$lib/server/chat-session-restore';
import {
	enrichSessionEntities,
	loadRestoreAttachments,
	loadRestoreVoiceNotes
} from '$lib/server/chat-session-enrichment';

const chatSessionTitleUpdateSchema = z
	.object({
		title: z.string()
	})
	.strict();

/**
 * GET /api/chat/sessions/[id]
 *
 * Fetches a chat session with its messages for resumption.
 * Used by the history page when resuming a previous chat session.
 */
export const GET: RequestHandler = async ({
	params,
	url,
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
	if (!z.string().uuid().safeParse(sessionId).success) return ApiResponse.notFound('Session');

	// Lightweight probe used by the client while a restored turn is running:
	// one turn-runs query instead of the snapshot and its enrichment. The
	// user_id filter scopes ownership, so the session row isn't fetched.
	if (url.searchParams.get('probe') === 'active-turn') {
		const { data: probeRuns, error: probeError } = await createAdminSupabaseClient()
			.from('chat_turn_runs')
			.select(
				'id, session_id, status, stream_run_id, client_turn_id, finished_reason, updated_at'
			)
			.eq('session_id', sessionId)
			.eq('user_id', user.id)
			.order('started_at', { ascending: false })
			.limit(5);

		if (probeError) {
			return ApiResponse.databaseError(probeError);
		}

		return ApiResponse.success({ turnRuns: probeRuns ?? [] });
	}

	// The "didn't finish from earlier" strip re-reads only its own state after
	// a turn that could have changed it: one session-row read, plus a title
	// lookup only when something is still owed.
	if (url.searchParams.get('probe') === 'pending-change') {
		const { data: probeSession, error: probeSessionError } = await supabase
			.from('chat_sessions')
			.select(
				'context_type, entity_id, focus:agent_metadata->focus, pending_turn_contract:agent_metadata->fastchat_pending_turn_contract'
			)
			.eq('id', sessionId)
			.eq('user_id', user.id)
			.maybeSingle();
		if (probeSessionError) return ApiResponse.databaseError(probeSessionError);
		if (!probeSession) {
			return ApiResponse.notFound('Chat session not found');
		}
		return ApiResponse.success({
			pendingChange: await loadPendingChangeView(supabase, {
				...probeSession,
				agent_metadata: {
					focus: probeSession.focus,
					fastchat_pending_turn_contract: probeSession.pending_turn_contract
				}
			})
		});
	}

	// Fetch the session
	const { data: sessionRow, error: sessionError } = await supabase
		.from('chat_sessions')
		.select(
			'id, user_id, title, auto_title, context_type, entity_id, summary, status, created_at, updated_at, focus:agent_metadata->focus, pending_turn_contract:agent_metadata->fastchat_pending_turn_contract'
		)
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.maybeSingle();

	if (sessionError) return ApiResponse.databaseError(sessionError);
	if (!sessionRow) {
		return ApiResponse.notFound('Chat session not found');
	}

	// Runtime cache/history inside agent_metadata is not a UI transport field.
	const { focus, pending_turn_contract, ...sessionFields } = sessionRow;
	const session = {
		...sessionFields,
		agent_metadata: { focus, fastchat_pending_turn_contract: pending_turn_contract }
	};

	const includeVoiceNotes =
		url.searchParams.get('includeVoiceNotes') === '1' ||
		url.searchParams.get('includeVoiceNotes') === 'true';

	// One statement owns the message/lifecycle window; never independently read
	// terminal status after reading messages (a concurrent completion can be missed).
	const { data: restore, error: restoreError } = await loadChatSessionRestore(sessionId, user.id);
	if (restoreError) return ApiResponse.databaseError(restoreError);
	if (!restore) return ApiResponse.notFound('Chat session not found');
	const {
		messages,
		toolExecutions,
		turnRuns,
		turnEvents,
		workflows: workflowSnapshots,
		truncated,
		historyWindow
	} = restore;

	let workflowMessages = messages;

	if (workflowSnapshots.length > 0) {
		const workflows = new Map(
			(workflowSnapshots ?? []).flatMap((snapshot) => {
				const workflow = readDurableChatWorkflowProgress(snapshot.workflow);
				return workflow ? [[snapshot.turn_run_id, workflow] as const] : [];
			})
		);
		workflowMessages = workflowMessages.map((message) => {
			const turnId = workflowMessageTurnId(message.metadata);
			const workflow = turnId ? workflows.get(turnId) : null;
			return workflow
				? {
						...message,
						metadata: {
							...(message.metadata as Record<string, unknown> | null),
							chat_workflow_v1: workflow
						}
					}
				: message;
		});
	}

	const metadata = (session.agent_metadata ?? {}) as Record<string, unknown>;
	const savedFocus = isProjectScopedContext(session.context_type)
		? (normalizeProjectFocus(metadata.focus as ProjectFocus | null) ??
			(session.entity_id ? buildProjectWideFocus(session.entity_id) : null))
		: null;
	const [messagesWithAttachments, voice, { timelineItems, projectFocus, pendingChange }] =
		await Promise.all([
			loadRestoreAttachments(supabase, sessionId, workflowMessages),
			loadRestoreVoiceNotes(supabase, user.id, workflowMessages, includeVoiceNotes),
			enrichSessionEntities({
				pending: readInScopePendingTurnContract(session),
				supabase,
				projectFocus: savedFocus,
				items: buildAgentTimeline({
					includeToolDetails: false,
					sessionId,
					messages: workflowMessages,
					toolExecutions: toolExecutions || [],
					turnRuns: turnRuns || [],
					turnEvents: turnEvents || []
				})
			})
		]);
	if (voice.error) return ApiResponse.databaseError(voice.error);

	return ApiResponse.success({
		session: projectFocus
			? { ...session, agent_metadata: { focus: projectFocus } }
			: { ...session, agent_metadata: null },
		messages: messagesWithAttachments,
		toolExecutions: toolExecutions || [],
		turnRuns: turnRuns || [],
		timelineItems,
		voiceNoteGroups: voice.voiceNoteGroups,
		voiceNotes: voice.voiceNotes,
		truncated,
		historyWindow,
		pendingChange
	});
};

export const PATCH: RequestHandler = async ({
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
	if (!z.string().uuid().safeParse(sessionId).success) return ApiResponse.notFound('Session');

	const parsed = await parseJsonRequest(request, chatSessionTitleUpdateSchema);
	if (!parsed.ok) return parsed.response;
	const payload = parsed.data;

	const title = payload.title?.trim();
	if (!title) {
		return ApiResponse.validationError('title', 'Title is required');
	}

	if (title.length > 120) {
		return ApiResponse.validationError('title', 'Title must be 120 characters or fewer');
	}

	const { data: updatedSession, error: updateError } = await supabase
		.from('chat_sessions')
		.update({
			title,
			updated_at: new Date().toISOString()
		})
		.eq('id', sessionId)
		.eq('user_id', user.id)
		.select('*')
		.maybeSingle();

	if (updateError) return ApiResponse.databaseError(updateError);
	if (!updatedSession) return ApiResponse.notFound('Session');

	return ApiResponse.success({ session: updatedSession });
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const sessionId = params.id;
	if (!sessionId) {
		return ApiResponse.badRequest('Session id is required');
	}

	// One atomic call: ownership check, live-turn refusal, and the worker turn
	// rows a plain cascade cannot delete while their retention guards hold.
	const { error: deleteError } = await (supabase as any).rpc('delete_my_chat_session', {
		p_session_id: sessionId
	});

	if (deleteError) {
		// SQLSTATEs raised by delete_my_chat_session (22P02: not a uuid).
		if (deleteError.code === 'P0002' || deleteError.code === '22P02') {
			return ApiResponse.notFound('Session');
		}
		if (deleteError.code === '55006') {
			return ApiResponse.error(
				'This chat is still working on a reply. Stop it or let it finish, then delete the chat.',
				HttpStatus.CONFLICT,
				ErrorCode.OPERATION_FAILED
			);
		}
		return ApiResponse.databaseError(deleteError);
	}

	return ApiResponse.success({ deleted: true });
};
