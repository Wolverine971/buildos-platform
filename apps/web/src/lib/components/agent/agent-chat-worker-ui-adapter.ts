// apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatLiveTextPreviewV1,
	type AgenticChatReconcileAssistantMessageV1,
	type AgentSSEMessage,
	type AgentStreamEventV1,
	type ChatTurnStatusV1,
	type JsonObject,
	type TurnHandleV1
} from '@buildos/shared-types';
import type {
	AgenticChatWorkerApplicationObserver,
	AgenticChatWorkerReconciliationLoss
} from '$lib/services/agentic-chat-v2/worker-realtime-coordinator';
import type { AgenticChatWorkerReconciledReceipt } from '$lib/services/agentic-chat-v2/worker-realtime-inbox';
import {
	LIVE_TEXT_PREVIEW_STALE_MS,
	type LiveTextPreviewState,
	clearLiveTextPreview,
	createLiveTextPreviewState,
	expireLiveTextPreview,
	liveTextPreviewSuffix,
	observeDurableLiveEvent,
	observeDurableReconciliation,
	receiveLiveTextPreview
} from '$lib/services/agentic-chat-v2/worker-realtime-preview';
import {
	isWorkerQueueTimeout,
	WORKER_CONNECTION_LOST_FAILURE_CODE,
	WORKER_QUEUE_TIMEOUT_FINISHED_REASON,
	workerActivityForStatus,
	workerResumingActivity
} from './agent-chat-worker-status';
import { readDurableChatWorkflowProgress } from './agent-chat-workflow';

const WORKER_UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';
const MAX_PROJECTION_EVENTS = 128;

type WorkerTurnHandle = Extract<TurnHandleV1, { executionMode: 'worker_realtime' }>;
type WorkerTerminalStatus = Extract<ChatTurnStatusV1, 'completed' | 'failed' | 'cancelled'>;

export type AgentChatWorkerUiAdapterPort = {
	beginGeneration(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		status: ChatTurnStatusV1;
	}): void;
	replaceAssistantSnapshot(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string;
		assistantMessage: AgenticChatReconcileAssistantMessageV1 | null;
		status: ChatTurnStatusV1;
	}): void;
	appendAssistantText(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string;
	}): void;
	applySemanticEvent(event: AgentSSEMessage): void;
	updateTurnState(input: {
		handle: WorkerTurnHandle;
		status: ChatTurnStatusV1;
		currentActivity: string;
	}): void;
	finishTurn(input: {
		handle: WorkerTurnHandle;
		status: WorkerTerminalStatus;
		finishedReason: string | null;
		failureCode: string | null;
	}): void;
	/**
	 * Display-only live preview: `text` is shown after the durable assistant text
	 * (it already carries any paragraph join); null removes it. Never persist it.
	 */
	setAssistantPreview?(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string | null;
	}): void;
	/**
	 * A stopped turn ended while preview text was on screen: keep that text in
	 * the bubble (appended to its durable text) and mark it stopped.
	 */
	freezeAssistantPreview?(input: {
		handle: WorkerTurnHandle;
		executionGeneration: number;
		text: string;
	}): void;
	/** True while Stop is pending for this turn; the shown preview is then held. */
	isStopRequested?(handle: WorkerTurnHandle): boolean;
	/** Reconciliation keeps failing (true) or recovered (false); the turn stays live. */
	setConnectionLost?(input: { handle: WorkerTurnHandle; lost: boolean }): void;
	onError?(error: unknown): void;
};

type ParsedProjection = {
	currentActivity: string | null;
	semanticEvents: AgentStreamEventV1[];
};

export class AgentChatWorkerUiAdapter implements AgenticChatWorkerApplicationObserver {
	readonly #handle: WorkerTurnHandle;
	readonly #port: AgentChatWorkerUiAdapterPort;
	readonly #onTerminal: (status: WorkerTerminalStatus) => void;
	readonly #now: () => number;
	#executionGeneration: number | null = null;
	#terminal = false;
	#terminalNotified = false;
	#appliedSemanticEventIds = new Set<string>();
	/** Durable assistant text as applied to the port; the preview renders after it. */
	#durableText = '';
	#preview: LiveTextPreviewState = createLiveTextPreviewState();
	#previewShown = '';
	/** Durable text and generation the shown preview suffix was computed against. */
	#previewShownAfter = '';
	#previewShownGeneration: number | null = null;
	#previewTimer: ReturnType<typeof setTimeout> | null = null;
	/** Highest durable sequence seen in the current generation; above 0 = it started. */
	#generationDurableSequence = 0;
	/** Status last applied for the current generation. */
	#generationStatus: ChatTurnStatusV1 | null = null;
	/** When this browser saw the current generation go back to `queued` after running. */
	#requeuedObservedAt: number | null = null;
	/**
	 * Set while a reply starts over: an attempt that had started was put back in
	 * line (a deploy drained its worker), its partial output is cleared, and the
	 * next attempt has produced nothing yet. Ends at that attempt's first event.
	 */
	#resume: { fromGeneration: number; sinceMs: number } | null = null;

	constructor(input: {
		handle: WorkerTurnHandle;
		port: AgentChatWorkerUiAdapterPort;
		onTerminal(status: WorkerTerminalStatus): void;
		now?: () => number;
	}) {
		this.#handle = input.handle;
		this.#port = input.port;
		this.#onTerminal = input.onTerminal;
		this.#now = input.now ?? Date.now;
	}

	applyReconciliation(receipt: AgenticChatWorkerReconciledReceipt): void {
		if (this.#terminal) return;
		this.#assertReceiptIdentity(receipt);
		const generationChanged = this.#executionGeneration !== receipt.execution_generation;
		const previousGeneration = this.#executionGeneration;
		const previousAttemptStarted =
			generationChanged && previousGeneration !== null && this.#generationDurableSequence > 0;
		const textWasShown = this.#durableText !== '' || this.#previewShown !== '';
		// A queued turn whose own generation already persisted events is an
		// attempt that started and was put back in line (only a drained deploy
		// does that, 20261017181000). Its text and steps belong to an attempt the
		// next one replaces from the start, so none of it is shown again.
		const discardedAttempt =
			receipt.status === 'queued' && receipt.durable_through_sequence > 0;
		if (generationChanged) {
			this.#executionGeneration = receipt.execution_generation;
			this.#appliedSemanticEventIds = new Set();
			this.#preview = createLiveTextPreviewState();
			this.#generationDurableSequence = 0;
			this.#generationStatus = null;
			this.#requeuedObservedAt = null;
			this.#port.beginGeneration({
				handle: this.#handle,
				executionGeneration: receipt.execution_generation,
				status: receipt.status
			});
		}
		if (discardedAttempt || previousAttemptStarted) {
			this.#resume ??= {
				fromGeneration: discardedAttempt
					? receipt.execution_generation
					: (previousGeneration ?? receipt.execution_generation),
				sinceMs: this.#now()
			};
		}
		if (
			this.#resume &&
			receipt.execution_generation > this.#resume.fromGeneration &&
			receipt.durable_through_sequence > 0
		) {
			this.#resume = null;
		}
		if (receipt.status === 'queued') {
			if (
				this.#requeuedObservedAt === null &&
				(discardedAttempt ||
					(this.#generationStatus !== null && this.#generationStatus !== 'queued'))
			) {
				this.#requeuedObservedAt = this.#now();
			}
		} else {
			this.#requeuedObservedAt = null;
		}
		this.#generationStatus = receipt.status;
		this.#generationDurableSequence = Math.max(
			this.#generationDurableSequence,
			receipt.durable_through_sequence
		);

		// The complete text snapshot is authoritative. It must land before any
		// semantic projection or post-projection durable events are applied.
		const snapshotText = discardedAttempt ? '' : receipt.text;
		const durableTextBefore = generationChanged || discardedAttempt ? '' : this.#durableText;
		this.#port.replaceAssistantSnapshot({
			handle: this.#handle,
			executionGeneration: receipt.execution_generation,
			text: snapshotText,
			assistantMessage: receipt.assistant_message,
			status: receipt.status
		});
		this.#durableText = snapshotText;
		if (discardedAttempt) {
			this.#preview = createLiveTextPreviewState();
		} else {
			this.#preview = observeDurableReconciliation(this.#preview, {
				watermark: receipt.response_watermark,
				eventsAbove: (after) => {
					let count = 0;
					let allText = true;
					for (const event of receipt.durable_events) {
						if (event.sequence_index <= after) continue;
						count += 1;
						if (event.type !== 'text_delta') allText = false;
					}
					return { count, allText };
				},
				durableTextBefore
			});
		}
		this.#syncPreview();
		// A restart erases the answer the user was reading. Without this the
		// emptied bubble would stay on screen as a blank card until new text.
		if (textWasShown && !snapshotText && !receipt.assistant_message) {
			this.#dropEmptyAssistantBubble();
		}

		const projection = discardedAttempt
			? { currentActivity: null, semanticEvents: [] }
			: this.#parseProjection(
					receipt.projection,
					receipt.execution_generation,
					receipt.projection_durable_sequence
				);
		for (const event of projection.semanticEvents) this.#applySemanticEvent(event);
		if (!discardedAttempt) {
			this.#applyWorkflowSnapshot(
				receipt.projection.workflow,
				receipt.execution_generation,
				receipt.projection_durable_sequence
			);
			for (const event of receipt.durable_events) {
				// Reconciliation text already includes every delta through the response
				// watermark. Re-appending a retained delta would duplicate output.
				if (event.type !== 'text_delta' && event.type !== 'text') {
					this.#applySemanticEvent(event);
				}
			}
		}

		this.#port.updateTurnState({
			handle: this.#handle,
			status: receipt.status,
			currentActivity: this.#activityFor(receipt, projection.currentActivity)
		});

		if (isTerminalStatus(receipt.status)) {
			this.#applySyntheticTerminal(
				receipt.status,
				receipt.finished_reason,
				receipt.failure_code,
				{
					executionGeneration: receipt.execution_generation,
					sequenceIndex: receipt.response_watermark,
					eventId: receipt.terminal_event_id
				}
			);
		}
	}

	applyLiveEvent(event: AgentStreamEventV1): void {
		if (this.#terminal) return;
		if (!eventMatchesHandle(event, this.#handle)) {
			throw new Error('Worker live event does not match its adopted handle');
		}
		if (this.#executionGeneration !== event.execution_generation) {
			throw new Error('Worker live event arrived before generation reconciliation');
		}
		this.#generationDurableSequence = Math.max(
			this.#generationDurableSequence,
			event.sequence_index
		);
		// The new attempt's first event carries its own status; the restart line ends.
		if (this.#resume && event.execution_generation > this.#resume.fromGeneration) {
			this.#resume = null;
		}

		if (event.type === 'text_delta') {
			const text = readTextDelta(event);
			if (!text) throw new Error('Worker text delta is invalid');
			this.#preview = observeDurableLiveEvent(this.#preview, {
				sequence: event.sequence_index,
				isText: true,
				durableTextBefore: this.#durableText
			});
			this.#port.appendAssistantText({
				handle: this.#handle,
				executionGeneration: event.execution_generation,
				text
			});
			this.#durableText += text;
			this.#syncPreview();
			return;
		}
		if (event.type === 'text') {
			throw new Error('Worker transport cannot publish a non-snapshot text event');
		}

		// Durable truth above the preview's floor supersedes it before it renders.
		this.#preview = observeDurableLiveEvent(this.#preview, {
			sequence: event.sequence_index,
			isText: false,
			durableTextBefore: this.#durableText
		});
		this.#syncPreview();
		this.#applySemanticEvent(event);
		if (event.type === 'done') {
			const status = readTerminalStatus(event);
			this.#finish(
				status,
				readNullableString(event, 'finished_reason'),
				readNullableString(event, 'failure_code')
			);
		}
	}

	/**
	 * Display-only live preview from the coordinator (outside the sequenced
	 * inbox). Only the adopted handle's current generation can show one.
	 */
	applyPreview(preview: AgenticChatLiveTextPreviewV1): void {
		if (
			this.#terminal ||
			preview.turn_run_id !== this.#handle.turnRunId ||
			preview.session_id !== this.#handle.sessionId ||
			preview.execution_generation !== this.#executionGeneration
		) {
			return;
		}
		this.#preview = receiveLiveTextPreview(this.#preview, preview, this.#now());
		this.#syncPreview();
	}

	/**
	 * The status line for a receipt. While a reply starts over it is the restart
	 * line, timed from when this browser saw the restart. Otherwise nothing runs
	 * while queued, so any projected activity is a previous attempt's: the wait
	 * itself is the status, calm first, then named once it runs long (the
	 * watchdog re-reconciles a queued turn every ~5 s). A queued snapshot's
	 * updated_at is when it entered the queue, so a reload shows the same text;
	 * a turn this browser watched go back in line counts from that moment.
	 */
	#activityFor(
		receipt: AgenticChatWorkerReconciledReceipt,
		projectedActivity: string | null
	): string {
		const now = this.#now();
		if (this.#resume && (receipt.status === 'queued' || receipt.status === 'running')) {
			return workerResumingActivity(this.#resume.sinceMs, now);
		}
		if (receipt.status !== 'queued') {
			return projectedActivity ?? workerActivityForStatus(receipt.status);
		}
		const queuedSinceMs = Math.max(
			Date.parse(receipt.updated_at) || Number.NEGATIVE_INFINITY,
			this.#requeuedObservedAt ?? Number.NEGATIVE_INFINITY
		);
		return workerActivityForStatus('queued', {
			queuedSince: Number.isFinite(queuedSinceMs)
				? new Date(queuedSinceMs).toISOString()
				: receipt.updated_at,
			now
		});
	}

	/**
	 * Remove the streaming bubble after its text was cleared. The port's
	 * preview-removal path drops a streaming bubble that holds no text, the
	 * same way it drops one opened only for a preview; a persisted message is
	 * never touched.
	 */
	#dropEmptyAssistantBubble(): void {
		const generation = this.#executionGeneration;
		if (generation === null) return;
		this.#previewShown = '';
		this.#previewShownAfter = '';
		this.#previewShownGeneration = generation;
		try {
			this.#port.setAssistantPreview?.({
				handle: this.#handle,
				executionGeneration: generation,
				text: null
			});
		} catch (error) {
			this.#reportError(error);
		}
	}

	/** Push the preview suffix when it changes; a caught-up or diverged settle ends it. */
	#syncPreview(): void {
		this.#preview = expireLiveTextPreview(this.#preview, this.#now());
		const suffix = this.#terminal
			? ''
			: liveTextPreviewSuffix(this.#preview, this.#durableText);
		if (!suffix) this.#preview = clearLiveTextPreview(this.#preview);
		this.#schedulePreviewExpiry();
		// After Stop the aborted pass retracts its preview; keep the text the user
		// was reading until the terminal freezes it. New durable text still wins.
		if (!suffix && !this.#terminal && this.#holdsStoppedPreview()) return;
		if (suffix === this.#previewShown || this.#executionGeneration === null) return;
		this.#previewShown = suffix;
		this.#previewShownAfter = this.#durableText;
		this.#previewShownGeneration = this.#executionGeneration;
		try {
			this.#port.setAssistantPreview?.({
				handle: this.#handle,
				executionGeneration: this.#executionGeneration,
				text: suffix || null
			});
		} catch (error) {
			this.#reportError(error);
		}
	}

	#holdsStoppedPreview(): boolean {
		if (!this.#previewStillCurrent()) return false;
		try {
			return this.#port.isStopRequested?.(this.#handle) === true;
		} catch (error) {
			this.#reportError(error);
			return false;
		}
	}

	/**
	 * Reconciliation cannot follow this turn. Permanent: end it locally as
	 * failed (the banner says to reopen the chat). Otherwise only flag it; the
	 * turn stays live and a later reconcile clears the flag.
	 */
	reportReconciliationLost(loss: AgenticChatWorkerReconciliationLoss): void {
		if (this.#terminal) return;
		if (loss.permanent) {
			this.#finish('failed', null, WORKER_CONNECTION_LOST_FAILURE_CODE);
			return;
		}
		this.#setConnectionLost(true);
	}

	reportReconciliationRestored(): void {
		if (this.#terminal) return;
		this.#setConnectionLost(false);
	}

	#setConnectionLost(lost: boolean): void {
		try {
			this.#port.setConnectionLost?.({ handle: this.#handle, lost });
		} catch (error) {
			this.#reportError(error);
		}
	}

	#schedulePreviewExpiry(): void {
		if (this.#previewTimer !== null) {
			clearTimeout(this.#previewTimer);
			this.#previewTimer = null;
		}
		const active = this.#preview.active;
		if (!active) return;
		const delayMs = Math.max(1, active.receivedAt + LIVE_TEXT_PREVIEW_STALE_MS - this.#now());
		this.#previewTimer = setTimeout(() => {
			this.#previewTimer = null;
			this.#syncPreview();
		}, delayMs);
	}

	#applySemanticEvent(event: AgentStreamEventV1): void {
		if (this.#appliedSemanticEventIds.has(event.event_id)) return;
		// Terminal events carry the same final workflow truth as reconciliation. Apply
		// it first: a completed turn can still contain a deliberately partial review.
		if (event.type === 'done') {
			this.#applyWorkflowSnapshot(
				'workflow' in event ? event.workflow : undefined,
				event.execution_generation,
				event.sequence_index
			);
		}
		const normalized = toAgentSSEMessage(event);
		if (!normalized) throw new Error(`Unsupported worker UI event: ${event.type}`);
		this.#port.applySemanticEvent(normalized);
		this.#appliedSemanticEventIds.add(event.event_id);
	}

	#applyWorkflowSnapshot(
		value: unknown,
		executionGeneration: number,
		sequenceIndex: number
	): void {
		if (value === undefined || value === null) return;
		const workflow = readDurableChatWorkflowProgress(value);
		if (!workflow) {
			this.#reportError(new Error('Worker workflow projection is invalid'));
			return;
		}
		// Snapshot identity is intentionally separate from a wire event at the same
		// sequence; otherwise a terminal projection would swallow its done event.
		const eventId = `workflow-projection:${this.#handle.turnRunId}:${executionGeneration}:${sequenceIndex}`;
		if (this.#appliedSemanticEventIds.has(eventId)) return;
		this.#port.applySemanticEvent({
			type: 'workflow_progress',
			workflow,
			event_id: eventId,
			stream_run_id: this.#handle.streamRunId,
			client_turn_id: this.#handle.clientTurnId,
			turn_run_id: this.#handle.turnRunId,
			sequence_index: sequenceIndex,
			phase: 'llm',
			event_type: 'workflow_progress',
			durable: true
		});
		this.#appliedSemanticEventIds.add(eventId);
	}

	#applySyntheticTerminal(
		status: WorkerTerminalStatus,
		finishedReason: string | null,
		failureCode: string | null,
		identity: {
			executionGeneration: number;
			sequenceIndex: number;
			eventId: string | null;
		}
	): void {
		const sequenceIndex = Math.max(1, identity.sequenceIndex);
		const eventId =
			identity.eventId ??
			createAgentStreamEventIdV1(
				this.#handle.turnRunId,
				identity.executionGeneration,
				sequenceIndex
			);
		if (!this.#appliedSemanticEventIds.has(eventId)) {
			this.#port.applySemanticEvent({
				type: 'done',
				event_id: eventId,
				stream_run_id: this.#handle.streamRunId,
				client_turn_id: this.#handle.clientTurnId,
				turn_run_id: this.#handle.turnRunId,
				sequence_index: sequenceIndex,
				phase: 'finalize',
				event_type: 'done',
				durable: true,
				...doneOutcomeFields(status, finishedReason)
			});
			this.#appliedSemanticEventIds.add(eventId);
		}
		this.#finish(status, finishedReason, failureCode);
	}

	#finish(
		status: WorkerTerminalStatus,
		finishedReason: string | null,
		failureCode: string | null
	): void {
		if (this.#terminal) return;
		this.#terminal = true;
		this.#freezeStoppedPreview(status);
		this.#syncPreview();
		this.#port.finishTurn({
			handle: this.#handle,
			status,
			finishedReason,
			failureCode
		});
		if (!this.#terminalNotified) {
			this.#terminalNotified = true;
			this.#onTerminal(status);
		}
	}

	/** The shown preview still extends the current durable text of its generation. */
	#previewStillCurrent(): boolean {
		return (
			this.#previewShown.length > 0 &&
			this.#previewShownGeneration === this.#executionGeneration &&
			this.#previewShownAfter === this.#durableText
		);
	}

	/** A stopped turn keeps the preview text that was still on screen. */
	#freezeStoppedPreview(status: WorkerTerminalStatus): void {
		const generation = this.#executionGeneration;
		if (status !== 'cancelled' || generation === null || !this.#previewStillCurrent()) return;
		try {
			this.#port.freezeAssistantPreview?.({
				handle: this.#handle,
				executionGeneration: generation,
				text: this.#previewShown
			});
		} catch (error) {
			this.#reportError(error);
		}
	}

	#parseProjection(
		value: JsonObject,
		executionGeneration: number,
		projectionSequence: number
	): ParsedProjection {
		if (Object.keys(value).length === 0) {
			return { currentActivity: null, semanticEvents: [] };
		}
		if (value.version !== WORKER_UI_PROJECTION_VERSION) {
			this.#reportError(new Error('Worker UI projection version is unsupported'));
			return { currentActivity: null, semanticEvents: [] };
		}
		const currentActivity =
			typeof value.current_activity === 'string'
				? value.current_activity.slice(0, 1000)
				: null;
		if (
			!Array.isArray(value.semantic_events) ||
			value.semantic_events.length > MAX_PROJECTION_EVENTS
		) {
			this.#reportError(new Error('Worker UI projection events are invalid'));
			return { currentActivity, semanticEvents: [] };
		}

		const semanticEvents: AgentStreamEventV1[] = [];
		let previousSequence = 0;
		for (const item of value.semantic_events) {
			const event = parseProjectionEvent(item, this.#handle, executionGeneration);
			if (
				!event ||
				event.sequence_index <= previousSequence ||
				event.sequence_index > projectionSequence ||
				event.type === 'text' ||
				event.type === 'text_delta'
			) {
				this.#reportError(new Error('Worker UI projection event identity is invalid'));
				return { currentActivity, semanticEvents: [] };
			}
			previousSequence = event.sequence_index;
			semanticEvents.push(event);
		}
		return { currentActivity, semanticEvents };
	}

	#assertReceiptIdentity(receipt: AgenticChatWorkerReconciledReceipt): void {
		if (
			receipt.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
			receipt.execution_mode !== 'worker_realtime' ||
			receipt.turn_run_id !== this.#handle.turnRunId ||
			receipt.session_id !== this.#handle.sessionId ||
			receipt.stream_run_id !== this.#handle.streamRunId ||
			receipt.client_turn_id !== this.#handle.clientTurnId
		) {
			throw new Error('Worker reconciliation does not match its adopted handle');
		}
	}

	#reportError(error: unknown): void {
		try {
			this.#port.onError?.(error);
		} catch {
			// UI diagnostics cannot prevent authoritative text/terminal projection.
		}
	}
}

export function createAgentChatWorkerUiAdapter(input: {
	handle: WorkerTurnHandle;
	port: AgentChatWorkerUiAdapterPort;
	onTerminal(status: WorkerTerminalStatus): void;
	now?: () => number;
}): AgentChatWorkerUiAdapter {
	return new AgentChatWorkerUiAdapter(input);
}

function parseProjectionEvent(
	value: unknown,
	handle: WorkerTurnHandle,
	executionGeneration: number
): AgentStreamEventV1 | null {
	if (!isRecord(value)) return null;
	const sequence = nonnegativeInteger(value.sequence_index);
	if (
		value.contract_version !== AGENTIC_CHAT_WORKER_CONTRACT_VERSION ||
		value.turn_run_id !== handle.turnRunId ||
		value.session_id !== handle.sessionId ||
		value.stream_run_id !== handle.streamRunId ||
		value.client_turn_id !== handle.clientTurnId ||
		value.execution_generation !== executionGeneration ||
		sequence === null ||
		sequence < 1 ||
		value.event_id !==
			createAgentStreamEventIdV1(handle.turnRunId, executionGeneration, sequence) ||
		value.event_type !== value.type ||
		value.durable !== true ||
		!isPhase(value.phase)
	) {
		return null;
	}
	return value as AgentStreamEventV1;
}

function toAgentSSEMessage(event: AgentStreamEventV1): AgentSSEMessage | null {
	const common = {
		event_id: event.event_id,
		stream_run_id: event.stream_run_id,
		client_turn_id: event.client_turn_id,
		turn_run_id: event.turn_run_id,
		sequence_index: event.sequence_index,
		phase: event.phase,
		event_type: event.event_type,
		durable: event.durable
	};
	if (event.type === 'workflow_progress') {
		const workflow = readDurableChatWorkflowProgress(
			'workflow' in event ? event.workflow : undefined
		);
		return workflow ? { ...common, type: 'workflow_progress', workflow } : null;
	}
	if (event.type === 'text_delta') {
		const text = readTextDelta(event);
		return text
			? ({ ...event, ...common, type: 'text_delta', content: text } as AgentSSEMessage)
			: null;
	}
	if (event.type === 'done') {
		return {
			...event,
			...common,
			type: 'done',
			...doneOutcomeFields(
				readTerminalStatus(event),
				readNullableString(event, 'finished_reason')
			)
		} as AgentSSEMessage;
	}
	return { ...event, ...common } as AgentSSEMessage;
}

/**
 * How a worker terminal reads to the chat UI. A queued-turn timeout is stored
 * as `cancelled` (the atomic queued-cancel path), but the user never pressed
 * Stop: it renders as a failure with its own copy, not as "Stopped".
 */
function doneOutcomeFields(
	status: WorkerTerminalStatus,
	finishedReason: string | null
): { finished_reason: string; completion_status: 'completed' | 'failed' } {
	if (isWorkerQueueTimeout(status, finishedReason)) {
		return {
			finished_reason: WORKER_QUEUE_TIMEOUT_FINISHED_REASON,
			completion_status: 'failed'
		};
	}
	return {
		finished_reason:
			status === 'cancelled'
				? 'cancelled'
				: status === 'failed'
					? 'error'
					: (finishedReason ?? 'completed'),
		completion_status: status === 'failed' ? 'failed' : 'completed'
	};
}

function readTextDelta(value: Record<string, unknown>): string | null {
	if (typeof value.text_delta === 'string' && value.text_delta.length > 0)
		return value.text_delta;
	if (typeof value.content === 'string' && value.content.length > 0) return value.content;
	return null;
}

function readTerminalStatus(value: Record<string, unknown>): WorkerTerminalStatus {
	return value.status === 'failed' || value.status === 'cancelled' ? value.status : 'completed';
}

function readNullableString(value: Record<string, unknown>, key: string): string | null {
	return typeof value[key] === 'string' ? (value[key] as string) : null;
}

function eventMatchesHandle(event: AgentStreamEventV1, handle: WorkerTurnHandle): boolean {
	return (
		event.contract_version === AGENTIC_CHAT_WORKER_CONTRACT_VERSION &&
		event.turn_run_id === handle.turnRunId &&
		event.session_id === handle.sessionId &&
		event.stream_run_id === handle.streamRunId &&
		event.client_turn_id === handle.clientTurnId
	);
}

function isTerminalStatus(value: ChatTurnStatusV1): value is WorkerTerminalStatus {
	return value === 'completed' || value === 'failed' || value === 'cancelled';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonnegativeInteger(value: unknown): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

function isPhase(value: unknown): boolean {
	return (
		value === 'prompt' ||
		value === 'llm' ||
		value === 'tool' ||
		value === 'stream' ||
		value === 'finalize'
	);
}
