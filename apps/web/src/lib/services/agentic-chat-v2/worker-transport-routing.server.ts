// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.server.ts
export type AgenticChatNewTransportSelection =
	| { mode: 'legacy_sse'; contractVersion: 'legacy_internal_v1' }
	| { mode: 'worker_realtime'; contractVersion: 'agentic_chat_worker_v1' };

export type SelectAgenticChatNewTransportInput = {
	supportedModes: readonly ('legacy_sse' | 'worker_realtime')[];
	supportedContractVersions: readonly ('legacy_internal_v1' | 'agentic_chat_worker_v1')[];
};

const WORKER_TRANSPORT: AgenticChatNewTransportSelection = {
	mode: 'worker_realtime',
	contractVersion: 'agentic_chat_worker_v1'
};

/**
 * Every new turn runs on the worker. This is a constant, not a decision:
 * since 2026-09-04 (one-engine B1) the legacy SSE engine is no longer a
 * routing target for new turns. A client that does not declare worker
 * support is rejected by the transport route's capability check rather than
 * downgraded, so an outdated bundle fails loudly instead of landing on an
 * engine that is being deleted. The input is kept so the route's call site
 * and stored-decision replay keep their shape until stage B6 removes the
 * legacy mode from the contract types.
 */
export async function selectAgenticChatNewTransport(
	_input: SelectAgenticChatNewTransportInput
): Promise<AgenticChatNewTransportSelection> {
	return WORKER_TRANSPORT;
}
