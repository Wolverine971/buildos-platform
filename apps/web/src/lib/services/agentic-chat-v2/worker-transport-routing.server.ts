// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.server.ts
export const AGENTIC_CHAT_WORKER_ROUTING_ENABLED_ENV = 'AGENTIC_CHAT_WORKER_ROUTING_ENABLED';

export type AgenticChatNewTransportSelection =
	| { mode: 'legacy_sse'; contractVersion: 'legacy_internal_v1' }
	| { mode: 'worker_realtime'; contractVersion: 'agentic_chat_worker_v1' };

export type SelectAgenticChatNewTransportInput = {
	supportedModes: readonly ('legacy_sse' | 'worker_realtime')[];
	supportedContractVersions: readonly ('legacy_internal_v1' | 'agentic_chat_worker_v1')[];
	environment: Record<string, string | undefined>;
};

const LEGACY_TRANSPORT: AgenticChatNewTransportSelection = {
	mode: 'legacy_sse',
	contractVersion: 'legacy_internal_v1'
};

/**
 * Selects worker transport when the server-wide switch is enabled and the
 * client supports the worker contract. Runtime pressure is deliberately not a
 * routing input: compatible turns enter the durable queue and wait there. The
 * switch remains the emergency rollback control.
 */
export async function selectAgenticChatNewTransport(
	input: SelectAgenticChatNewTransportInput
): Promise<AgenticChatNewTransportSelection> {
	if (input.environment[AGENTIC_CHAT_WORKER_ROUTING_ENABLED_ENV] !== 'true') {
		return LEGACY_TRANSPORT;
	}
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
