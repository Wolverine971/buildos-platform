// packages/api-client/src/endpoints/chat.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	ChatActiveTurnProbeResponse,
	ChatPendingChangeProbeResponse,
	ChatSessionDeleteResponse,
	ChatSessionHistoryQuery,
	ChatSessionHistoryResponse,
	ChatSessionRenameRequest,
	ChatSessionRenameResponse,
	ProjectRecentChatsQuery,
	ProjectRecentChatsResponse
} from '../types';

const sessionPath = (sessionId: string) => `/api/chat/sessions/${encodeURIComponent(sessionId)}`;

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
