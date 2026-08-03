// apps/web/src/lib/components/agent/agent-chat-worker-ui-adapter.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	createAgentStreamEventIdV1,
	type AgenticChatReconcileAssistantMessageV1,
	type AgentSSEMessage,
	type AgentStreamEventV1,
	type ChatTurnStatusV1,
	type JsonObject,
	type TurnHandleV1
} from '@buildos/shared-types';
import type { AgenticChatWorkerApplicationObserver } from '$lib/services/agentic-chat-v2/worker-realtime-coordinator';
import type { AgenticChatWorkerReconciledReceipt } from '$lib/services/agentic-chat-v2/worker-realtime-inbox';

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
	#executionGeneration: number | null = null;
	#terminal = false;
	#terminalNotified = false;
	#appliedSemanticEventIds = new Set<string>();

	constructor(input: {
		handle: WorkerTurnHandle;
		port: AgentChatWorkerUiAdapterPort;
		onTerminal(status: WorkerTerminalStatus): void;
	}) {
		this.#handle = input.handle;
		this.#port = input.port;
		this.#onTerminal = input.onTerminal;
	}

	applyReconciliation(receipt: AgenticChatWorkerReconciledReceipt): void {
		if (this.#terminal) return;
		this.#assertReceiptIdentity(receipt);
		const generationChanged = this.#executionGeneration !== receipt.execution_generation;
		if (generationChanged) {
			this.#executionGeneration = receipt.execution_generation;
			this.#appliedSemanticEventIds = new Set();
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

		const projection = this.#parseProjection(
			receipt.projection,
			receipt.execution_generation,
			receipt.projection_durable_sequence
		);
		for (const event of projection.semanticEvents) this.#applySemanticEvent(event);
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
			currentActivity: projection.currentActivity ?? defaultActivityForStatus(receipt.status)
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
			this.#port.appendAssistantText({
				handle: this.#handle,
				executionGeneration: event.execution_generation,
				text
			});
			return;
		}
		if (event.type === 'text') {
			throw new Error('Worker transport cannot publish a non-snapshot text event');
		}

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

	#applySemanticEvent(event: AgentStreamEventV1): void {
		if (this.#appliedSemanticEventIds.has(event.event_id)) return;
		const normalized = toAgentSSEMessage(event);
		if (!normalized) throw new Error(`Unsupported worker UI event: ${event.type}`);
		this.#port.applySemanticEvent(normalized);
		this.#appliedSemanticEventIds.add(event.event_id);
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
				finished_reason:
					status === 'cancelled'
						? 'cancelled'
						: status === 'failed'
							? 'error'
							: (finishedReason ?? 'completed'),
				completion_status: status === 'failed' ? 'failed' : 'completed'
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
	if (event.type === 'text_delta') {
		const text = readTextDelta(event);
		return text
			? ({ ...event, ...common, type: 'text_delta', content: text } as AgentSSEMessage)
			: null;
	}
	if (event.type === 'done') {
		const status = readTerminalStatus(event);
		return {
			...event,
			...common,
			type: 'done',
			finished_reason:
				status === 'cancelled'
					? 'cancelled'
					: status === 'failed'
						? 'error'
						: (readNullableString(event, 'finished_reason') ?? 'completed'),
			completion_status: status === 'failed' ? 'failed' : 'completed'
		} as AgentSSEMessage;
	}
	return { ...event, ...common } as AgentSSEMessage;
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

function defaultActivityForStatus(status: ChatTurnStatusV1): string {
	if (status === 'queued') return 'BuildOS is waiting to start...';
	if (status === 'running') return 'BuildOS is working...';
	return '';
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
