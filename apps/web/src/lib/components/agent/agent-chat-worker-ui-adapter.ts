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
import type { AgenticChatWorkerApplicationObserver } from '$lib/services/agentic-chat-v2/worker-realtime-coordinator';
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
	WORKER_QUEUE_TIMEOUT_FINISHED_REASON,
	workerActivityForStatus
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
	#previewTimer: ReturnType<typeof setTimeout> | null = null;

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
		const durableTextBefore = generationChanged ? '' : this.#durableText;
		if (generationChanged) {
			this.#executionGeneration = receipt.execution_generation;
			this.#appliedSemanticEventIds = new Set();
			this.#preview = createLiveTextPreviewState();
			this.#port.beginGeneration({
				handle: this.#handle,
				executionGeneration: receipt.execution_generation,
				status: receipt.status
			});
		}

		// The complete text snapshot is authoritative. It must land before any
		// semantic projection or post-projection durable events are applied.
		this.#port.replaceAssistantSnapshot({
			handle: this.#handle,
			executionGeneration: receipt.execution_generation,
			text: receipt.text,
			assistantMessage: receipt.assistant_message,
			status: receipt.status
		});
		this.#durableText = receipt.text;
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
		this.#syncPreview();

		const projection = this.#parseProjection(
			receipt.projection,
			receipt.execution_generation,
			receipt.projection_durable_sequence
		);
		for (const event of projection.semanticEvents) this.#applySemanticEvent(event);
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

		this.#port.updateTurnState({
			handle: this.#handle,
			status: receipt.status,
			// Nothing runs while queued, so any projected activity is a previous
			// attempt's. The wait itself is the status: calm first, then named once
			// it runs long (the watchdog re-reconciles a queued turn every ~5s). A
			// queued snapshot's updated_at is when it entered the queue, so a reload
			// shows the same text.
			currentActivity:
				receipt.status === 'queued'
					? workerActivityForStatus('queued', {
							queuedSince: receipt.updated_at,
							now: this.#now()
						})
					: (projection.currentActivity ?? workerActivityForStatus(receipt.status))
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

	/** Push the preview suffix when it changes; a caught-up or diverged settle ends it. */
	#syncPreview(): void {
		this.#preview = expireLiveTextPreview(this.#preview, this.#now());
		const suffix = this.#terminal
			? ''
			: liveTextPreviewSuffix(this.#preview, this.#durableText);
		if (!suffix) this.#preview = clearLiveTextPreview(this.#preview);
		this.#schedulePreviewExpiry();
		if (suffix === this.#previewShown || this.#executionGeneration === null) return;
		this.#previewShown = suffix;
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
		return { finished_reason: WORKER_QUEUE_TIMEOUT_FINISHED_REASON, completion_status: 'failed' };
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
