// apps/web/src/lib/services/agentic-chat-v2/worker-transport-routing.server.ts
import {
	observeAgenticChatWorkerCapacityWithRetry,
	type AgenticChatWorkerCapacityDecisionV1
} from './worker-turn-capacity.server';

export const AGENTIC_CHAT_WORKER_ROUTING_ENABLED_ENV = 'AGENTIC_CHAT_WORKER_ROUTING_ENABLED';

export type AgenticChatNewTransportSelection =
	| { mode: 'legacy_sse'; contractVersion: 'legacy_internal_v1' }
	| { mode: 'worker_realtime'; contractVersion: 'agentic_chat_worker_v1' };

export type SelectAgenticChatNewTransportInput = {
	supportedModes: readonly ('legacy_sse' | 'worker_realtime')[];
	supportedContractVersions: readonly ('legacy_internal_v1' | 'agentic_chat_worker_v1')[];
	environment: Record<string, string | undefined>;
	observeCapacity?: () => Promise<AgenticChatWorkerCapacityDecisionV1>;
};

export type AgenticChatWorkerUnavailableReason =
	| Exclude<AgenticChatWorkerCapacityDecisionV1['reason'], 'open'>
	| 'capacity_observation_failed'
	| 'invalid_capacity_receipt';

export class AgenticChatWorkerUnavailableError extends Error {
	readonly code = 'worker_unavailable';

	constructor(
		readonly reason: AgenticChatWorkerUnavailableReason,
		readonly retryAfterSeconds = 2
	) {
		super('Agentic Chat worker is temporarily unavailable');
		this.name = 'AgenticChatWorkerUnavailableError';
	}
}

const LEGACY_TRANSPORT: AgenticChatNewTransportSelection = {
	mode: 'legacy_sse',
	contractVersion: 'legacy_internal_v1'
};

/**
 * Selects worker transport by default when the server-wide switch is enabled,
 * the client supports the worker contract, and live capacity is open. The
 * switch remains the emergency rollback control. Once enabled, capacity or
 * observation failures are retryable unavailability and must never silently
 * select a new legacy turn.
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
	let capacity: AgenticChatWorkerCapacityDecisionV1;
	try {
		capacity = await (
			input.observeCapacity ??
			(() => observeAgenticChatWorkerCapacityWithRetry('transport_negotiation'))
		)();
	} catch {
		throw new AgenticChatWorkerUnavailableError('capacity_observation_failed');
	}
	if (!isExactlyOpenCapacity(capacity)) {
		throw new AgenticChatWorkerUnavailableError(
			isCanonicalClosedCapacity(capacity) ? capacity.reason : 'invalid_capacity_receipt',
			isCanonicalClosedCapacity(capacity) ? capacity.retryAfterSeconds : 2
		);
	}
	return {
		mode: 'worker_realtime',
		contractVersion: 'agentic_chat_worker_v1'
	};
}

function isExactlyOpenCapacity(value: AgenticChatWorkerCapacityDecisionV1): boolean {
	return (
		value?.available === true &&
		value.reason === 'open' &&
		value.retryAfterSeconds === 2 &&
		Object.keys(value).length === 3
	);
}

function isCanonicalClosedCapacity(
	value: AgenticChatWorkerCapacityDecisionV1
): value is AgenticChatWorkerCapacityDecisionV1 & {
	available: false;
	reason: Exclude<AgenticChatWorkerCapacityDecisionV1['reason'], 'open'>;
} {
	return (
		value?.available === false &&
		value.reason !== 'open' &&
		value.retryAfterSeconds === 2 &&
		Object.keys(value).length === 3
	);
}
