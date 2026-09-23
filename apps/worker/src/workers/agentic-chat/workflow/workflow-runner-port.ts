// apps/worker/src/workers/agentic-chat/workflow/workflow-runner-port.ts
import type {
	AgenticChatPreparedWorkflowContextV1,
	AgenticChatRawWorkflowInputV4,
	AgenticChatTurnClaimResultV1,
	JsonObject
} from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from '../turn/execution-control';
import type { AgenticChatWorkerTimingBaselineV1 } from '../turn/execution-input';
import type { AgenticChatTurnExecutionResultV1 } from '../turn/turn-executor';
import type { AgenticChatWorkflowDurableRunV1 } from './preparation-store';
import type { AgenticChatWorkflowModelInputV1 } from './prepared-context';

/**
 * The Tasker 86 → 87 handoff. Preparation hands a claimed v4 turn to the
 * workflow runner only after its prepared context is durably accepted (or
 * reused from durable truth) and current project access was rechecked.
 *
 * Invariants the runner can rely on:
 * - `context` is the accepted, immutable checkpoint for `request.requestHash`.
 *   Never re-gather or overwrite it; recovery reuses it.
 * - `modelInput` is built only from `context` plus the frozen admission history.
 * - The stream publisher turn is registered for this generation and drained.
 *   The preparer unregisters it after `run` returns, so the runner must drain
 *   its own publications (`flushTurn`) before returning.
 * - When `stream.resumeRequired` is true this generation has made no workflow
 *   write yet; the runner's first fenced write must be
 *   `resume_agentic_chat_workflow_projection_v1` with durable step truth.
 * - No provider has been called and no dispatch permit exists. Model work still
 *   requires Tasker 87's durable reservation and begin permit.
 */
export type AgenticChatWorkflowPreparedTurnV1 = {
	version: 'agentic_chat_workflow_prepared_turn_v1';
	envelope: AgenticChatExecutionIdentityV1;
	claim: Extract<AgenticChatTurnClaimResultV1, { outcome: 'claimed' | 'matching_current_claim' }>;
	command: {
		streamRunId: string;
		clientTurnId: string;
		requestPayload: JsonObject;
		timingBaseline: AgenticChatWorkerTimingBaselineV1;
	};
	/** The validated immutable v4 request, including its frozen history. */
	request: AgenticChatRawWorkflowInputV4;
	context: AgenticChatPreparedWorkflowContextV1;
	contextSource: 'accepted_now' | 'reused_durable';
	/**
	 * Durable run truth at handoff. A resume must publish a projection whose
	 * `workflow.phase` equals `durableRun.phase`, or the database refuses it.
	 */
	durableRun: Pick<
		AgenticChatWorkflowDurableRunV1,
		'phase' | 'recoveryCount' | 'contextAcceptedGeneration' | 'deadlineAt'
	>;
	modelInput: AgenticChatWorkflowModelInputV1;
	deadlines: {
		/** Persisted whole-run deadline (900 s from the first claim), when known. */
		workflowDeadlineAt: string | null;
		/** Worker-invocation bound; physical requests must end 5 s before it. */
		invocationDeadlineAtMs: number;
	};
	stream: {
		resumeRequired: boolean;
		/** The publisher's durable sequence for this generation at handoff. */
		durableSequence: number;
	};
	timing: AgenticChatWorkflowPreparationTimingV1;
};

export type AgenticChatWorkflowRunnerOutcomeV1 =
	/** No runner is enabled: the preparer finalizes a durable, readable failure. */
	| { kind: 'unavailable'; reason: string }
	/** The runner owned execution and terminal truth for this invocation. */
	| { kind: 'handled'; result: AgenticChatTurnExecutionResultV1 };

export type AgenticChatWorkflowRunnerPortV1 = {
	run(input: {
		prepared: AgenticChatWorkflowPreparedTurnV1;
		signal: AbortSignal;
	}): Promise<AgenticChatWorkflowRunnerOutcomeV1>;
};

/** Production default until Tasker 87 supplies durable dispatch: never calls a model. */
export const unavailableAgenticChatWorkflowRunner: AgenticChatWorkflowRunnerPortV1 = {
	run: () =>
		Promise.resolve({
			kind: 'unavailable',
			reason: 'workflow_model_execution_not_enabled'
		})
};

/** One structured, privacy-safe line per preparation; identifiers, counts, and durations only. */
export type AgenticChatWorkflowPreparationTimingV1 = {
	event: 'agentic_chat_workflow_preparation_timing';
	turnRunId: string;
	executionGeneration: number;
	outcome:
		| 'provider_ready'
		| 'failed'
		| 'cancelled'
		| 'requeued'
		| 'stale'
		| 'terminal_reconciled'
		| 'recovery_required';
	failureCode: string | null;
	contextSource: 'fresh_load' | 'reused_durable' | null;
	/** Database clock: admission commit to this generation's claim. */
	admittedAt: string | null;
	workerStartedAt: string | null;
	admissionToClaimMs: number | null;
	/** Worker wall clock minus database admission time; cross-clock, so approximate. */
	admissionToPreparationStartMs: number | null;
	admissionToProviderReadyMs: number | null;
	/** Monotonic durations inside this invocation. */
	inputLoadMs: number | null;
	progressPublishMs: number | null;
	accessCheckMs: number | null;
	contextLoadMs: number | null;
	/** Present only when a published specialist requested Jev-selected evidence. */
	contextFinderMs?: number | null;
	contextFinderStatus?: 'selected' | 'empty' | 'unavailable';
	checkpointMs: number | null;
	preparationMs: number;
	checkpointOutcome: string | null;
	checkpointReplayed: boolean;
	contextBytes: number | null;
	evidenceCount: number | null;
	omittedRecords: number | null;
	truncatedStrings: number | null;
	/** Database round trips this invocation spent before provider readiness. */
	dbRoundTrips: number;
};
