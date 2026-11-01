// packages/api-client/src/endpoints/chat.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	ChatActiveTurnProbeResponse,
	ChatPendingChangeDismissResponse,
	ChatPendingChangeProbeResponse,
	ProposalChooseRequest,
	ProposalChooseResponse,
	ProposalPreviewResponse,
	ProposalUndoRequest,
	ProposalUndoResponse,
	ChatSessionDeleteResponse,
	ChatSessionHistoryQuery,
	ChatSessionHistoryResponse,
	ChatSessionRenameRequest,
	ChatSessionRenameResponse,
	ProjectRecentChatsQuery,
	ProjectRecentChatsResponse
} from '../types';

const sessionPath = (sessionId: string) => `/api/chat/sessions/${encodeURIComponent(sessionId)}`;
const cardPath = (cardId: string) => `/api/chat/proposal-cards/${encodeURIComponent(cardId)}`;

/**
 * Chat sessions as stored: history for a reopened chat, cheap probes while a turn
 * runs, rename/delete, and a project's chat list. Sending a message is
 * `agent.sendTurn`; live events arrive over the realtime channel (see `realtime.ts`).
 */
export function createChatEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * GET /api/chat/sessions/[id] — the newest window of messages plus the tool
		 * calls, turn runs and timeline behind them. One read per open; keep the live
		 * parts current from realtime events rather than polling this.
		 */
		history: (
			sessionId: string,
			query: ChatSessionHistoryQuery = {},
			options?: RequestOptions
		) =>
			http.request<ChatSessionHistoryResponse>(sessionPath(sessionId), {
				query: { includeVoiceNotes: query.includeVoiceNotes ? '1' : undefined },
				...options
			}),

		/** GET …?probe=active-turn — is a turn still running? Five newest runs, one query. */
		probeActiveTurn: (sessionId: string, options?: RequestOptions) =>
			http.request<ChatActiveTurnProbeResponse>(sessionPath(sessionId), {
				query: { probe: 'active-turn' },
				...options
			}),

		/** GET …?probe=pending-change — the proposal awaiting the person, after a turn ends. */
		probePendingChange: (sessionId: string, options?: RequestOptions) =>
			http.request<ChatPendingChangeProbeResponse>(sessionPath(sessionId), {
				query: { probe: 'pending-change' },
				...options
			}),

		/**
		 * DELETE /api/chat/sessions/[id]/pending-change?key= — dismiss the "didn't finish
		 * from earlier" strip. `key` is the strip's own key, so a newer change is never cleared.
		 */
		dismissPendingChange: (sessionId: string, key: string, options?: RequestOptions) =>
			http.request<ChatPendingChangeDismissResponse>(
				`${sessionPath(sessionId)}/pending-change`,
				{
					method: 'DELETE',
					query: { key },
					...options
				}
			),

		/** POST /api/chat/proposal-cards/[id] — answer a proposal card (apply, cancel, …). */
		chooseProposal: (cardId: string, body: ProposalChooseRequest, options?: RequestOptions) =>
			http.request<ProposalChooseResponse>(cardPath(cardId), {
				method: 'POST',
				body,
				...options
			}),

		/** POST /api/chat/proposal-cards/[id]/undo — take an applied proposal back (once). */
		undoProposal: (cardId: string, body: ProposalUndoRequest, options?: RequestOptions) =>
			http.request<ProposalUndoResponse>(`${cardPath(cardId)}/undo`, {
				method: 'POST',
				body,
				...options
			}),

		/** GET /api/chat/proposal-cards/[id]/preview?session_id= — what applying would do now. */
		previewProposal: (cardId: string, sessionId: string, options?: RequestOptions) =>
			http.request<ProposalPreviewResponse>(`${cardPath(cardId)}/preview`, {
				query: { session_id: sessionId },
				...options
			}),

		/** GET /api/chat/proposal-cards/[id]/undo-preview?session_id= — what undoing would do now. */
		undoPreviewProposal: (cardId: string, sessionId: string, options?: RequestOptions) =>
			http.request<ProposalPreviewResponse>(`${cardPath(cardId)}/undo-preview`, {
				query: { session_id: sessionId },
				...options
			}),

		/** PATCH /api/chat/sessions/[id] — set the person's own title. */
		rename: (sessionId: string, body: ChatSessionRenameRequest, options?: RequestOptions) =>
			http.request<ChatSessionRenameResponse>(sessionPath(sessionId), {
				method: 'PATCH',
				body,
				...options
			}),

		/** DELETE /api/chat/sessions/[id]. */
		remove: (sessionId: string, options?: RequestOptions) =>
			http.request<ChatSessionDeleteResponse>(sessionPath(sessionId), {
				method: 'DELETE',
				...options
			}),

		/**
		 * GET /api/onto/projects/[id]/recent-chats — a project's chats, newest activity
		 * first. Pass the Workspace project's id with `include: 'workspace_chats'` for
		 * the person's loose (global) chats.
		 */
		recentForProject: (
			projectId: string,
			query: ProjectRecentChatsQuery = {},
			options?: RequestOptions
		) =>
			http.request<ProjectRecentChatsResponse>(
				`/api/onto/projects/${encodeURIComponent(projectId)}/recent-chats`,
				{
					query: { limit: query.limit, offset: query.offset, include: query.include },
					...options
				}
			)
	};
}

export type ChatEndpoints = ReturnType<typeof createChatEndpoints>;
