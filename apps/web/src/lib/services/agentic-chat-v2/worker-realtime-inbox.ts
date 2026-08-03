// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.ts
import {
	AGENTIC_CHAT_CLIENT_BUFFER_MAX_BYTES,
	AGENTIC_CHAT_CLIENT_BUFFER_MAX_EVENTS,
	AGENTIC_CHAT_CLIENT_MAX_TRACKED_TURNS,
	AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatRealtimeReconcileHintV1,
	type AgenticChatReconcileRpcResultV1,
	type AgentStreamEventPhaseV1,
	type AgentStreamEventV1,
	type TurnHandleV1
} from '@buildos/shared-types';

export type AgenticChatWorkerReconciliationReason =
	| 'initial'
	| 'sequence_gap'
	| 'generation_changed'
	| 'reconcile_hint'
	| 'channel_unavailable'
	| 'channel_reconnected'
	| 'buffer_overflow'
	| 'protocol_error'
	| 'application_error'
	| 'watchdog';

export type AgenticChatWorkerReconciledReceipt = Extract<
	AgenticChatReconcileRpcResultV1,
	{ outcome: 'reconciled' }
>;

export type AgenticChatWorkerTurnObserver = {
	applyLiveEvent(event: AgentStreamEventV1): void;
	applyReconciliation(receipt: AgenticChatWorkerReconciledReceipt): void;
	requestReconciliation(request: {
		handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;
		reason: AgenticChatWorkerReconciliationReason;
		executionGeneration: number;
		afterDurableSequence: number;
	}): void;
};

export type AgenticChatWorkerTurnInboxSnapshot = {
	turnRunId: string;
	executionGeneration: number;
	lastAppliedSequence: number;
	buffering: boolean;
	reconciliationRequested: boolean;
	bufferedEvents: number;
	bufferedBytes: number;
	bufferOverflowed: boolean;
};

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;

type BufferedEvent = {
	event: AgentStreamEventV1;
	bytes: number;
};

type TrackedTurn = {
	handle: WorkerTurnHandle;
	observer: AgenticChatWorkerTurnObserver;
	executionGeneration: number;
	lastAppliedSequence: number;
	buffering: boolean;
	reconciliationRequested: boolean;
	buffer: Map<string, BufferedEvent>;
	bufferedBytes: number;
	bufferOverflowed: boolean;
};

export type AgenticChatWorkerRealtimeInboxOptions = {
	maxTrackedTurns?: number;
	maxBufferedEvents?: number;
	maxBufferedBytes?: number;
	onError?: (error: unknown) => void;
};

const textEncoder = new TextEncoder();

export class AgenticChatWorkerRealtimeInbox {
	readonly #turns = new Map<string, TrackedTurn>();
	readonly #maxTrackedTurns: number;
	readonly #maxBufferedEvents: number;
	readonly #maxBufferedBytes: number;
	readonly #onError?: (error: unknown) => void;

	constructor(options: AgenticChatWorkerRealtimeInboxOptions = {}) {
		this.#maxTrackedTurns = positiveSafeInteger(
			options.maxTrackedTurns ?? AGENTIC_CHAT_CLIENT_MAX_TRACKED_TURNS,
			'maxTrackedTurns'
		);
		this.#maxBufferedEvents = positiveSafeInteger(
			options.maxBufferedEvents ?? AGENTIC_CHAT_CLIENT_BUFFER_MAX_EVENTS,
			'maxBufferedEvents'
		);
		this.#maxBufferedBytes = positiveSafeInteger(
			options.maxBufferedBytes ?? AGENTIC_CHAT_CLIENT_BUFFER_MAX_BYTES,
			'maxBufferedBytes'
		);
		this.#onError = options.onError;
	}

	registerTurn(input: {
		handle: WorkerTurnHandle;
		observer: AgenticChatWorkerTurnObserver;
		executionGeneration?: number;
		lastAppliedSequence?: number;
	}): () => void {
		validateWorkerHandle(input.handle);
		const executionGeneration = nonnegativeSafeInteger(
			input.executionGeneration ?? 0,
			'executionGeneration'
		);
		const lastAppliedSequence = nonnegativeSafeInteger(
			input.lastAppliedSequence ?? 0,
			'lastAppliedSequence'
		);
		if (executionGeneration === 0 && lastAppliedSequence !== 0) {
			throw new Error('Generation-zero worker turn cannot have an applied sequence');
		}
		if (this.#turns.has(input.handle.turnRunId)) {
			throw new Error(`Worker turn ${input.handle.turnRunId} is already registered`);
		}
		if (this.#turns.size >= this.#maxTrackedTurns) {
			throw new Error('Agentic Chat worker turn inbox capacity exceeded');
		}

		const state: TrackedTurn = {
			handle: input.handle,
			observer: input.observer,
			executionGeneration,
			lastAppliedSequence,
			buffering: true,
			reconciliationRequested: false,
			buffer: new Map(),
			bufferedBytes: 0,
			bufferOverflowed: false
		};
		this.#turns.set(input.handle.turnRunId, state);
		this.#requestReconciliation(state, 'initial');

		let registered = true;
		return () => {
			if (!registered) return;
			registered = false;
			if (this.#turns.get(input.handle.turnRunId) === state) {
				this.#turns.delete(input.handle.turnRunId);
			}
		};
	}

	unregisterTurn(turnRunId: string): void {
		this.#turns.delete(turnRunId);
	}

	requestReconciliation(
		turnRunId: string,
		reason: AgenticChatWorkerReconciliationReason = 'watchdog'
	): void {
		const state = this.#turns.get(turnRunId);
		if (state) this.#requestReconciliation(state, reason);
	}

	receiveStreamEvent(value: unknown): void {
		const event = parseAgenticChatStreamEvent(value);
		if (!event) {
			this.#requestProtocolReconciliation(value);
			return;
		}
		const state = this.#turns.get(event.turn_run_id);
		if (!state) return;
		if (!eventMatchesHandle(event, state.handle)) {
			this.#requestReconciliation(state, 'protocol_error');
			return;
		}

		if (state.buffering) {
			if (event.execution_generation < state.executionGeneration) return;
			if (
				event.execution_generation === state.executionGeneration &&
				event.sequence_index <= state.lastAppliedSequence
			) {
				return;
			}
			this.#bufferEvent(state, event);
			if (!state.reconciliationRequested) {
				this.#requestReconciliation(
					state,
					event.execution_generation > state.executionGeneration
						? 'generation_changed'
						: 'watchdog'
				);
			} else if (event.execution_generation > state.executionGeneration) {
				this.#requestReconciliation(state, 'generation_changed');
			}
			return;
		}
		if (event.execution_generation < state.executionGeneration) return;
		if (event.execution_generation > state.executionGeneration) {
			this.#bufferEvent(state, event);
			this.#requestReconciliation(state, 'generation_changed');
			return;
		}
		if (event.sequence_index <= state.lastAppliedSequence) return;
		if (event.sequence_index !== state.lastAppliedSequence + 1) {
			this.#bufferEvent(state, event);
			this.#requestReconciliation(state, 'sequence_gap');
			return;
		}
		this.#applyLiveEvent(state, event);
	}

	receiveReconcileHint(value: unknown): void {
		const hint = parseAgenticChatReconcileHint(value);
		if (!hint) {
			this.#requestProtocolReconciliation(value);
			return;
		}
		const state = this.#turns.get(hint.turn_run_id);
		if (!state || hint.session_id !== state.handle.sessionId) return;
		if (hint.execution_generation < state.executionGeneration) return;
		if (
			hint.execution_generation > state.executionGeneration ||
			hint.durable_through_sequence > state.lastAppliedSequence
		) {
			this.#requestReconciliation(
				state,
				hint.execution_generation > state.executionGeneration
					? 'generation_changed'
					: 'reconcile_hint'
			);
		}
	}

	notifyChannelUnavailable(): void {
		for (const state of this.#turns.values()) {
			this.#requestReconciliation(state, 'channel_unavailable');
		}
	}

	notifyChannelReconnected(): void {
		for (const state of this.#turns.values()) {
			this.#requestReconciliation(state, 'channel_reconnected');
		}
	}

	applyReconciliation(turnRunId: string, value: unknown): boolean {
		const state = this.#turns.get(turnRunId);
		if (!state) return false;
		state.reconciliationRequested = false;
		const receipt = parseReconciledReceipt(value, state.handle);
		if (!receipt) {
			this.#requestReconciliation(state, 'protocol_error');
			return false;
		}

		try {
			state.observer.applyReconciliation(receipt);
		} catch (error) {
			this.#reportError(error);
			this.#requestReconciliation(state, 'application_error');
			return false;
		}

		state.executionGeneration = receipt.execution_generation;
		state.lastAppliedSequence = receipt.response_watermark;
		const overflowed = state.bufferOverflowed;
		state.bufferOverflowed = false;
		this.#drainBufferedEvents(state);
		if (overflowed) this.#requestReconciliation(state, 'buffer_overflow');
		if (!state.reconciliationRequested && state.buffer.size === 0) {
			state.buffering = false;
		}
		return true;
	}

	getSnapshot(turnRunId: string): AgenticChatWorkerTurnInboxSnapshot | null {
		const state = this.#turns.get(turnRunId);
		if (!state) return null;
		return {
			turnRunId,
			executionGeneration: state.executionGeneration,
			lastAppliedSequence: state.lastAppliedSequence,
			buffering: state.buffering,
			reconciliationRequested: state.reconciliationRequested,
			bufferedEvents: state.buffer.size,
			bufferedBytes: state.bufferedBytes,
			bufferOverflowed: state.bufferOverflowed
		};
	}

	#applyLiveEvent(state: TrackedTurn, event: AgentStreamEventV1): void {
		try {
			state.observer.applyLiveEvent(event);
			state.lastAppliedSequence = event.sequence_index;
		} catch (error) {
			this.#reportError(error);
			this.#bufferEvent(state, event);
			this.#requestReconciliation(state, 'application_error');
		}
	}

	#bufferEvent(state: TrackedTurn, event: AgentStreamEventV1): void {
		if (state.buffer.has(event.event_id)) return;
		const bytes = jsonByteLength(event);
		if (
			bytes === null ||
			state.buffer.size >= this.#maxBufferedEvents ||
			state.bufferedBytes + bytes > this.#maxBufferedBytes
		) {
			state.bufferOverflowed = true;
			this.#requestReconciliation(state, 'buffer_overflow');
			return;
		}
		state.buffer.set(event.event_id, { event, bytes });
		state.bufferedBytes += bytes;
	}

	#drainBufferedEvents(state: TrackedTurn): void {
		const buffered = [...state.buffer.values()].sort((left, right) => {
			return (
				left.event.execution_generation - right.event.execution_generation ||
				left.event.sequence_index - right.event.sequence_index
			);
		});
		state.buffer.clear();
		state.bufferedBytes = 0;

		for (let index = 0; index < buffered.length; index += 1) {
			const item = buffered[index]!;
			const event = item.event;
			if (event.execution_generation < state.executionGeneration) continue;
			if (event.execution_generation > state.executionGeneration) {
				this.#restoreBufferedTail(state, buffered, index);
				this.#requestReconciliation(state, 'generation_changed');
				return;
			}
			if (event.sequence_index <= state.lastAppliedSequence) continue;
			if (event.sequence_index !== state.lastAppliedSequence + 1) {
				this.#restoreBufferedTail(state, buffered, index);
				this.#requestReconciliation(state, 'sequence_gap');
				return;
			}
			this.#applyLiveEvent(state, event);
			if (state.reconciliationRequested) {
				this.#restoreBufferedTail(state, buffered, index + 1);
				return;
			}
		}
	}

	#restoreBufferedTail(state: TrackedTurn, buffered: BufferedEvent[], start: number): void {
		for (let index = start; index < buffered.length; index += 1) {
			const item = buffered[index]!;
			if (state.buffer.has(item.event.event_id)) continue;
			if (
				state.buffer.size >= this.#maxBufferedEvents ||
				state.bufferedBytes + item.bytes > this.#maxBufferedBytes
			) {
				state.bufferOverflowed = true;
				continue;
			}
			state.buffer.set(item.event.event_id, item);
			state.bufferedBytes += item.bytes;
		}
	}

	#requestProtocolReconciliation(value: unknown): void {
		const turnRunId = possibleTurnRunId(value);
		if (!turnRunId) return;
		const state = this.#turns.get(turnRunId);
		if (state) this.#requestReconciliation(state, 'protocol_error');
	}

	#requestReconciliation(
		state: TrackedTurn,
		reason: AgenticChatWorkerReconciliationReason
	): void {
		state.buffering = true;
		if (state.reconciliationRequested) return;
		state.reconciliationRequested = true;
		try {
			state.observer.requestReconciliation({
				handle: state.handle,
				reason,
				executionGeneration: state.executionGeneration,
				afterDurableSequence: state.lastAppliedSequence
			});
		} catch (error) {
			state.reconciliationRequested = false;
			this.#reportError(error);
		}
	}

	#reportError(error: unknown): void {
		try {
			this.#onError?.(error);
		} catch {
			// Error reporting must never corrupt cursor state.
		}
	}
}

function parseAgenticChatStreamEvent(value: unknown): AgentStreamEventV1 | null {
	if (!isRecord(value)) return null;
	const sequence = safeNonnegativeInteger(value.sequence_index);
	const generation = safeNonnegativeInteger(value.execution_generation);
	if (
		value.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		!nonemptyString(value.event_id) ||
		!nonemptyString(value.stream_run_id) ||
		!nonemptyString(value.client_turn_id) ||
		!nonemptyString(value.session_id) ||
		!nonemptyString(value.turn_run_id) ||
		generation === null ||
		generation < 1 ||
		sequence === null ||
		sequence < 1 ||
		!isEventPhase(value.phase) ||
		!nonemptyString(value.event_type) ||
		value.type !== value.event_type ||
		value.durable !== true ||
		value.event_id !== createAgentStreamEventIdV1(value.turn_run_id, generation, sequence)
	) {
		return null;
	}
	return value as AgentStreamEventV1;
}

function parseAgenticChatReconcileHint(value: unknown): AgenticChatRealtimeReconcileHintV1 | null {
	if (!isRecord(value)) return null;
	const generation = safeNonnegativeInteger(value.execution_generation);
	const durableSequence = safeNonnegativeInteger(value.durable_through_sequence);
	if (
		value.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		!nonemptyString(value.turn_run_id) ||
		!nonemptyString(value.session_id) ||
		generation === null ||
		generation < 1 ||
		durableSequence === null
	) {
		return null;
	}
	return value as AgenticChatRealtimeReconcileHintV1;
}

function parseReconciledReceipt(
	value: unknown,
	handle: WorkerTurnHandle
): AgenticChatWorkerReconciledReceipt | null {
	if (!isRecord(value) || value.outcome !== 'reconciled') return null;
	const generation = safeNonnegativeInteger(value.execution_generation);
	const watermark = safeNonnegativeInteger(value.response_watermark);
	const snapshotSequence = safeNonnegativeInteger(value.snapshot_sequence);
	const durableSequence = safeNonnegativeInteger(value.durable_through_sequence);
	const projectionSequence = safeNonnegativeInteger(value.projection_durable_sequence);
	if (
		value.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		value.turn_run_id !== handle.turnRunId ||
		value.session_id !== handle.sessionId ||
		value.stream_run_id !== handle.streamRunId ||
		value.client_turn_id !== handle.clientTurnId ||
		value.execution_mode !== 'worker_realtime' ||
		!isTurnStatus(value.status) ||
		typeof value.text !== 'string' ||
		!isRecord(value.projection) ||
		typeof value.reconcile_required !== 'boolean' ||
		typeof value.updated_at !== 'string' ||
		generation === null ||
		watermark === null ||
		snapshotSequence === null ||
		durableSequence === null ||
		projectionSequence === null ||
		projectionSequence > durableSequence ||
		durableSequence > snapshotSequence ||
		watermark !== durableSequence ||
		!Array.isArray(value.durable_events) ||
		value.durable_events.length > AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS
	) {
		return null;
	}
	if (
		generation === 0 &&
		(value.status !== 'queued' || watermark !== 0 || value.durable_events.length !== 0)
	) {
		return null;
	}
	let previousSequence = projectionSequence;
	for (const rawEvent of value.durable_events) {
		const event = parseAgenticChatStreamEvent(rawEvent);
		if (
			!event ||
			!eventMatchesHandle(event, handle) ||
			event.execution_generation !== generation ||
			event.sequence_index <= previousSequence ||
			event.sequence_index > watermark
		) {
			return null;
		}
		previousSequence = event.sequence_index;
	}
	return value as AgenticChatWorkerReconciledReceipt;
}

function eventMatchesHandle(event: AgentStreamEventV1, handle: WorkerTurnHandle): boolean {
	return (
		event.turn_run_id === handle.turnRunId &&
		event.session_id === handle.sessionId &&
		event.stream_run_id === handle.streamRunId &&
		event.client_turn_id === handle.clientTurnId
	);
}

function validateWorkerHandle(handle: WorkerTurnHandle): void {
	if (
		handle.executionMode !== 'worker_realtime' ||
		handle.contractVersion !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		!nonemptyString(handle.turnRunId) ||
		!nonemptyString(handle.sessionId) ||
		!nonemptyString(handle.streamRunId) ||
		!nonemptyString(handle.clientTurnId)
	) {
		throw new Error('Invalid worker Realtime turn handle');
	}
}

function possibleTurnRunId(value: unknown): string | null {
	if (!isRecord(value)) return null;
	return nonemptyString(value.turn_run_id) ? value.turn_run_id : null;
}

function isEventPhase(value: unknown): value is AgentStreamEventPhaseV1 {
	return (
		value === 'prompt' ||
		value === 'llm' ||
		value === 'tool' ||
		value === 'stream' ||
		value === 'finalize'
	);
}

function isTurnStatus(value: unknown): boolean {
	return (
		value === 'queued' ||
		value === 'running' ||
		value === 'completed' ||
		value === 'failed' ||
		value === 'cancelled'
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function safeNonnegativeInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function nonnegativeSafeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be nonnegative`);
	return value;
}

function positiveSafeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be positive`);
	return value;
}

function jsonByteLength(value: unknown): number | null {
	try {
		return textEncoder.encode(JSON.stringify(value)).byteLength;
	} catch {
		return null;
	}
}
