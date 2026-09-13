// apps/worker/src/workers/agentic-chat/streamPublisher.ts
import {
	emitAgenticChatPersistenceTrace,
	persistenceErrorCode,
	type AgenticChatPersistenceTraceSinkV1,
	type AgenticChatPersistenceTraceV1
} from './persistenceTrace';
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
	/** Database admission time, used only for process-local progress health. */
	acceptedAt?: string;
	initialAssistantText?: string;
	initialSequence?: number;
	onOverload?: (error: AgenticChatPublisherOverloadError) => void;
	onPersistenceObserved?: (observation: AgenticChatPublisherPersistenceObservationV1) => void;
	onDeliveryObserved?: (observation: AgenticChatPublisherDeliveryObservationV1) => void;
};

export type AgenticChatPublisherPersistenceObservationV1 = {
	turnRunId: string;
	executionGeneration: number;
	sequenceIndex: number;
	phase: AgentStreamEventPhaseV1;
	eventType: string;
	persistedAt: string;
};

export type AgenticChatPublisherDeliveryObservationV1 = {
	turnRunId: string;
	executionGeneration: number;
	sequenceIndex: number;
	eventType: string;
	delivery: AgenticChatPublisherDeliveryV1;
	/** Time from enqueue until the persistence receipt was observed by the publisher. */
	queueingMs: number;
	/** Time from persistence observation through Broadcast and the delivery decision. */
	deliveryDecisionMs: number;
	/** Present only when the exact sequence acknowledgement was durably confirmed. */
	durableAcknowledgementMs: number | null;
	totalDeliveryMs: number;
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

/**
 * A write is accepted only after Postgres returns a receipt for this turn,
 * execution generation, and the next durable sequence. Live delivery is a
 * separate, weaker observation and may finish later or require reconciliation.
 */
export type AgenticChatPublisherDurableAcceptanceV1 = {
	outcome: 'persisted' | 'already_persisted';
	turnRunId: string;
	executionGeneration: number;
	sequenceIndex: number;
	phase: AgentStreamEventPhaseV1;
	eventType: string;
	/** Replay receipts prove durability but do not repeat the original commit time. */
	persistedAt: string | null;
};

export type AgenticChatTextEnqueueResultV1 = {
	accepted: Promise<AgenticChatPublisherDurableAcceptanceV1>;
	delivery: Promise<AgenticChatPublisherDeliveryV1>;
	pressure: AgenticChatPublisherPressureV1;
	pressureRelieved: Promise<void> | null;
};

export type AgenticChatSemanticEnqueueResultV1 = AgenticChatTextEnqueueResultV1;

export type AgenticChatPublisherSnapshotV1 = {
	turnRunId: string;
	executionGeneration: number;
	durableSequence: number;
	assistantText: string;
	pendingBytes: number;
	pendingEvents: number;
	pendingPersistenceEvents: number;
	pendingDeliveryEvents: number;
	persistenceRetryPending: boolean;
	reconcileOnly: boolean;
	blockedReason: 'publisher_overload' | 'ownership_lost' | 'persistence_rejected' | null;
	busy: boolean;
};

/**
 * Process-local per-turn evidence for progress health. `lastDurableProgressAt`
 * is a database commit time; delivery fields describe live transport only.
 * Neither is recovery authority.
 */
export type AgenticChatPublisherTurnProgressObservationV1 = {
	turnRunId: string;
	executionGeneration: number;
	acceptedAt: string | null;
	registeredAt: string;
	durableSequence: number;
	lastDurableProgressAt: string | null;
	lastDurableEventType: string | null;
	lastDelivery: AgenticChatPublisherDeliveryV1 | null;
	lastDeliveryAt: string | null;
	reconcileOnly: boolean;
	blockedReason: AgenticChatPublisherSnapshotV1['blockedReason'];
	pendingPersistenceEvents: number;
	pendingDeliveryEvents: number;
	oldestPendingDeliveryAgeMs: number | null;
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
	| 'acknowledgement_coalesced'
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
	enqueuedAtMs: number;
	attempt: number;
	attemptStartedAtMs: number | null;
	retryScheduledAtMs: number | null;
	acceptanceWaiters: Deferred<AgenticChatPublisherDurableAcceptanceV1>[];
	waiters: Deferred<AgenticChatPublisherDeliveryV1>[];
};

type SemanticOperation = {
	kind: 'semantic';
	input: AgenticChatSemanticPublishInputV1;
	assistantText: string;
	bytes: number;
	inFlight: boolean;
	enqueuedAtMs: number;
	attempt: number;
	attemptStartedAtMs: number | null;
	retryScheduledAtMs: number | null;
	acceptanceWaiter: Deferred<AgenticChatPublisherDurableAcceptanceV1>;
	waiter: Deferred<AgenticChatPublisherDeliveryV1>;
};

type Operation = TextOperation | SemanticOperation;

type DeliveryReceipt = AgenticChatTextBatchRpcResultV1 | AgenticChatSemanticEventRpcResultV1;
type AcceptedDeliveryReceipt = Extract<
	DeliveryReceipt,
	{ outcome: 'persisted' | 'already_persisted' }
>;
type PublishableDeliveryReceipt = Extract<DeliveryReceipt, { outcome: 'persisted' }>;

type DeliveryOperation =
	| {
			kind: 'text';
			bytes: number;
			enqueuedAtMs: number;
			waiters: Deferred<AgenticChatPublisherDeliveryV1>[];
			receipt: AcceptedDeliveryReceipt;
			persistenceObservedAtMs: number;
	  }
	| {
			kind: 'semantic';
			bytes: number;
			enqueuedAtMs: number;
			waiter: Deferred<AgenticChatPublisherDeliveryV1>;
			receipt: AcceptedDeliveryReceipt;
			persistenceObservedAtMs: number;
	  };

type SettledDelivery = {
	pending: DeliveryOperation;
	delivery: AgenticChatPublisherDeliveryV1;
};

type TurnState = {
	context: AgenticChatPublisherTurnV1;
	durableSequence: number;
	assistantText: string;
	abandoned: boolean;
	operations: Operation[];
	deliveries: DeliveryOperation[];
	pendingBytes: number;
	busy: boolean;
	deliveryBusy: boolean;
	deliveryTask: Promise<void> | null;
	firstTextSeen: boolean;
	forceFlush: boolean;
	retryAtMs: number;
	persistenceRetryPending: boolean;
	reconcileOnly: boolean;
	lastHintAtMs: number;
	blockedReason: AgenticChatPublisherSnapshotV1['blockedReason'];
	pressureWaiters: Deferred<void>[];
	idleWaiters: Deferred<void>[];
	registeredAtMs: number;
	lastDurableProgressAt: string | null;
	lastDurableEventType: string | null;
	lastDelivery: AgenticChatPublisherDeliveryV1 | null;
	lastDeliveryAtMs: number | null;
};

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
	private readonly deliveryTasks = new Set<Promise<void>>();
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
			onTrace?: AgenticChatPersistenceTraceSinkV1;
		},
		config: Partial<AgenticChatPublisherConfig> = {}
	) {
		this.config = { ...DEFAULT_AGENTIC_CHAT_PUBLISHER_CONFIG, ...config };
		validateAgenticChatPublisherConfig(this.config);
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
		if (context.acceptedAt !== undefined && !Number.isFinite(Date.parse(context.acceptedAt))) {
			throw new Error('acceptedAt must be an ISO timestamp');
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
			deliveries: [],
			pendingBytes: 0,
			busy: false,
			deliveryBusy: false,
			deliveryTask: null,
			firstTextSeen: initialSequence > 0,
			forceFlush: false,
			retryAtMs: 0,
			persistenceRetryPending: false,
			reconcileOnly: false,
			lastHintAtMs: Number.NEGATIVE_INFINITY,
			blockedReason: null,
			pressureWaiters: [],
			idleWaiters: [],
			registeredAtMs: this.now(),
			lastDurableProgressAt: null,
			lastDurableEventType: null,
			lastDelivery: null,
			lastDeliveryAtMs: null
		});
	}

	/**
	 * Best-effort signal that a durable queued turn has been claimed. The client
	 * reconciles authoritative status from Postgres, so a failed Broadcast never
	 * blocks execution and the normal watchdog remains the delivery fallback.
	 */
	publishReconcileHint(turnRunId: string): Promise<void> {
		const state = this.requireTurn(turnRunId);
		return this.maybeHint(state, state.durableSequence);
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
			(this.pendingEventCount(state) + 1 > this.config.turnPendingHardEvents ||
				this.pendingEvents + 1 > this.config.workerPendingHardEvents)
		) {
			return this.overload(state, textDelta, 'Publisher pending-event hard limit exceeded');
		}

		const acceptanceWaiter = deferred<AgenticChatPublisherDurableAcceptanceV1>();
		const waiter = deferred<AgenticChatPublisherDeliveryV1>();
		// Either half of the split contract may be intentionally ignored by a
		// caller; keep a rejection observable to awaiters without creating a
		// process-level unhandled rejection for the unused half.
		void acceptanceWaiter.promise.catch(() => undefined);
		void waiter.promise.catch(() => undefined);
		if (canMerge) {
			last.textDelta += textDelta;
			last.assistantText = nextAssistantText;
			last.deltaBytes += deltaBytes;
			last.acceptanceWaiters.push(acceptanceWaiter);
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
				enqueuedAtMs: this.now(),
				attempt: 0,
				attemptStartedAtMs: null,
				retryScheduledAtMs: null,
				acceptanceWaiters: [acceptanceWaiter],
				waiters: [waiter]
			});
			this.pendingEvents += 1;
			this.metric('text_enqueued', turnRunId);
			this.trace(state, state.operations.at(-1)!, 'enqueued');
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

		return {
			accepted: acceptanceWaiter.promise,
			delivery: waiter.promise,
			pressure,
			pressureRelieved
		};
	}

	/**
	 * Compatibility surface for callers that still need live delivery before
	 * continuing. New semantic lifecycle callers should use enqueueSemantic()
	 * and await only `accepted`, then join `delivery` at their terminal drain.
	 */
	publishSemantic(
		turnRunId: string,
		input: AgenticChatSemanticPublishInputV1
	): Promise<AgenticChatPublisherDeliveryV1> {
		return this.enqueueSemantic(turnRunId, input).delivery;
	}

	enqueueSemantic(
		turnRunId: string,
		input: AgenticChatSemanticPublishInputV1
	): AgenticChatSemanticEnqueueResultV1 {
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
			this.pendingEventCount(state) + 1 > this.config.turnPendingHardEvents ||
			this.pendingEvents + 1 > this.config.workerPendingHardEvents
		) {
			this.overload(state, '', 'Publisher semantic pending-event hard limit exceeded');
		}
		const acceptanceWaiter = deferred<AgenticChatPublisherDurableAcceptanceV1>();
		const waiter = deferred<AgenticChatPublisherDeliveryV1>();
		void acceptanceWaiter.promise.catch(() => undefined);
		void waiter.promise.catch(() => undefined);
		const precedingOperation = state.operations.at(-1);
		if (precedingOperation?.kind === 'text') precedingOperation.urgent = true;
		state.operations.push({
			kind: 'semantic',
			input,
			assistantText: state.assistantText,
			bytes,
			inFlight: false,
			enqueuedAtMs: this.now(),
			attempt: 0,
			attemptStartedAtMs: null,
			retryScheduledAtMs: null,
			acceptanceWaiter,
			waiter
		});
		state.pendingBytes += bytes;
		this.pendingBytes += bytes;
		this.pendingEvents += 1;
		this.metric('semantic_enqueued', turnRunId);
		this.trace(state, state.operations.at(-1)!, 'enqueued');
		const pressure = this.pressureFor(state);
		const pressureRelieved = pressure === 'soft_limit' ? this.pressurePromise(state) : null;
		if (pressure === 'soft_limit') this.metric('soft_pressure', turnRunId);
		this.wake();
		return {
			accepted: acceptanceWaiter.promise,
			delivery: waiter.promise,
			pressure,
			pressureRelieved
		};
	}

	async flushTurn(turnRunId: string): Promise<AgenticChatPublisherDeliveryV1[]> {
		const state = this.requireTurn(turnRunId);
		if (state.blockedReason) {
			throw new AgenticChatPublisherBlockedError(turnRunId, state.blockedReason);
		}
		state.forceFlush = true;
		for (const operation of state.operations) {
			if (operation.kind === 'text') operation.urgent = true;
		}
		const deliveries = [...state.deliveries, ...state.operations].flatMap((operation) =>
			operation.kind === 'text'
				? operation.waiters.map((waiter) => waiter.promise)
				: [operation.waiter.promise]
		);
		this.wake();
		const results = await Promise.all(deliveries);
		await this.waitForTurnIdle(state);
		return results;
	}

	/**
	 * Deliver a semantic event already committed by a larger database transaction.
	 * When that transaction committed later sequences too, the database refuses an
	 * exact acknowledgement of this one; the last committed event carries it.
	 */
	publishCommittedSemantic(
		turnRunId: string,
		receipt: AgenticChatCommittedSemanticEventReceiptV1,
		options: { committedThroughSequence?: number } = {}
	): Promise<AgenticChatPublisherDeliveryV1> {
		const state = this.requireTurn(turnRunId);
		if (this.pendingEventCount(state) || state.busy || state.deliveryBusy) {
			throw new Error('Committed semantic publication requires a fully drained write slot');
		}
		return this.deliverPersisted(state, receipt, options.committedThroughSequence ?? null);
	}

	async publishTerminal(
		turnRunId: string,
		receipt: AgenticChatTerminalReceiptV1,
		eventPayload: JsonObject
	): Promise<AgenticChatPublisherDeliveryV1> {
		const state = this.requireTurn(turnRunId);
		if (this.pendingEventCount(state) || state.busy || state.deliveryBusy) {
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
			pendingEvents: this.pendingEventCount(state),
			pendingPersistenceEvents: state.operations.length,
			pendingDeliveryEvents: state.deliveries.length,
			persistenceRetryPending: state.persistenceRetryPending,
			reconcileOnly: state.reconcileOnly,
			blockedReason: state.blockedReason,
			busy: state.busy || state.deliveryBusy
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

	/** Process-local per-turn evidence for the worker progress-health surface. */
	getTurnProgressObservations(): AgenticChatPublisherTurnProgressObservationV1[] {
		const nowMs = this.now();
		return [...this.turns.values()].map((state) => {
			const oldestDelivery = state.deliveries[0];
			return {
				turnRunId: state.context.turnRunId,
				executionGeneration: state.context.executionGeneration,
				acceptedAt: state.context.acceptedAt ?? null,
				registeredAt: new Date(state.registeredAtMs).toISOString(),
				durableSequence: state.durableSequence,
				lastDurableProgressAt: state.lastDurableProgressAt,
				lastDurableEventType: state.lastDurableEventType,
				lastDelivery: state.lastDelivery,
				lastDeliveryAt:
					state.lastDeliveryAtMs === null
						? null
						: new Date(state.lastDeliveryAtMs).toISOString(),
				reconcileOnly: state.reconcileOnly,
				blockedReason: state.blockedReason,
				pendingPersistenceEvents: state.operations.length,
				pendingDeliveryEvents: state.deliveries.length,
				oldestPendingDeliveryAgeMs: oldestDelivery
					? nonnegativeElapsed(oldestDelivery.persistenceObservedAtMs, nowMs)
					: null
			};
		});
	}

	unregisterTurn(turnRunId: string): void {
		const state = this.requireTurn(turnRunId);
		if (state.busy || state.deliveryBusy || this.pendingEventCount(state)) {
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
		const pendingEvents = this.pendingEvents;
		const pendingBytes = this.pendingBytes;
		if (result !== 'drained') {
			for (const state of this.turns.values()) {
				state.abandoned = true;
				state.reconcileOnly = true;
				state.blockedReason = 'ownership_lost';
				this.rejectOperations(
					state,
					new AgenticChatPublisherBlockedError(
						state.context.turnRunId,
						'publisher_shutdown_drain_timeout'
					)
				);
			}
		}
		return {
			drained: result === 'drained' && pendingEvents === 0,
			pendingEvents,
			pendingBytes
		};
	}

	private async drainAvailable(): Promise<void> {
		while (true) {
			this.scheduleAvailableDeliveries();
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
		this.scheduleAvailableDeliveries();
	}

	private scheduleAvailableDeliveries(): void {
		const availableSlots = Math.max(
			0,
			this.config.maxConcurrentSemanticWrites - this.deliveryTasks.size
		);
		if (availableSlots === 0) return;
		const states = [...this.turns.values()]
			.filter((state) => !state.deliveryBusy && state.deliveries.length > 0)
			.slice(0, availableSlots);
		for (const state of states) {
			state.deliveryBusy = true;
			const task: Promise<void> = this.flushDeliveryState(state)
				.catch(() => {
					if (!state.abandoned) this.blockTurn(state, 'delivery_pump_error');
				})
				.finally(() => {
					// A settled run releases its slot before resolving waiters, and a
					// continuation may already have started the next run for this turn.
					if (state.deliveryTask === task) {
						state.deliveryBusy = false;
						state.deliveryTask = null;
					}
					this.deliveryTasks.delete(task);
					this.resolveTurnIdle(state);
					this.wake();
				});
			state.deliveryTask = task;
			this.deliveryTasks.add(task);
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
			this.startAttempt(state, operations[index]!);
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
				this.finishAttempt(
					state,
					operation,
					result?.outcome ?? 'missing_result',
					result?.outcome === 'rejected'
						? persistenceErrorCode({ code: result.error_code })
						: null
				);
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
				const persistenceObservedAtMs = this.now();
				const acceptedReceipt = this.acceptPersisted(state, result, (acceptance) =>
					this.acceptOperation(state, operation, acceptance)
				);
				if (acceptedReceipt && state.operations[0] === operation) {
					this.moveOperationToDelivery(
						state,
						operation,
						acceptedReceipt,
						persistenceObservedAtMs
					);
				}
			})
		);
	}

	private async flushSemanticState(state: TurnState): Promise<void> {
		const operation = state.operations[0] as SemanticOperation;
		state.busy = true;
		operation.inFlight = true;
		this.startAttempt(state, operation);
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
			this.finishAttempt(state, operation, result.outcome);
			const persistenceObservedAtMs = this.now();
			const acceptedReceipt = this.acceptPersisted(state, result, (acceptance) =>
				this.acceptOperation(state, operation, acceptance)
			);
			if (acceptedReceipt && state.operations[0] === operation) {
				this.moveOperationToDelivery(
					state,
					operation,
					acceptedReceipt,
					persistenceObservedAtMs
				);
			}
		} catch (error) {
			this.handlePersistenceFailure(state, error);
		}
	}

	private async deliverPersisted(
		state: TurnState,
		receipt: DeliveryReceipt,
		committedThroughSequence: number | null
	): Promise<AgenticChatPublisherDeliveryV1> {
		const acceptedReceipt = this.acceptPersisted(state, receipt);
		return acceptedReceipt
			? this.deliverAccepted(state, acceptedReceipt, committedThroughSequence)
			: 'blocked';
	}

	private acceptPersisted(
		state: TurnState,
		receipt: DeliveryReceipt,
		onAccepted?: (acceptance: AgenticChatPublisherDurableAcceptanceV1) => void
	): AcceptedDeliveryReceipt | null {
		if (state.abandoned) return null;
		if (!this.receiptMatchesTurn(state, receipt)) {
			this.blockTurn(state, 'receipt_scope_mismatch');
			return null;
		}
		if ('sequence_index' in receipt) {
			const expectedSequence = state.durableSequence + 1;
			if (receipt.sequence_index !== expectedSequence) {
				this.blockTurn(state, 'receipt_sequence_gap');
				return null;
			}
			state.durableSequence = receipt.sequence_index;
		}
		if (!canPublishAgenticChatStreamWriteV1(receipt)) {
			if (receipt.outcome === 'already_persisted') {
				onAccepted?.(this.acceptanceFromReceipt(receipt));
				this.enterReconcileOnly(state);
				return receipt;
			}
			this.blockTurn(state, receipt.outcome);
			return null;
		}
		const publishableReceipt = receipt as PublishableDeliveryReceipt;
		this.observePersistence(state, publishableReceipt);
		onAccepted?.(this.acceptanceFromReceipt(publishableReceipt));
		return publishableReceipt;
	}

	private async deliverAccepted(
		state: TurnState,
		receipt: AcceptedDeliveryReceipt,
		committedThroughSequence: number | null
	): Promise<AgenticChatPublisherDeliveryV1> {
		if (state.abandoned || state.blockedReason) return 'blocked';
		if (receipt.outcome === 'already_persisted') {
			await this.maybeHint(state, receipt.sequence_index);
			return 'already_persisted';
		}
		if (state.reconcileOnly) {
			await this.maybeHint(state, receipt.sequence_index);
			return 'reconcile_only';
		}

		const message = this.eventMessage(state, this.eventFromReceipt(receipt));
		if ((await this.tryBroadcast(message)) !== 'sent') {
			this.enterReconcileOnly(state);
			this.metric('broadcast_degraded', state.context.turnRunId);
			return 'reconcile_only';
		}
		if (state.abandoned || state.blockedReason) return 'blocked';
		if (
			committedThroughSequence !== null &&
			committedThroughSequence > receipt.sequence_index
		) {
			this.metric('acknowledgement_coalesced', state.context.turnRunId);
			return 'broadcast_sent_reconcile_pending';
		}
		return this.acknowledge(state, receipt.sequence_index);
	}

	/**
	 * Deliver this turn's accepted events strictly in sequence order. Consecutive
	 * successful Broadcasts share one exact-sequence acknowledgement for the last
	 * event: the database acknowledges only its current durable sequence, so an
	 * older acknowledgement is necessarily refused once later work is accepted.
	 * Any failed Broadcast or uncertain acknowledgement remains sticky.
	 */
	private async flushDeliveryState(state: TurnState): Promise<void> {
		const decided: SettledDelivery[] = [];
		const sent: DeliveryOperation[] = [];
		const settleSent = (delivery: AgenticChatPublisherDeliveryV1) => {
			for (const pending of sent.splice(0)) decided.push({ pending, delivery });
		};
		while (!this.deliveryBlocked(state)) {
			const position = decided.length + sent.length;
			const pending = state.deliveries[position];
			if (!pending || position >= this.config.turnPendingSoftEvents) break;
			const receipt = pending.receipt;
			if (receipt.outcome === 'persisted' && !state.reconcileOnly) {
				const result = await this.tryBroadcast(
					this.eventMessage(state, this.eventFromReceipt(receipt))
				);
				if (this.deliveryBlocked(state)) return;
				if (result === 'sent') {
					sent.push(pending);
					continue;
				}
				this.enterReconcileOnly(state);
				this.metric('broadcast_degraded', state.context.turnRunId);
				settleSent('broadcast_sent_reconcile_pending');
				decided.push({ pending, delivery: 'reconcile_only' });
				continue;
			}
			await this.maybeHint(state, receipt.sequence_index);
			if (this.deliveryBlocked(state)) return;
			settleSent('broadcast_sent_reconcile_pending');
			decided.push({
				pending,
				delivery:
					receipt.outcome === 'already_persisted' ? 'already_persisted' : 'reconcile_only'
			});
		}
		if (this.deliveryBlocked(state)) return;
		const lastSent = sent.at(-1);
		if (lastSent) {
			if (state.reconcileOnly) {
				settleSent('broadcast_sent_reconcile_pending');
			} else if (state.durableSequence > lastSent.receipt.sequence_index) {
				// The next ordered run carries this turn's exact acknowledgement.
				this.metric('acknowledgement_coalesced', state.context.turnRunId);
				settleSent('broadcast_sent_reconcile_pending');
			} else {
				const delivery = await this.acknowledge(state, lastSent.receipt.sequence_index);
				if (this.deliveryBlocked(state)) return;
				settleSent(delivery);
			}
		}
		this.completeDeliveries(state, decided);
	}

	private deliveryBlocked(state: TurnState): boolean {
		return state.abandoned || state.blockedReason !== null;
	}

	private acceptanceFromReceipt(
		receipt:
			| PublishableDeliveryReceipt
			| Extract<DeliveryReceipt, { outcome: 'already_persisted' }>
	): AgenticChatPublisherDurableAcceptanceV1 {
		return {
			outcome: receipt.outcome,
			turnRunId: receipt.turn_run_id,
			executionGeneration: receipt.execution_generation,
			sequenceIndex: receipt.sequence_index,
			phase: receipt.phase,
			eventType: receipt.event_type,
			persistedAt: receipt.outcome === 'persisted' ? receipt.persisted_at : null
		};
	}

	private observePersistence(state: TurnState, receipt: PublishableDeliveryReceipt): void {
		state.lastDurableProgressAt = receipt.persisted_at;
		state.lastDurableEventType = receipt.event_type;
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

	private observeDelivery(
		state: TurnState,
		operation: { enqueuedAtMs: number },
		receipt: PublishableDeliveryReceipt,
		persistenceObservedAtMs: number,
		delivery: AgenticChatPublisherDeliveryV1
	): void {
		try {
			const deliveryObservedAtMs = this.now();
			const queueingMs = nonnegativeElapsed(operation.enqueuedAtMs, persistenceObservedAtMs);
			const deliveryDecisionMs = nonnegativeElapsed(
				persistenceObservedAtMs,
				deliveryObservedAtMs
			);
			state.context.onDeliveryObserved?.({
				turnRunId: state.context.turnRunId,
				executionGeneration: state.context.executionGeneration,
				sequenceIndex: receipt.sequence_index,
				eventType: receipt.event_type,
				delivery,
				queueingMs,
				deliveryDecisionMs,
				durableAcknowledgementMs:
					delivery === 'broadcast_acknowledged' ? deliveryDecisionMs : null,
				totalDeliveryMs: nonnegativeElapsed(operation.enqueuedAtMs, deliveryObservedAtMs)
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
			if (
				result.outcome === 'newer_snapshot' &&
				(result.current_sequence <= state.durableSequence ||
					state.busy ||
					state.persistenceRetryPending)
			) {
				// This turn's own later write committed first; its ordered delivery
				// carries the next exact acknowledgement. A newer sequence that this
				// publisher cannot account for remains sticky uncertainty below.
				this.metric('acknowledgement_coalesced', state.context.turnRunId);
				return 'broadcast_sent_reconcile_pending';
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

	private moveOperationToDelivery(
		state: TurnState,
		operation: Operation,
		receipt: AcceptedDeliveryReceipt,
		persistenceObservedAtMs: number
	): void {
		if (state.operations[0] !== operation)
			throw new Error('Per-turn publisher slot lost ordering');
		state.operations.shift();
		state.busy = false;
		state.retryAtMs = 0;
		state.persistenceRetryPending = false;
		operation.inFlight = false;
		state.deliveries.push(
			operation.kind === 'text'
				? {
						kind: 'text',
						bytes: operation.deltaBytes,
						enqueuedAtMs: operation.enqueuedAtMs,
						waiters: operation.waiters,
						receipt,
						persistenceObservedAtMs
					}
				: {
						kind: 'semantic',
						bytes: operation.bytes,
						enqueuedAtMs: operation.enqueuedAtMs,
						waiter: operation.waiter,
						receipt,
						persistenceObservedAtMs
					}
		);
		if (!state.operations.length) state.forceFlush = false;
	}

	private completeDeliveries(state: TurnState, decided: SettledDelivery[]): void {
		for (const { pending, delivery } of decided) {
			if (state.deliveries[0] !== pending)
				throw new Error('Per-turn delivery pump lost ordering');
			state.deliveries.shift();
			state.pendingBytes -= pending.bytes;
			this.pendingBytes -= pending.bytes;
			this.pendingEvents -= 1;
			if (pending.receipt.outcome === 'persisted') {
				this.observeDelivery(
					state,
					pending,
					pending.receipt,
					pending.persistenceObservedAtMs,
					delivery
				);
			}
		}
		const lastDecided = decided.at(-1);
		if (lastDecided) {
			state.lastDelivery = lastDecided.delivery;
			state.lastDeliveryAtMs = this.now();
		}
		// Promise continuations may inspect the snapshot or publish a committed
		// terminal event immediately. Release the slot before resolving them; the
		// task cleanup cannot reclaim a slot that a newer run now owns.
		state.deliveryBusy = false;
		state.deliveryTask = null;
		for (const { pending, delivery } of decided) {
			if (pending.kind === 'text') {
				for (const waiter of pending.waiters) waiter.resolve(delivery);
			} else {
				pending.waiter.resolve(delivery);
			}
		}
		this.resolvePressureWaiters();
		this.resolveTurnIdle(state);
	}

	private acceptOperation(
		state: TurnState,
		operation: Operation,
		acceptance: AgenticChatPublisherDurableAcceptanceV1
	): void {
		this.trace(state, operation, 'accepted', {
			sequence: state.durableSequence,
			enqueueToReceiptMs: nonnegativeElapsed(operation.enqueuedAtMs, this.now()),
			outcome: acceptance.outcome
		});
		if (operation.kind === 'text') {
			for (const waiter of operation.acceptanceWaiters) waiter.resolve(acceptance);
		} else {
			operation.acceptanceWaiter.resolve(acceptance);
		}
	}

	private trace(
		state: TurnState,
		operation: Operation | undefined,
		stage: AgenticChatPersistenceTraceV1['stage'],
		details: Partial<AgenticChatPersistenceTraceV1> = {}
	): void {
		emitAgenticChatPersistenceTrace(this.ports.onTrace, {
			event: 'agentic_chat_persistence_trace',
			lane: 'publisher',
			stage,
			turnRunId: state.context.turnRunId,
			executionGeneration: state.context.executionGeneration,
			observedAt: new Date().toISOString(),
			pendingEvents: this.pendingEventCount(state),
			...(operation
				? {
						operationId:
							operation.kind === 'text'
								? operation.batchId
								: operation.input.transitionId,
						eventType:
							operation.kind === 'text' ? 'text_delta' : operation.input.eventType,
						rpc:
							operation.kind === 'text'
								? 'flush_agentic_chat_text_batches'
								: 'persist_agentic_chat_semantic_event',
						attempt: operation.attempt
					}
				: {}),
			...details
		});
	}

	private startAttempt(state: TurnState, operation: Operation): void {
		const now = this.now();
		operation.attempt += 1;
		operation.attemptStartedAtMs = now;
		this.trace(state, operation, 'attempt_started', {
			queueWaitMs:
				operation.attempt === 1
					? nonnegativeElapsed(operation.enqueuedAtMs, now)
					: undefined,
			retryWaitMs:
				operation.retryScheduledAtMs === null
					? 0
					: nonnegativeElapsed(operation.retryScheduledAtMs, now)
		});
	}

	private finishAttempt(
		state: TurnState,
		operation: Operation,
		outcome: string,
		errorCode: string | null = null
	): void {
		this.trace(state, operation, 'attempt_finished', {
			durationMs:
				operation.attemptStartedAtMs === null
					? 0
					: nonnegativeElapsed(operation.attemptStartedAtMs, this.now()),
			outcome,
			errorCode
		});
	}

	private deferRetry(state: TurnState): void {
		if (state.abandoned) return;
		const operation = state.operations[0];
		if (operation) {
			operation.inFlight = false;
			operation.retryScheduledAtMs = this.now();
			this.trace(state, operation, 'retry_scheduled', {
				retryDelayMs: this.config.retryDelayMs
			});
		}
		state.busy = false;
		state.retryAtMs = this.now() + this.config.retryDelayMs;
		state.persistenceRetryPending = true;
		this.metric('persistence_retry', state.context.turnRunId);
	}

	private handlePersistenceFailure(state: TurnState, error: unknown): void {
		const operation = state.operations[0];
		if (operation) this.finishAttempt(state, operation, 'failed', persistenceErrorCode(error));
		const code =
			typeof error === 'object' && error !== null && 'code' in error
				? String((error as { code?: unknown }).code ?? '')
				: '';
		if (!code || isRetryableDatabaseCode(code)) {
			this.deferRetry(state);
			return;
		}
		// The SQLSTATE alone ('P0001' for every RAISE EXCEPTION) cannot tell an
		// operator which database guard fired; keep the bounded message token.
		const message =
			typeof error === 'object' && error !== null && 'message' in error
				? String((error as { message?: unknown }).message ?? '')
						.replace(/[^A-Za-z0-9_.:-]+/g, '_')
						.slice(0, 120)
				: '';
		this.blockTurn(
			state,
			message ? `persistence_error:${code}:${message}` : `persistence_error:${code}`
		);
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
			this.pendingEventCount(state)
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
		for (const delivery of state.deliveries) {
			if (delivery.kind === 'text') {
				for (const waiter of delivery.waiters) waiter.reject(error);
			} else {
				delivery.waiter.reject(error);
			}
		}
		for (const operation of state.operations) {
			if (operation.kind === 'text') {
				for (const waiter of operation.acceptanceWaiters) waiter.reject(error);
				for (const waiter of operation.waiters) waiter.reject(error);
			} else {
				operation.acceptanceWaiter.reject(error);
				operation.waiter.reject(error);
			}
		}
		this.pendingBytes -= state.pendingBytes;
		this.pendingEvents -= this.pendingEventCount(state);
		state.pendingBytes = 0;
		state.operations = [];
		state.deliveries = [];
		state.busy = false;
		state.persistenceRetryPending = false;
		state.forceFlush = false;
		this.resolvePressureWaiters();
		// A blocked turn's writers observe the typed error on their next append.
		// Never park them behind worker-wide pressure after the turn is removed.
		for (const waiter of state.pressureWaiters.splice(0)) waiter.resolve();
		this.resolveTurnIdle(state);
	}

	private pressureFor(state: TurnState): AgenticChatPublisherPressureV1 {
		return state.pendingBytes >= this.config.turnPendingSoftBytes ||
			this.pendingBytes >= this.config.workerPendingSoftBytes ||
			this.pendingEventCount(state) >= this.config.turnPendingSoftEvents ||
			this.pendingEvents >= this.config.workerPendingSoftEvents
			? 'soft_limit'
			: 'normal';
	}

	private pendingEventCount(state: TurnState): number {
		return state.operations.length + state.deliveries.length;
	}

	private pressurePromise(state: TurnState): Promise<void> {
		const waiter = deferred<void>();
		const startedAtMs = this.now();
		const operation = state.operations.at(-1);
		this.trace(state, operation, 'pressure_started');
		state.pressureWaiters.push(waiter);
		return waiter.promise.then(() => {
			this.trace(state, operation, 'pressure_finished', {
				durationMs: nonnegativeElapsed(startedAtMs, this.now()),
				outcome: state.abandoned || state.blockedReason ? 'blocked' : 'relieved'
			});
		});
	}

	private resolvePressure(state: TurnState): void {
		if (this.pressureFor(state) === 'soft_limit') return;
		for (const waiter of state.pressureWaiters.splice(0)) waiter.resolve();
	}

	private resolvePressureWaiters(): void {
		for (const state of this.turns.values()) this.resolvePressure(state);
	}

	private waitForTurnIdle(state: TurnState): Promise<void> {
		if (!state.busy && !state.deliveryBusy && this.pendingEventCount(state) === 0) {
			return Promise.resolve();
		}
		const waiter = deferred<void>();
		state.idleWaiters.push(waiter);
		return waiter.promise;
	}

	private resolveTurnIdle(state: TurnState): void {
		if (state.busy || state.deliveryBusy || this.pendingEventCount(state) > 0) return;
		for (const waiter of state.idleWaiters.splice(0)) waiter.resolve();
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
		const hasDeliveryCapacity =
			this.deliveryTasks.size < this.config.maxConcurrentSemanticWrites;
		return [...this.turns.values()].some((state) => {
			if (hasDeliveryCapacity && !state.deliveryBusy && state.deliveries.length > 0) {
				return true;
			}
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
		while (this.drainPromise || this.deliveryTasks.size > 0 || this.pendingEvents > 0) {
			if (this.drainPromise) await this.drainPromise;
			else if (this.deliveryTasks.size) await Promise.race(this.deliveryTasks);
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

export function validateAgenticChatPublisherConfig(config: AgenticChatPublisherConfig): void {
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

function nonnegativeElapsed(startedAtMs: number, finishedAtMs: number): number {
	if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs)) return 0;
	return Math.max(0, finishedAtMs - startedAtMs);
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
