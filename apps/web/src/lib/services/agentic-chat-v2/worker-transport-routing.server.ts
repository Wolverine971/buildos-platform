// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.server.ts
export type AgenticChatNewTransportSelection =
	| { mode: 'legacy_sse'; contractVersion: 'legacy_internal_v1' }
	| { mode: 'worker_realtime'; contractVersion: 'agentic_chat_worker_v1' };

export type SelectAgenticChatNewTransportInput = {
	supportedModes: readonly ('legacy_sse' | 'worker_realtime')[];
	supportedContractVersions: readonly ('legacy_internal_v1' | 'agentic_chat_worker_v1')[];
};

const LEGACY_TRANSPORT: AgenticChatNewTransportSelection = {
	mode: 'legacy_sse',
	contractVersion: 'legacy_internal_v1'
};

/**
 * Selects worker transport whenever the client supports its contract. Runtime
 * pressure is deliberately not a routing input: compatible turns enter the
 * durable queue and wait there. Legacy remains available only for clients or
 * admitted capability surfaces that explicitly require it.
 */
export async function selectAgenticChatNewTransport(
	input: SelectAgenticChatNewTransportInput
): Promise<AgenticChatNewTransportSelection> {
	if (
		!input.supportedModes.includes('worker_realtime') ||
		!input.supportedContractVersions.includes('agentic_chat_worker_v1')
	) {
		return LEGACY_TRANSPORT;
	}
	return {
		mode: 'worker_realtime',
		contractVersion: 'agentic_chat_worker_v1'
	};
}
