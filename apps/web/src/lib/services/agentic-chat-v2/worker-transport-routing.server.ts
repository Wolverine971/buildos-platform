// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.server.ts
import {
	observeAgenticChatWorkerCapacityWithRetry,
	type AgenticChatWorkerCapacityDecisionV1
} from './worker-turn-capacity.server';

export const AGENTIC_CHAT_WORKER_ROUTING_ENABLED_ENV = 'AGENTIC_CHAT_WORKER_ROUTING_ENABLED';
export const AGENTIC_CHAT_WORKER_ROUTING_USER_IDS_ENV = 'AGENTIC_CHAT_WORKER_ROUTING_USER_IDS';

const MAX_ROUTING_USER_IDS = 16;
const MAX_ROUTING_USER_IDS_BYTES = 1024;
const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type AgenticChatNewTransportSelection =
	| { mode: 'legacy_sse'; contractVersion: 'legacy_internal_v1' }
	| { mode: 'worker_realtime'; contractVersion: 'agentic_chat_worker_v1' };

export type SelectAgenticChatNewTransportInput = {
	userId: string;
	supportedModes: readonly ('legacy_sse' | 'worker_realtime')[];
	supportedContractVersions: readonly ('legacy_internal_v1' | 'agentic_chat_worker_v1')[];
	environment: Record<string, string | undefined>;
	observeCapacity?: () => Promise<AgenticChatWorkerCapacityDecisionV1>;
};

const LEGACY_TRANSPORT: AgenticChatNewTransportSelection = {
	mode: 'legacy_sse',
	contractVersion: 'legacy_internal_v1'
};

/**
 * Selects worker transport only for an exact server-controlled cohort with a
 * current open capacity observation. Missing, malformed, unsupported, closed,
 * or failed inputs all preserve legacy transport without exposing cohort state.
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
	const cohort = parseRoutingUserIds(input.environment[AGENTIC_CHAT_WORKER_ROUTING_USER_IDS_ENV]);
	if (!cohort?.has(input.userId)) return LEGACY_TRANSPORT;

	try {
		const capacity = await (
			input.observeCapacity ??
			(() => observeAgenticChatWorkerCapacityWithRetry('transport_negotiation'))
		)();
		if (!isExactlyOpenCapacity(capacity)) return LEGACY_TRANSPORT;
		return {
			mode: 'worker_realtime',
			contractVersion: 'agentic_chat_worker_v1'
		};
	} catch {
		return LEGACY_TRANSPORT;
	}
}

function parseRoutingUserIds(value: string | undefined): ReadonlySet<string> | null {
	if (!value || value.length > MAX_ROUTING_USER_IDS_BYTES || value !== value.trim()) {
		return null;
	}
	const ids = value.split(',');
	if (ids.length === 0 || ids.length > MAX_ROUTING_USER_IDS) return null;
	const uniqueIds = new Set(ids);
	if (uniqueIds.size !== ids.length || ids.some((id) => !CANONICAL_UUID.test(id))) {
		return null;
	}
	return uniqueIds;
}

function isExactlyOpenCapacity(value: AgenticChatWorkerCapacityDecisionV1): boolean {
	return (
		value?.available === true &&
		value.reason === 'open' &&
		value.retryAfterSeconds === 2 &&
		Object.keys(value).length === 3
	);
}
