// apps/worker/src/workers/agentic-chat/turn/turn-run.ts
//
// One turn's run state: the UI projection, the terminal tool ledger, the
// read-planning context, and the `TurnRun` object the read and mutation
// runners share. Everything here is plain data and pure bookkeeping.
//
// The UI projection is what a reconnecting browser replays mid-turn. It holds
// compact copies of the durable events, bounded by count and by bytes (audit
// S7/B4): bulky tool output is trimmed to a summary in the projection only.
import type {
	AgentStreamEventV1,
	ChatToolCall,
	ChatToolResult,
	ContextShiftPayload,
	JsonObject
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import type { AgenticChatWorkerExecutionInputV1 } from './execution-input';
import type { AgenticChatTurnProviderStepV1 } from './executor-contracts';
import type { AgenticChatTurnLeaseHandleV1 } from './turn-lease';
import {
	AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES,
	agenticChatProjectionEntryBudgetV1,
	estimateStreamJsonBytes,
	fitAgenticChatStreamPayloadV1
} from '../stream/stream-payload-budget';

/**
 * Browsers parse exactly this version (agent-chat-worker-ui-adapter.ts) and
 * ignore unknown top-level keys, so the omission markers below are additive.
 */
const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';
/** The browser rejects a projection with more events than this. */
export const MAX_UI_PROJECTION_EVENTS = 128;
/** Fixed keys around `semantic_events`: version, activity, omission markers. */
const UI_PROJECTION_OVERHEAD_BYTES = 1_200;
/**
 * User-visible status while the worker waits. Calm, plain, and true for the
 * moment it is shown: the prepared context is already loaded when the turn is
 * acknowledged, so the wait from there is the model thinking, not "preparing
 * context". No infrastructure words (worker, queue, turn).
 */
export const DEFAULT_RUNNING_ACTIVITY = 'Thinking…';
export const ACKNOWLEDGED_ACTIVITY = 'Thinking…';
export const FINALIZING_ACTIVITY = 'Wrapping up…';
export const READ_TOOL_ACTIVITY = 'Looking things up…';
export const MUTATING_TOOL_ACTIVITY = 'Making changes…';

/**
 * The turn's UI projection: what a reconnecting browser replays. Entries are
 * compact copies of the durable events (bulky tool output trimmed to a summary;
 * the full result stays in the event row and the tool-execution ledger), the
 * newest last, bounded by count and by estimated bytes.
 */
export type ProjectionState = {
	currentActivity: string;
	semanticEvents: AgentStreamEventV1[];
	/** Estimated stored bytes of each entry, parallel to `semanticEvents`. */
	semanticEventBytes: number[];
	/** Sum of `semanticEventBytes`. */
	semanticBytes: number;
	/** Oldest entries dropped to stay inside the bounds, and the newest of their sequences. */
	omittedEventCount: number;
	omittedThroughSequence: number;
	/** The transition whose event last set `currentActivity` (for rollback). */
	activityTransitionId: string | null;
	/**
	 * Admission order into the publisher's per-turn FIFO, not durability: the
	 * next publication enqueues once the previous one holds its place and the
	 * publisher is below its soft limit. Concurrent tool calls therefore
	 * enqueue (and their reads start) without waiting for earlier writes to
	 * commit, while sequences and projection order still follow call order.
	 */
	semanticAdmissionTail: Promise<void>;
};

/**
 * Known permanent mutation failures already fed back this turn. Production turn
 * 0fa59a3e re-called delegate_task six times in 55 s against a backend contract
 * error because nothing structural stopped the model; a further call that
 * cannot succeed is now rejected before the adapter runs.
 */
export type PermanentMutationFailureLedger = {
	/** Tool-level failures (backend contract mismatch): every later call of the tool is capped. */
	byTool: Map<string, string>;
	/** Exact (tool, arguments) calls that failed permanently: an identical retry is capped. */
	byCall: Map<string, string>;
};

export type KnownMutationFailure = {
	effectId: string | null;
	message: string;
	observationErrorCode: 'known_mutation_failure' | 'mutation_retry_capped';
	/** True when the adapter's failure applies to every call of the tool, not just these arguments. */
	toolLevel: boolean;
	/** Nothing was written and the identical call may succeed later, so it is not capped. */
	retryable?: boolean;
};

export type TerminalContextState = {
	contextShift: ContextShiftPayload | null;
	toolExecutions: Array<{ toolCall: ChatToolCall; result: ChatToolResult }>;
	nextToolSequenceIndex: number;
	toolExecutionSequenceByCallId: Map<string, number>;
	/** Provider rounds that completed at least one tool execution. */
	toolRoundCount: number;
	permanentMutationFailures: PermanentMutationFailureLedger;
};

export type AgenticChatExecutableToolStepV1 = Extract<
	AgenticChatTurnProviderStepV1,
	{ type: 'read_tool' | 'mutating_tool' }
>;

export type AgenticChatPendingToolExecutionV1 = {
	step: AgenticChatExecutableToolStepV1;
	sequenceIndex: number;
};

export type AgenticChatReadInvalidationEpochStateV1 = { value: number };

export type AgenticChatReadPlanningContextV1 = {
	toolBatchIndex: number;
	graphPlanSha256: string | null;
	graphLayerIndex: number;
	graphLayerWidth: number;
	readEpoch: number;
};

/**
 * Per-turn state the read and mutation runners share, built once the provider
 * loop starts. Every field is the executor's own reference, so a runner's
 * ledger entries, read-epoch advances, and projection updates are the turn's.
 */
export type TurnRun = {
	/** Receives the execution-boundary diagnostics. */
	job: Pick<ProcessingJob, 'log'>;
	executionInput: AgenticChatWorkerExecutionInputV1;
	processingToken: string;
	projection: ProjectionState;
	terminalContext: TerminalContextState;
	/** Advanced once each committed mutation receipt is durable. */
	readInvalidationEpoch: AgenticChatReadInvalidationEpochStateV1;
	/** Counts the current provider round as a tool round on its first execution. */
	markToolExecution: () => void;
	/** Checked synchronously right before an external write may start. */
	lease: Pick<AgenticChatTurnLeaseHandleV1, 'isFresh'>;
};

export function emptyProjection(): ProjectionState {
	return {
		currentActivity: DEFAULT_RUNNING_ACTIVITY,
		semanticEvents: [],
		semanticEventBytes: [],
		semanticBytes: 0,
		omittedEventCount: 0,
		omittedThroughSequence: 0,
		activityTransitionId: null,
		semanticAdmissionTail: Promise.resolve()
	};
}

/**
 * Snapshot for persistence. Entries are shared with the live state (a shallow
 * copy of the list), so pending snapshots cost references, not bytes.
 */
export function toProjectionJson(projection: ProjectionState): JsonObject {
	return {
		version: UI_PROJECTION_VERSION,
		current_activity: projection.currentActivity,
		semantic_events: projection.semanticEvents.slice() as unknown as JsonObject[],
		...(projection.omittedEventCount > 0
			? {
					omitted_event_count: projection.omittedEventCount,
					omitted_through_sequence: projection.omittedThroughSequence
				}
			: {})
	};
}

/** Estimated stored bytes of `toProjectionJson(projection)`. */
export function projectionEstimatedBytes(projection: ProjectionState): number {
	return (
		UI_PROJECTION_OVERHEAD_BYTES +
		estimateStreamJsonBytes(projection.currentActivity) +
		projection.semanticBytes
	);
}

/**
 * The compact projection copy of one durable event: same identity fields, its
 * payload fitted to the per-entry budget for its type.
 */
export function projectionEntryForEvent(event: AgentStreamEventV1): {
	entry: AgentStreamEventV1;
	bytes: number;
} {
	const {
		contract_version,
		event_id,
		stream_run_id,
		client_turn_id,
		session_id,
		turn_run_id,
		execution_generation,
		sequence_index,
		phase,
		event_type,
		durable,
		...payload
	} = event;
	const envelope = {
		contract_version,
		event_id,
		stream_run_id,
		client_turn_id,
		session_id,
		turn_run_id,
		execution_generation,
		sequence_index,
		phase,
		event_type,
		durable
	};
	const fitted = fitAgenticChatStreamPayloadV1(
		payload as JsonObject,
		agenticChatProjectionEntryBudgetV1(event_type, payload as JsonObject)
	);
	const entry = (
		fitted.compacted ? { ...fitted.value, ...envelope } : event
	) as AgentStreamEventV1;
	return { entry, bytes: estimateStreamJsonBytes(entry) };
}

/**
 * Appends one event's compact entry, then drops the oldest entries until the
 * projection is inside both bounds. The newest entry always stays.
 */
export function appendProjectionEvent(
	projection: ProjectionState,
	event: AgentStreamEventV1,
	currentActivity: string,
	transitionId: string
): void {
	const { entry, bytes } = projectionEntryForEvent(event);
	projection.semanticEvents.push(entry);
	projection.semanticEventBytes.push(bytes);
	projection.semanticBytes += bytes;
	projection.currentActivity = currentActivity;
	projection.activityTransitionId = transitionId;
	while (
		projection.semanticEvents.length > 1 &&
		(projection.semanticEvents.length > MAX_UI_PROJECTION_EVENTS ||
			projectionEstimatedBytes(projection) > AGENTIC_CHAT_UI_PROJECTION_BUDGET_BYTES)
	) {
		const dropped = projection.semanticEvents.shift()!;
		projection.semanticBytes -= projection.semanticEventBytes.shift() ?? 0;
		projection.omittedEventCount += 1;
		projection.omittedThroughSequence = Math.max(
			projection.omittedThroughSequence,
			dropped.sequence_index
		);
	}
}

/**
 * Removes an event that never became durable. Entries it displaced stay
 * omitted: the projection is a bounded replay window, and nothing after a
 * failed write is persisted except the terminal projection.
 */
export function removeProjectionEvent(
	projection: ProjectionState,
	eventId: string,
	transitionId: string,
	priorActivity: string
): void {
	const index = projection.semanticEvents.findIndex((entry) => entry.event_id === eventId);
	if (index !== -1) {
		projection.semanticEvents.splice(index, 1);
		projection.semanticBytes -= projection.semanticEventBytes.splice(index, 1)[0] ?? 0;
	}
	if (projection.activityTransitionId === transitionId) {
		projection.currentActivity = priorActivity;
		projection.activityTransitionId = null;
	}
}

export function providerToolCall(
	step: Extract<AgenticChatTurnProviderStepV1, { type: 'read_tool' | 'mutating_tool' }>
): ChatToolCall {
	return {
		id: step.providerToolCallId,
		type: 'function',
		function: {
			name: step.toolName,
			arguments: JSON.stringify(step.arguments)
		}
	};
}

export function standaloneReadPlanningContext(
	toolBatchIndex: number,
	readEpoch: number
): AgenticChatReadPlanningContextV1 {
	return {
		toolBatchIndex,
		graphPlanSha256: null,
		graphLayerIndex: 0,
		graphLayerWidth: 1,
		readEpoch
	};
}

export function reserveToolSequenceIndex(
	terminalContext: TerminalContextState,
	step: AgenticChatExecutableToolStepV1
): number {
	if (terminalContext.toolExecutionSequenceByCallId.has(step.providerToolCallId)) {
		throw new Error(`Duplicate provider tool-call id ${step.providerToolCallId}`);
	}
	const sequenceIndex = terminalContext.nextToolSequenceIndex;
	terminalContext.nextToolSequenceIndex += 1;
	terminalContext.toolExecutionSequenceByCallId.set(step.providerToolCallId, sequenceIndex);
	return sequenceIndex;
}

export function recordTerminalToolExecution(
	terminalContext: TerminalContextState,
	sequenceIndex: number,
	toolCall: ChatToolCall,
	result: ChatToolResult
): void {
	const insertionIndex = terminalContext.toolExecutions.findIndex((entry) => {
		const existingSequence = terminalContext.toolExecutionSequenceByCallId.get(
			entry.toolCall.id
		);
		return existingSequence !== undefined && existingSequence > sequenceIndex;
	});
	const value = { toolCall, result };
	if (insertionIndex === -1) terminalContext.toolExecutions.push(value);
	else terminalContext.toolExecutions.splice(insertionIndex, 0, value);
}
