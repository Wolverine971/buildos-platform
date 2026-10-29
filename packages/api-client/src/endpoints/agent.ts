// packages/api-client/src/endpoints/agent.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type { AgentActiveTurnsResponse, AgentTurnAdmission, AgentTurnRequest } from '../types';

const TURNS_PATH = '/api/agent/v2/turns';

export function createAgentEndpoints(http: BuildOsHttp) {
	return {
		/**
		 * POST /api/agent/v2/turns. The route admits the turn (202 when new, 200 for a
		 * duplicate send) and the worker streams the reply over the session's realtime
		 * channel, so the response is a JSON admission, not a stream.
		 */
		sendTurn: (body: AgentTurnRequest, options?: RequestOptions) =>
			http.request<AgentTurnAdmission>(TURNS_PATH, { method: 'POST', body, ...options }),

		/** Same request as `sendTurn`, returning the `Response` for callers that read the body themselves. */
		sendTurnRaw: (body: AgentTurnRequest, options?: RequestOptions) =>
			http.raw(TURNS_PATH, { method: 'POST', body, ...options }),

		/**
		 * GET /api/agent/v2/turns?session_id= — turns still in flight for a session, so a
		 * reopened chat can resubscribe to their live events. The route accepts no other
		 * query parameter.
		 */
		listActiveTurns: (sessionId: string, options?: RequestOptions) =>
			http.request<AgentActiveTurnsResponse>(TURNS_PATH, {
				query: { session_id: sessionId },
				...options
			})
	};
}

export type AgentEndpoints = ReturnType<typeof createAgentEndpoints>;
