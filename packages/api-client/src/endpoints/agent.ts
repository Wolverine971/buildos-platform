// packages/api-client/src/endpoints/agent.ts
import type { BuildOsHttp, RequestOptions } from '../client';
import type {
	AgentActiveTurnsResponse,
	AgentCancelTurnRequest,
	AgentCancelTurnResponse,
	AgentReconcileTurnQuery,
	AgentReconcileTurnResponse,
	AgentTurnAdmission,
	AgentTurnRequest,
	AgentTurnSnapshot
} from '../types';

const TURNS_PATH = '/api/agent/v2/turns';
const turnPath = (turnRunId: string) => `${TURNS_PATH}/${encodeURIComponent(turnRunId)}`;

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
			}),

		/**
		 * GET /api/agent/v2/turns/[id] — a snapshot of one turn (status, generation,
		 * last event) for picking up after the app was backgrounded.
		 */
		getTurn: (turnRunId: string, options?: RequestOptions) =>
			http.request<AgentTurnSnapshot>(turnPath(turnRunId), { ...options }),

		/** POST /api/agent/v2/turns/[id]/cancel — Stop. */
		cancelTurn: (turnRunId: string, body: AgentCancelTurnRequest, options?: RequestOptions) =>
			http.request<AgentCancelTurnResponse>(`${turnPath(turnRunId)}/cancel`, {
				method: 'POST',
				body,
				...options
			}),

		/**
		 * GET /api/agent/v2/turns/[id]/reconcile?generation=&after= — replay the durable
		 * events after a cursor, on a reconcile hint or after the channel reconnects.
		 */
		reconcileTurn: (
			turnRunId: string,
			query: AgentReconcileTurnQuery = {},
			options?: RequestOptions
		) =>
			http.request<AgentReconcileTurnResponse>(`${turnPath(turnRunId)}/reconcile`, {
				query: { generation: query.generation, after: query.after },
				...options
			})
	};
}

export type AgentEndpoints = ReturnType<typeof createAgentEndpoints>;
