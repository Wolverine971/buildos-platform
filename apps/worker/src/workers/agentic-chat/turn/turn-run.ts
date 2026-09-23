// apps/worker/src/workers/agentic-chat/turn/turn-run.ts
//
// One turn's run state: the UI projection, the terminal tool ledger, the
// read-planning context, and the `TurnRun` object the read and mutation
// runners share. Everything here is plain data and pure bookkeeping.
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

const UI_PROJECTION_VERSION = 'agentic_chat_ui_projection_v1';
export const MAX_UI_PROJECTION_EVENTS = 128;
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

export type ProjectionState = {
	currentActivity: string;
	semanticEvents: AgentStreamEventV1[];
	/** Tool adapters may run concurrently; projection persistence must remain one-at-a-time. */
	semanticPublishTail: Promise<void>;
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
};

export function emptyProjection(): ProjectionState {
	return {
		currentActivity: DEFAULT_RUNNING_ACTIVITY,
		semanticEvents: [],
		semanticPublishTail: Promise.resolve()
	};
}

export function toProjectionJson(projection: ProjectionState): JsonObject {
	return {
		version: UI_PROJECTION_VERSION,
		current_activity: projection.currentActivity,
		semantic_events: projection.semanticEvents.slice() as unknown as JsonObject[]
	};
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
