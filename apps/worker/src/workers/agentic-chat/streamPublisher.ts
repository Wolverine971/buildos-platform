// apps/worker/src/workers/agentic-chat/streamPublisher.ts

import { randomUUID } from 'node:crypto';
import {
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT,
	AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES,
	AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES,
	AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES,
	AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES,
	AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS,
	AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventPhaseV1,
	type AgentStreamEventV1,
	type AgenticChatCommittedSemanticEventReceiptV1,
	type AgenticChatRealtimeBroadcastV1,
	type AgenticChatSemanticEventRpcResultV1,
	type AgenticChatStreamDeliveryAckRpcResultV1,
	type AgenticChatTerminalReceiptV1,
	type AgenticChatTextBatchFlushRpcResultV1,
	type AgenticChatTextBatchInputV1,
	type AgenticChatTextBatchRpcResultV1,
	type JsonObject,
	canPublishAgenticChatStreamWriteV1,
	didAcknowledgeAgenticChatStreamDeliveryV1
} from '@buildos/shared-types';

export const DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG = {
	flushIntervalMs: 150,
	textBatchTargetBytes: 3 * 1024,
	turnPendingSoftBytes: 256 * 1024,
	turnPendingHardBytes: 1024 * 1024,
	workerPendingSoftBytes: 2 * 1024 * 1024,
	workerPendingHardBytes: 8 * 1024 * 1024,
	turnPendingSoftEvents: 32,
	turnPendingHardEvents: 128,
	workerPendingSoftEvents: 256,
	workerPendingHardEvents: 1024,
	maxConcurrentSemanticWrites: 16,
	batchMaxItems: AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS,
	batchMaxBytes: AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES,
	retryDelayMs: 250,
	reconcileHintIntervalMs: 2_000,
	terminalBroadcastAttempts: 3,
	terminalBroadcastRetryMs: 150,
	shutdownDrainTimeoutMs: 5_000
} as const;

export type AgenticChatPublisherConfig = {
	[key in keyof typeof DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG]: number;
};

export type AgenticChatPublisherTurnV1 = {
	turnRunId: string;
	queueJobId: string;
	processingToken: string;
	userId: string;
	sessionId: string;
	streamRunId: string;
	clientTurnId: string | null;
	executionGeneration: number;
	initialAssistantText?: string;
	initialSequence?: number;
	onOverload?: (error: AgenticChatPublisherOverloadError) => void;
	onPersistenceObserved?: (observation: AgenticChatPublisherPersistenceObservationV1) => void;
};

export type AgenticChatPublisherPersistenceObservationV1 = {
	turnRunId: string;
	executionGeneration: number;
	sequenceIndex: number;
	phase: AgentStreamEventPhaseV1;
	eventType: string;
	persistedAt: string;
};

export type AgenticChatSemanticPublishInputV1 = {
	transitionId: string;
	phase: AgentStreamEventPhaseV1;
	eventType: string;
	projection: JsonObject;
	eventPayload: JsonObject;
};

export type AgenticChatPublisherPressureV1 = 'normal' | 'soft_limit';

export type AgenticChatPublisherDeliveryV1 =
	| 'broadcast_acknowledged'
	| 'broadcast_sent_reconcile_pending'
	| 'reconcile_only'
	| 'already_persisted'
	| 'blocked';

export type AgenticChatTextEnqueueResultV1 = {
	delivery: Promise<AgenticChatPublisherDeliveryV1>;
	pressure: AgenticChatPublisherPressureV1;
	pressureRelieved: Promise<void> | null;
};

export type AgenticChatPublisherSnapshotV1 = {
	turnRunId: string;
	executionGeneration: number;
	durableSequence: number;
	assistantText: string;
	pendingBytes: number;
	pendingEvents: number;
	reconcileOnly: boolean;
	blockedReason: 'publisher_overload' | 'ownership_lost' | 'persistence_rejected' | null;
	busy: boolean;
};

export type AgenticChatPublisherWorkerSnapshotV1 = {
	registeredTurns: number;
	pendingBytes: number;
	pendingEvents: number;
	pressure: AgenticChatPublisherPressureV1;
	softByteLimit: number;
	hardByteLimit: number;
	softEventLimit: number;
	hardEventLimit: number;
	accepting: boolean;
	stopping: boolean;
};

export type AgenticChatPublisherMetricV1 =
	| 'text_enqueued'
	| 'text_coalesced'
	| 'semantic_enqueued'
	| 'text_batch_persisted'
	| 'persistence_retry'
	| 'broadcast_degraded'
	| 'reconcile_hint_sent'
	| 'acknowledgement_pending'
	| 'soft_pressure'
	| 'publisher_overload';

export type AgenticChatPersistencePortV1 = {
	flushTextBatches(
		inputs: AgenticChatTextBatchInputV1[]
	): Promise<AgenticChatTextBatchFlushRpcResultV1>;
	persistSemantic(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		transition_id: string;
		assistant_text: string;
		phase: AgentStreamEventPhaseV1;
		event_type: string;
		projection: JsonObject;
		event_payload: JsonObject;
	}): Promise<AgenticChatSemanticEventRpcResultV1>;
	acknowledge(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		acknowledged_sequence: number;
	}): Promise<AgenticChatStreamDeliveryAckRpcResultV1>;
};

export type AgenticChatBroadcastMessageV1 =
	| (Extract<AgenticChatRealtimeBroadcastV1, { event: 'agent-stream-event' }> & {
			kind: 'event';
			topic: string;
	  })
	| (Extract<AgenticChatRealtimeBroadcastV1, { event: 'agent-stream-reconcile' }> & {
			kind: 'reconcile_hint';
			topic: string;
	  });

export type AgenticChatBroadcastPortV1 = {
	publish(message: AgenticChatBroadcastMessageV1): Promise<'sent' | 'failed'>;
};

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

type TextOperation = {
	kind: 'text';
	batchId: string;
	textDelta: string;
	assistantText: string;
	deltaBytes: number;
	readyAtMs: number;
	urgent: boolean;
	inFlight: boolean;
	waiters: Deferred<AgenticChatPublisherDeliveryV1>[];
};

type SemanticOperation = {
	kind: 'semantic';
	input: AgenticChatSemanticPublishInputV1;
	assistantText: string;
	bytes: number;
	inFlight: boolean;
	waiter: Deferred<AgenticChatPublisherDeliveryV1>;
};

type Operation = TextOperation | SemanticOperation;

type TurnState = {
	context: AgenticChatPublisherTurnV1;
	durableSequence: number;
	assistantText: string;
	abandoned: boolean;
	operations: Operation[];
	pendingBytes: number;
	busy: boolean;
	firstTextSeen: boolean;
	forceFlush: boolean;
	retryAtMs: number;
	reconcileOnly: boolean;
	lastHintAtMs: number;
	blockedReason: AgenticChatPublisherSnapshotV1['blockedReason'];
	pressureWaiters: Deferred<void>[];
};

type DeliveryReceipt = AgenticChatTextBatchRpcResultV1 | AgenticChatSemanticEventRpcResultV1;
type PublishableDeliveryReceipt =
	| Extract<AgenticChatTextBatchRpcResultV1, { outcome: 'persisted' }>
	| Extract<AgenticChatSemanticEventRpcResultV1, { outcome: 'persisted' }>;

export class AgenticChatPublisherOverloadError extends Error {
	readonly code = 'publisher_overload';

	constructor(
		message: string,
		readonly turnRunId: string,
		readonly assistantText: string,
		readonly pendingBytes: number,
		readonly pendingEvents: number
	) {
		super(message);
		this.name = 'AgenticChatPublisherOverloadError';
	}
}

export class AgenticChatPublisherBlockedError extends Error {
	constructor(
		readonly turnRunId: string,
		readonly outcome: string
	) {
		super(`Agentic Chat publisher blocked for ${turnRunId}: ${outcome}`);
		this.name = 'AgenticChatPublisherBlockedError';
	}
}

export class AgenticChatStreamPublisher {
	private readonly config: AgenticChatPublisherConfig;
	private readonly turns = new Map<string, TurnState>();
	private timer: NodeJS.Timeout | null = null;
	private drainPromise: Promise<void> | null = null;
	private stopPromise: Promise<{
		drained: boolean;
		pendingEvents: number;
		pendingBytes: number;
	}> | null = null;
	private accepting = false;
	private stopping = false;
	private pendingBytes = 0;
	private pendingEvents = 0;

	constructor(
		private readonly ports: {
			persistence: AgenticChatPersistencePortV1;
			broadcast: AgenticChatBroadcastPortV1;
			now?: () => number;
			createId?: () => string;
			sleep?: (ms: number) => Promise<void>;
			onMetric?: (metric: AgenticChatPublisherMetricV1, turnRunId: string) => void;
		},
		config: Partial<AgenticChatPublisherConfig> = {}
	) {
		this.config = { ...DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG, ...config };
		validateConfig(this.config);
	}

	start(): void {
		if (this.accepting) return;
		if (this.stopping) throw new Error('Agentic Chat publisher cannot restart after stop');
		this.accepting = true;
		this.scheduleTimer();
	}

	registerTurn(context: AgenticChatPublisherTurnV1): void {
		if (!this.accepting || this.stopping) {
			throw new Error('Agentic Chat publisher must be started before registering turns');
		}
		if (this.turns.has(context.turnRunId)) {
			throw new Error(`Agentic Chat publisher turn already registered: ${context.turnRunId}`);
		}
		if (!Number.isSafeInteger(context.executionGeneration) || context.executionGeneration < 1) {
			throw new Error('executionGeneration must be a positive safe integer');
		}
		const assistantText = context.initialAssistantText ?? '';
		const initialSequence = context.initialSequence ?? 0;
		if (!Number.isSafeInteger(initialSequence) || initialSequence < 0) {
			throw new Error('initialSequence must be a nonnegative safe integer');
		}
		if (assistantText && initialSequence < 1) {
			throw new Error('Nonempty initial assistant text requires a durable initial sequence');
		}
		if (utf8Bytes(assistantText) > AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES) {
			throw new Error('Initial assistant text exceeds the supported stream bound');
		}
		this.turns.set(context.turnRunId, {
			context,
			durableSequence: initialSequence,
			assistantText,
			abandoned: false,
			operations: [],
			pendingBytes: 0,
			busy: false,
			firstTextSeen: initialSequence > 0,
			forceFlush: false,
			retryAtMs: 0,
			reconcileOnly: false,
			lastHintAtMs: Number.NEGATIVE_INFINITY,
			blockedReason: null,
			pressureWaiters: []
		});
	}

	appendText(turnRunId: string, textDelta: string): AgenticChatTextEnqueueResultV1 {
		const state = this.requireWritableTurn(turnRunId);
		if (!textDelta) throw new Error('textDelta must be nonempty');

		const deltaBytes = utf8Bytes(textDelta);
		if (deltaBytes > AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES) {
			return this.overload(
				state,
				textDelta,
				'One provider text chunk exceeds the batch bound'
			);
		}
		const nextAssistantText = state.assistantText + textDelta;
		if (utf8Bytes(nextAssistantText) > AGENTIC_CHAT_STREAM_TEXT_MAX_BYTES) {
			return this.overload(
				state,
				textDelta,
				'Assistant output exceeds the supported turn bound'
			);
		}
		if (
			state.pendingBytes + deltaBytes > this.config.turnPendingHardBytes ||
			this.pendingBytes + deltaBytes > this.config.workerPendingHardBytes
		) {
			return this.overload(state, textDelta, 'Publisher pending-byte hard limit exceeded');
		}

		const last = state.operations.at(-1);
		const canMerge =
			last?.kind === 'text' &&
			!last.inFlight &&
			last.deltaBytes + deltaBytes <= AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES;
		if (
			!canMerge &&
			(state.operations.length + 1 > this.config.turnPendingHardEvents ||
				this.pendingEvents + 1 > this.config.workerPendingHardEvents)
		) {
			return this.overload(state, textDelta, 'Publisher pending-event hard limit exceeded');
		}

		const waiter = deferred<AgenticChatPublisherDeliveryV1>();
		if (canMerge) {
			last.textDelta += textDelta;
			last.assistantText = nextAssistantText;
			last.deltaBytes += deltaBytes;
			last.waiters.push(waiter);
			this.metric('text_coalesced', turnRunId);
		} else {
			const immediate = !state.firstTextSeen;
			state.firstTextSeen = true;
			state.operations.push({
				kind: 'text',
				batchId: this.createId(),
				textDelta,
				assistantText: nextAssistantText,
				deltaBytes,
				readyAtMs: this.now() + this.config.flushIntervalMs,
				urgent: immediate,
				inFlight: false,
				waiters: [waiter]
			});
			this.pendingEvents += 1;
			this.metric('text_enqueued', turnRunId);
		}

		state.assistantText = nextAssistantText;
		state.pendingBytes += deltaBytes;
		this.pendingBytes += deltaBytes;
		const pendingOp = state.operations.at(-1);
		if (
			pendingOp?.kind === 'text' &&
			pendingOp.deltaBytes >= this.config.textBatchTargetBytes
		) {
			pendingOp.urgent = true;
		}
		const pressure = this.pressureFor(state);
		const pressureRelieved = pressure === 'soft_limit' ? this.pressurePromise(state) : null;
		if (pressure === 'soft_limit') {
			if (pendingOp?.kind === 'text') pendingOp.urgent = true;
			this.metric('soft_pressure', turnRunId);
		}
		if (pendingOp?.kind === 'text' && pendingOp.urgent) this.wake();

		return { delivery: waiter.promise, pressure, pressureRelieved };
	}

	publishSemantic(
		turnRunId: string,
		input: AgenticChatSemanticPublishInputV1
	): Promise<AgenticChatPublisherDeliveryV1> {
		const state = this.requireWritableTurn(turnRunId);
		validateSemanticInput(input);
		const bytes =
			utf8Bytes(JSON.stringify(input.projection)) +
			utf8Bytes(JSON.stringify(input.eventPayload));
		if (
			state.pendingBytes + bytes > this.config.turnPendingHardBytes ||
			this.pendingBytes + bytes > this.config.workerPendingHardBytes
		) {
			this.overload(state, '', 'Publisher semantic pending-byte hard limit exceeded');
		}

		if (
			state.operations.length + 1 > this.config.turnPendingHardEvents ||
			this.pendingEvents + 1 > this.config.workerPendingHardEvents
		) {
			this.overload(state, '', 'Publisher semantic pending-event hard limit exceeded');
		}
		const waiter = deferred<AgenticChatPublisherDeliveryV1>();
		const precedingOperation = state.operations.at(-1);
		if (precedingOperation?.kind === 'text') precedingOperation.urgent = true;
		state.operations.push({
			kind: 'semantic',
			input,
			assistantText: state.assistantText,
			bytes,
			inFlight: false,
			waiter
		});
		state.pendingBytes += bytes;
		this.pendingBytes += bytes;
		this.pendingEvents += 1;
		this.metric('semantic_enqueued', turnRunId);
		this.wake();
		return waiter.promise;
	}

	flushTurn(turnRunId: string): Promise<AgenticChatPublisherDeliveryV1[]> {
		const state = this.requireTurn(turnRunId);
		if (state.blockedReason) {
			throw new AgenticChatPublisherBlockedError(turnRunId, state.blockedReason);
		}
		state.forceFlush = true;
		for (const operation of state.operations) {
			if (operation.kind === 'text') operation.urgent = true;
		}
		const deliveries = state.operations.flatMap((operation) =>
			operation.kind === 'text'
				? operation.waiters.map((waiter) => waiter.promise)
				: [operation.waiter.promise]
		);
		this.wake();
		return Promise.all(deliveries);
	}

	/** Deliver a semantic event already committed by a larger database transaction. */
	publishCommittedSemantic(
		turnRunId: string,
		receipt: AgenticChatCommittedSemanticEventReceiptV1
	): Promise<AgenticChatPublisherDeliveryV1> {
		const state = this.requireTurn(turnRunId);
		if (state.operations.length || state.busy) {
			throw new Error('Committed semantic publication requires a fully drained write slot');
		}
		return this.deliverPersisted(state, receipt);
	}

	async publishTerminal(
		turnRunId: string,
		receipt: AgenticChatTerminalReceiptV1,
		eventPayload: JsonObject
	): Promise<AgenticChatPublisherDeliveryV1> {
		const state = this.requireTurn(turnRunId);
		if (state.operations.length || state.busy) {
			throw new Error('Terminal publication requires a fully drained per-turn write slot');
		}
		if (
			receipt.turn_run_id !== turnRunId ||
			receipt.execution_generation !== state.context.executionGeneration ||
			receipt.terminal_sequence_index !== state.durableSequence + 1
		) {
			throw new Error('Terminal receipt does not match the registered turn sequence');
		}
		state.durableSequence = receipt.terminal_sequence_index;

		const message = this.eventMessage(state, {
			...eventPayload,
			type: 'done',
			contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			event_id: receipt.terminal_event_id,
			stream_run_id: state.context.streamRunId,
			client_turn_id: state.context.clientTurnId ?? '',
			session_id: state.context.sessionId,
			turn_run_id: state.context.turnRunId,
			execution_generation: state.context.executionGeneration,
			sequence_index: receipt.terminal_sequence_index,
			phase: 'finalize',
			event_type: 'done',
			durable: true
		});

		for (let attempt = 1; attempt <= this.config.terminalBroadcastAttempts; attempt += 1) {
			if ((await this.tryBroadcast(message)) === 'sent') {
				if (state.reconcileOnly) return 'broadcast_sent_reconcile_pending';
				return this.acknowledge(state, receipt.terminal_sequence_index);
			}
			if (attempt < this.config.terminalBroadcastAttempts) {
				await this.sleep(this.config.terminalBroadcastRetryMs);
			}
		}

		this.enterReconcileOnly(state);
		return 'reconcile_only';
	}

	getSnapshot(turnRunId: string): AgenticChatPublisherSnapshotV1 {
		const state = this.requireTurn(turnRunId);
		return {
			turnRunId,
			executionGeneration: state.context.executionGeneration,
			durableSequence: state.durableSequence,
			assistantText: state.assistantText,
			pendingBytes: state.pendingBytes,
			pendingEvents: state.operations.length,
			reconcileOnly: state.reconcileOnly,
			blockedReason: state.blockedReason,
			busy: state.busy
		};
	}

	/** Worker-wide pressure evidence used by capacity gates and load fixtures. */
	getWorkerSnapshot(): AgenticChatPublisherWorkerSnapshotV1 {
		return {
			registeredTurns: this.turns.size,
			pendingBytes: this.pendingBytes,
			pendingEvents: this.pendingEvents,
			pressure:
				this.pendingBytes >= this.config.workerPendingSoftBytes ||
				this.pendingEvents >= this.config.workerPendingSoftEvents
					? 'soft_limit'
					: 'normal',
			softByteLimit: this.config.workerPendingSoftBytes,
			hardByteLimit: this.config.workerPendingHardBytes,
			softEventLimit: this.config.workerPendingSoftEvents,
			hardEventLimit: this.config.workerPendingHardEvents,
			accepting: this.accepting,
			stopping: this.stopping
		};
	}

	unregisterTurn(turnRunId: string): void {
		const state = this.requireTurn(turnRunId);
		if (state.busy || state.operations.length) {
			throw new Error('Cannot unregister an Agentic Chat turn with pending publisher work');
		}
		this.turns.delete(turnRunId);
	}

	/**
	 * Stop accepting or publishing writes for a turn whose domain owner is
	 * converging through recovery/finalization. In-flight database work remains
	 * fenced by generation/token; its eventual receipt is never Broadcast.
	 */
	abandonTurn(turnRunId: string, reason = 'turn_abandoned'): void {
		const state = this.requireTurn(turnRunId);
		state.abandoned = true;
		state.reconcileOnly = true;
		state.blockedReason = 'ownership_lost';
		this.rejectOperations(state, new AgenticChatPublisherBlockedError(turnRunId, reason));
		this.turns.delete(turnRunId);
	}

	stop(): Promise<{ drained: boolean; pendingEvents: number; pendingBytes: number }> {
		if (this.stopPromise) return this.stopPromise;
		this.stopPromise = this.drainAndStop();
		return this.stopPromise;
	}

	private async drainAndStop(): Promise<{
		drained: boolean;
		pendingEvents: number;
		pendingBytes: number;
	}> {
		this.stopping = true;
		this.accepting = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		for (const state of this.turns.values()) {
			state.forceFlush = true;
			for (const operation of state.operations) {
				if (operation.kind === 'text') operation.urgent = true;
			}
		}
		this.wake();

		const drain = this.waitForIdle();
		let timeout: NodeJS.Timeout | null = null;
		const timedOut = Symbol('publisher-drain-timeout');
		const timeoutPromise = new Promise<typeof timedOut>((resolve) => {
			timeout = setTimeout(() => resolve(timedOut), this.config.shutdownDrainTimeoutMs);
		});
		const result = await Promise.race([drain.then(() => 'drained' as const), timeoutPromise]);
		if (timeout) clearTimeout(timeout);
		return {
			drained: result === 'drained' && this.pendingEvents === 0,
			pendingEvents: this.pendingEvents,
			pendingBytes: this.pendingBytes
		};
	}

	private async drainAvailable(): Promise<void> {
		while (true) {
			const textStates = this.collectReadyTextStates();
			if (textStates.length) {
				await this.flushTextStates(textStates);
				continue;
			}
			const semanticStates = [...this.turns.values()]
				.filter(
					(state) =>
						!state.busy &&
						state.operations[0]?.kind === 'semantic' &&
						state.retryAtMs <= this.now()
				)
				.slice(0, this.config.maxConcurrentSemanticWrites);
			if (semanticStates.length) {
				await Promise.all(semanticStates.map((state) => this.flushSemanticState(state)));
				continue;
			}
			break;
		}
	}

	private collectReadyTextStates(): TurnState[] {
		const selected: TurnState[] = [];
		let estimatedBytes = 2;
		const now = this.now();
		for (const state of this.turns.values()) {
			const operation = state.operations[0];
			if (
				state.busy ||
				operation?.kind !== 'text' ||
				state.retryAtMs > now ||
				(!state.forceFlush && !operation.urgent && operation.readyAtMs > now)
			) {
				continue;
			}
			const inputBytes = utf8Bytes(JSON.stringify(this.textInput(state, operation)));
			if (selected.length >= this.config.batchMaxItems) break;
			if (selected.length && estimatedBytes + inputBytes > this.config.batchMaxBytes) break;
			estimatedBytes += inputBytes + 1;
			selected.push(state);
		}
		return selected;
	}

	private async flushTextStates(states: TurnState[]): Promise<void> {
		const operations = states.map((state) => state.operations[0] as TextOperation);
		states.forEach((state, index) => {
			state.busy = true;
			operations[index]!.inFlight = true;
		});

		let response: AgenticChatTextBatchFlushRpcResultV1;
		try {
			response = await this.ports.persistence.flushTextBatches(
				states.map((state, index) => this.textInput(state, operations[index]!))
			);
		} catch (error) {
			for (const state of states) this.handlePersistenceFailure(state, error);
			return;
		}

		const byIndex = new Map(response.results.map((result) => [result.input_index, result]));
		await Promise.all(
			states.map(async (state, index) => {
				const operation = operations[index]!;
				const result = byIndex.get(index);
				if (!result) {
					this.deferRetry(state);
					return;
				}
				if (result.outcome === 'rejected') {
					if (isRetryableDatabaseCode(result.error_code)) this.deferRetry(state);
					else this.blockTurn(state, `rejected:${result.error_code}`);
					return;
				}

				if (result.outcome === 'persisted')
					this.metric('text_batch_persisted', state.context.turnRunId);
				const delivery = await this.deliverPersisted(state, result);
				if (state.operations[0] === operation)
					this.completeOperation(state, operation, delivery);
			})
		);
	}

	private async flushSemanticState(state: TurnState): Promise<void> {
		const operation = state.operations[0] as SemanticOperation;
		state.busy = true;
		operation.inFlight = true;
		try {
			const result = await this.ports.persistence.persistSemantic({
				turn_run_id: state.context.turnRunId,
				queue_job_id: state.context.queueJobId,
				processing_token: state.context.processingToken,
				execution_generation: state.context.executionGeneration,
				transition_id: operation.input.transitionId,
				assistant_text: operation.assistantText,
				phase: operation.input.phase,
				event_type: operation.input.eventType,
				projection: operation.input.projection,
				event_payload: operation.input.eventPayload
			});
			const delivery = await this.deliverPersisted(state, result);
			if (state.operations[0] === operation)
				this.completeOperation(state, operation, delivery);
		} catch (error) {
			this.handlePersistenceFailure(state, error);
		}
	}

	private async deliverPersisted(
		state: TurnState,
		receipt: DeliveryReceipt
	): Promise<AgenticChatPublisherDeliveryV1> {
		if (state.abandoned) return 'blocked';
		if (!this.receiptMatchesTurn(state, receipt)) {
			this.blockTurn(state, 'receipt_scope_mismatch');
			return 'blocked';
		}
		if ('sequence_index' in receipt) {
			const expectedSequence = state.durableSequence + 1;
			if (receipt.sequence_index !== expectedSequence) {
				this.blockTurn(state, 'receipt_sequence_gap');
				return 'blocked';
			}
			state.durableSequence = receipt.sequence_index;
		}
		if (!canPublishAgenticChatStreamWriteV1(receipt)) {
			if (receipt.outcome === 'already_persisted') {
				this.enterReconcileOnly(state);
				await this.maybeHint(state, receipt.sequence_index);
				return 'already_persisted';
			}
			this.blockTurn(state, receipt.outcome);
			return 'blocked';
		}
		const publishableReceipt = receipt as PublishableDeliveryReceipt;
		this.observePersistence(state, publishableReceipt);
		if (state.reconcileOnly) {
			await this.maybeHint(state, publishableReceipt.sequence_index);
			return 'reconcile_only';
		}

		const message = this.eventMessage(state, this.eventFromReceipt(publishableReceipt));
		if ((await this.tryBroadcast(message)) !== 'sent') {
			this.enterReconcileOnly(state);
			this.metric('broadcast_degraded', state.context.turnRunId);
			return 'reconcile_only';
		}
		return this.acknowledge(state, publishableReceipt.sequence_index);
	}

	private observePersistence(state: TurnState, receipt: PublishableDeliveryReceipt): void {
		try {
			state.context.onPersistenceObserved?.({
				turnRunId: state.context.turnRunId,
				executionGeneration: state.context.executionGeneration,
				sequenceIndex: receipt.sequence_index,
				phase: receipt.phase,
				eventType: receipt.event_type,
				persistedAt: receipt.persisted_at
			});
		} catch {
			// Observability callbacks cannot change durable publisher delivery.
		}
	}

	private async acknowledge(
		state: TurnState,
		sequenceIndex: number
	): Promise<AgenticChatPublisherDeliveryV1> {
		try {
			const result = await this.ports.persistence.acknowledge({
				turn_run_id: state.context.turnRunId,
				queue_job_id: state.context.queueJobId,
				processing_token: state.context.processingToken,
				execution_generation: state.context.executionGeneration,
				acknowledged_sequence: sequenceIndex
			});
			if (
				result.turn_run_id !== state.context.turnRunId ||
				result.queue_job_id !== state.context.queueJobId
			) {
				this.blockTurn(state, 'ack_receipt_scope_mismatch');
				return 'blocked';
			}
			if (didAcknowledgeAgenticChatStreamDeliveryV1(result)) return 'broadcast_acknowledged';
			if (result.outcome === 'stale_generation') {
				this.blockTurn(state, 'stale_generation');
				return 'blocked';
			}
		} catch {
			// A sent event with an uncertain acknowledgement remains durable and
			// must reconcile; never let a later acknowledgement erase uncertainty.
		}
		this.enterReconcileOnly(state);
		this.metric('acknowledgement_pending', state.context.turnRunId);
		return 'broadcast_sent_reconcile_pending';
	}

	private eventFromReceipt(receipt: PublishableDeliveryReceipt): AgentStreamEventV1 {
		const payload =
			receipt.event_type === 'text_delta' && 'text_delta' in receipt
				? {
						type: 'text_delta',
						text_delta: receipt.text_delta,
						assistant_text_bytes: receipt.assistant_text_bytes
					}
				: 'event_payload' in receipt
					? receipt.event_payload
					: { type: receipt.event_type };
		return {
			...payload,
			contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			event_id: receipt.event_id,
			stream_run_id: receipt.stream_run_id,
			client_turn_id: receipt.client_turn_id ?? '',
			session_id: receipt.session_id,
			turn_run_id: receipt.turn_run_id,
			execution_generation: receipt.execution_generation,
			sequence_index: receipt.sequence_index,
			phase: receipt.phase,
			event_type: receipt.event_type,
			durable: true
		} as AgentStreamEventV1;
	}

	private eventMessage(
		state: TurnState,
		payload: AgentStreamEventV1
	): AgenticChatBroadcastMessageV1 {
		return {
			kind: 'event',
			topic: `chat-user:${state.context.userId}`,
			event: AGENTIC_CHAT_REALTIME_STREAM_EVENT,
			payload
		};
	}

	private async maybeHint(state: TurnState, sequenceIndex: number): Promise<void> {
		const now = this.now();
		if (now - state.lastHintAtMs < this.config.reconcileHintIntervalMs) return;
		state.lastHintAtMs = now;
		const result = await this.tryBroadcast({
			kind: 'reconcile_hint',
			topic: `chat-user:${state.context.userId}`,
			event: AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
			payload: {
				contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
				turn_run_id: state.context.turnRunId,
				session_id: state.context.sessionId,
				execution_generation: state.context.executionGeneration,
				durable_through_sequence: sequenceIndex
			}
		});
		if (result === 'sent') this.metric('reconcile_hint_sent', state.context.turnRunId);
	}

	private completeOperation(
		state: TurnState,
		operation: Operation,
		delivery: AgenticChatPublisherDeliveryV1
	): void {
		if (state.operations[0] !== operation)
			throw new Error('Per-turn publisher slot lost ordering');
		state.operations.shift();
		const bytes = operation.kind === 'text' ? operation.deltaBytes : operation.bytes;
		state.pendingBytes -= bytes;
		this.pendingBytes -= bytes;
		this.pendingEvents -= 1;
		state.busy = false;
		state.retryAtMs = 0;
		operation.inFlight = false;
		if (operation.kind === 'text') {
			for (const waiter of operation.waiters) waiter.resolve(delivery);
		} else {
			operation.waiter.resolve(delivery);
		}
		if (!state.operations.length) state.forceFlush = false;
		this.resolvePressureWaiters();
	}

	private deferRetry(state: TurnState): void {
		if (state.abandoned) return;
		const operation = state.operations[0];
		if (operation) operation.inFlight = false;
		state.busy = false;
		state.retryAtMs = this.now() + this.config.retryDelayMs;
		this.metric('persistence_retry', state.context.turnRunId);
	}

	private handlePersistenceFailure(state: TurnState, error: unknown): void {
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? String((error as { code?: unknown }).code ?? '')
				: '';
		if (!code || isRetryableDatabaseCode(code)) this.deferRetry(state);
		else this.blockTurn(state, `persistence_error:${code}`);
	}

	private blockTurn(state: TurnState, outcome: string): void {
		state.blockedReason = /ownership|stale_generation|cancel_requested|already_terminal/.test(
			outcome
		)
			? 'ownership_lost'
			: 'persistence_rejected';
		state.reconcileOnly = true;
		const error = new AgenticChatPublisherBlockedError(state.context.turnRunId, outcome);
		this.rejectOperations(state, error);
	}

	private overload(state: TurnState, unacceptedText: string, message: string): never {
		const assistantText = state.assistantText + unacceptedText;
		state.assistantText = assistantText;
		state.blockedReason = 'publisher_overload';
		state.reconcileOnly = true;
		const error = new AgenticChatPublisherOverloadError(
			message,
			state.context.turnRunId,
			assistantText,
			state.pendingBytes + utf8Bytes(unacceptedText),
			state.operations.length
		);
		this.rejectOperations(state, error);
		try {
			state.context.onOverload?.(error);
		} catch {
			// The typed overload remains authoritative even if a caller hook fails.
		}
		this.metric('publisher_overload', state.context.turnRunId);
		throw error;
	}

	private rejectOperations(state: TurnState, error: Error): void {
		for (const operation of state.operations) {
			if (operation.kind === 'text') {
				for (const waiter of operation.waiters) waiter.reject(error);
			} else {
				operation.waiter.reject(error);
			}
		}
		this.pendingBytes -= state.pendingBytes;
		this.pendingEvents -= state.operations.length;
		state.pendingBytes = 0;
		state.operations = [];
		state.busy = false;
		state.forceFlush = false;
		this.resolvePressureWaiters();
	}

	private pressureFor(state: TurnState): AgenticChatPublisherPressureV1 {
		return state.pendingBytes >= this.config.turnPendingSoftBytes ||
			this.pendingBytes >= this.config.workerPendingSoftBytes ||
			state.operations.length >= this.config.turnPendingSoftEvents ||
			this.pendingEvents >= this.config.workerPendingSoftEvents
			? 'soft_limit'
			: 'normal';
	}

	private pressurePromise(state: TurnState): Promise<void> {
		const waiter = deferred<void>();
		state.pressureWaiters.push(waiter);
		return waiter.promise;
	}

	private resolvePressure(state: TurnState): void {
		if (this.pressureFor(state) === 'soft_limit') return;
		for (const waiter of state.pressureWaiters.splice(0)) waiter.resolve();
	}

	private resolvePressureWaiters(): void {
		for (const state of this.turns.values()) this.resolvePressure(state);
	}

	private enterReconcileOnly(state: TurnState): void {
		state.reconcileOnly = true;
	}

	private receiptMatchesTurn(state: TurnState, receipt: DeliveryReceipt): boolean {
		if (
			receipt.turn_run_id !== state.context.turnRunId ||
			receipt.queue_job_id !== state.context.queueJobId
		) {
			return false;
		}
		if (receipt.outcome === 'stale_generation') {
			return receipt.requested_execution_generation === state.context.executionGeneration;
		}
		return receipt.execution_generation === state.context.executionGeneration;
	}

	private async tryBroadcast(message: AgenticChatBroadcastMessageV1): Promise<'sent' | 'failed'> {
		try {
			return await this.ports.broadcast.publish(message);
		} catch {
			return 'failed';
		}
	}

	private textInput(state: TurnState, operation: TextOperation): AgenticChatTextBatchInputV1 {
		return {
			turn_run_id: state.context.turnRunId,
			queue_job_id: state.context.queueJobId,
			processing_token: state.context.processingToken,
			execution_generation: state.context.executionGeneration,
			batch_id: operation.batchId,
			text_delta: operation.textDelta,
			assistant_text: operation.assistantText
		};
	}

	private wake(): void {
		if (this.drainPromise) return;
		this.drainPromise = this.drainAvailable()
			.catch((error) => {
				for (const state of this.turns.values()) {
					if (state.busy) this.deferRetry(state);
				}
				console.error('Agentic Chat publisher loop failed', error);
			})
			.finally(() => {
				this.drainPromise = null;
				if (this.hasUrgentWork()) this.wake();
			});
	}

	private hasUrgentWork(): boolean {
		const now = this.now();
		return [...this.turns.values()].some((state) => {
			if (state.busy || state.retryAtMs > now) return false;
			const operation = state.operations[0];
			return (
				operation?.kind === 'semantic' ||
				(operation?.kind === 'text' &&
					(state.forceFlush || operation.urgent || operation.readyAtMs <= now))
			);
		});
	}

	private scheduleTimer(): void {
		if (!this.accepting || this.stopping || this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.wake();
			this.scheduleTimer();
		}, this.config.flushIntervalMs);
	}

	private async waitForIdle(): Promise<void> {
		while (this.drainPromise || this.pendingEvents > 0) {
			if (this.drainPromise) await this.drainPromise;
			else {
				this.wake();
				await Promise.resolve();
			}
			if ([...this.turns.values()].some((state) => state.retryAtMs > this.now())) {
				await this.sleep(this.config.retryDelayMs);
			}
		}
	}

	private requireTurn(turnRunId: string): TurnState {
		const state = this.turns.get(turnRunId);
		if (!state) throw new Error(`Agentic Chat publisher turn is not registered: ${turnRunId}`);
		return state;
	}

	private requireWritableTurn(turnRunId: string): TurnState {
		if (!this.accepting || this.stopping)
			throw new Error('Agentic Chat publisher is not accepting work');
		const state = this.requireTurn(turnRunId);
		if (state.blockedReason)
			throw new AgenticChatPublisherBlockedError(turnRunId, state.blockedReason);
		return state;
	}

	private now(): number {
		return this.ports.now?.() ?? Date.now();
	}

	private createId(): string {
		return this.ports.createId?.() ?? randomUUID();
	}

	private async sleep(ms: number): Promise<void> {
		if (this.ports.sleep) return this.ports.sleep(ms);
		await new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	private metric(metric: AgenticChatPublisherMetricV1, turnRunId: string): void {
		try {
			this.ports.onMetric?.(metric, turnRunId);
		} catch {
			// Observability must never become part of the publication boundary.
		}
	}
}

function validateConfig(config: AgenticChatPublisherConfig): void {
	for (const [name, value] of Object.entries(config)) {
		if (!Number.isSafeInteger(value) || value < 1)
			throw new Error(`Invalid publisher config ${name}`);
	}
	if (config.textBatchTargetBytes > AGENTIC_CHAT_TEXT_BATCH_MAX_BYTES) {
		throw new Error('textBatchTargetBytes exceeds the database batch bound');
	}
	if (config.turnPendingSoftBytes >= config.turnPendingHardBytes) {
		throw new Error('turn pending-byte soft limit must be below the hard limit');
	}
	if (config.workerPendingSoftBytes >= config.workerPendingHardBytes) {
		throw new Error('worker pending-byte soft limit must be below the hard limit');
	}
	if (config.turnPendingSoftEvents >= config.turnPendingHardEvents) {
		throw new Error('turn pending-event soft limit must be below the hard limit');
	}
	if (config.workerPendingSoftEvents >= config.workerPendingHardEvents) {
		throw new Error('worker pending-event soft limit must be below the hard limit');
	}
	if (config.batchMaxItems > AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_ITEMS) {
		throw new Error('batchMaxItems exceeds the database flush bound');
	}
	if (config.batchMaxBytes > AGENTIC_CHAT_TEXT_BATCH_FLUSH_MAX_BYTES) {
		throw new Error('batchMaxBytes exceeds the database flush bound');
	}
}

function validateSemanticInput(input: AgenticChatSemanticPublishInputV1): void {
	if (!input.transitionId) throw new Error('transitionId is required');
	if (!/^[a-z][a-z0-9_]{0,127}$/.test(input.eventType)) throw new Error('Invalid eventType');
	if (
		input.eventType === 'done' ||
		input.eventType === 'text' ||
		input.eventType === 'text_delta'
	) {
		throw new Error('Terminal and text events cannot use the semantic publisher');
	}
	if (input.eventPayload.type !== input.eventType)
		throw new Error('eventPayload.type must match eventType');
	if (utf8Bytes(JSON.stringify(input.projection)) > AGENTIC_CHAT_STREAM_PROJECTION_MAX_BYTES) {
		throw new Error('Semantic projection exceeds the database bound');
	}
	if (
		utf8Bytes(JSON.stringify(input.eventPayload)) > AGENTIC_CHAT_STREAM_EVENT_PAYLOAD_MAX_BYTES
	) {
		throw new Error('Semantic payload exceeds the database bound');
	}
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function utf8Bytes(value: string): number {
	return Buffer.byteLength(value, 'utf8');
}

function isRetryableDatabaseCode(code: string): boolean {
	return (
		code.startsWith('08') ||
		code === '40001' ||
		code === '40P01' ||
		code === '55P03' ||
		code === '57014' ||
		code === '57P01' ||
		code === '57P02' ||
		code === '57P03' ||
		code === '53300'
	);
}
