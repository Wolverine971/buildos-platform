// apps/worker/src/workers/agentic-chat/workflow/workflow-terminal.ts
import { createHash } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgenticChatWorkflowResultQualityV1,
	type AgenticChatWorkflowTerminalOutcomeV1,
	type JsonObject
} from '@buildos/shared-types';
import type { AgenticChatTerminalFinalizeInputV1 } from '../executionControl';
import {
	AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE,
	acceptedWorkflowReports,
	buildAgenticChatWorkflowProjectionV1,
	buildAgenticChatWorkflowStreamProjectionV1,
	renderModelFreeWorkflowAnswer,
	workflowCoverageGap,
	workflowProjectionInputFromRunV1
} from './workflow-projection';
import type { AgenticChatWorkflowFenceV1, AgenticChatWorkflowRunStateV1 } from './workflow-store';

/**
 * Slice C terminal truth for workflow turns. Every terminal write, whether from the
 * runner port or from stalled-worker recovery, is built here from durable run truth,
 * so a retried or recovered terminal write carries the same text and message id.
 *
 * Invariant: text that was ever durable (and therefore visible) is never replaced
 * or extended by regenerated prose. An accepted answer is used as-is; an unfinished
 * durable prefix is kept and labeled with a fixed notice; only when no answer byte
 * was ever durable may a deterministic model-free answer be written.
 */

export type AgenticChatWorkflowTerminalDecisionV1 =
	| {
			status: 'completed';
			quality: AgenticChatWorkflowResultQualityV1;
			assistantText: string;
			answerSource: 'accepted_answer' | 'durable_prefix' | 'model_free_reports';
			coverageGap: string | null;
	  }
	| { status: 'failed'; failureCode: string; message: string };

const FAILURE_MESSAGES: Readonly<Record<string, string>> = {
	deadline_expired:
		'The review ran out of time before any specialist finished. Nothing was changed.',
	budget_exhausted:
		'The review reached its safety limit before any specialist finished. Nothing was changed.',
	attempts_exhausted:
		'The review could not finish after its allowed attempts. Nothing was changed; please try again.',
	finalize_failed: 'The review stopped before any specialist finished. Nothing was changed.',
	access_revoked:
		'You no longer have access to this project, so the review stopped. Nothing was changed.',
	worker_interrupted:
		'The review was interrupted before any specialist finished. Nothing was changed; please try again.'
};

/**
 * Tasker 81 decision (a): a workflow that may not continue ends with the best answer
 * durable truth supports, without any model call. Revoked access never shows content.
 */
export function decideAgenticChatWorkflowTerminalFromDurableTruthV1(
	state: AgenticChatWorkflowRunStateV1,
	reason: string
): AgenticChatWorkflowTerminalDecisionV1 {
	const code = reason.replace(/^workflow_/, '');
	const failure = (): AgenticChatWorkflowTerminalDecisionV1 => ({
		status: 'failed',
		failureCode: `workflow_${code}`.slice(0, 128),
		message:
			FAILURE_MESSAGES[code] ??
			'The review stopped before any specialist finished. Nothing was changed.'
	});
	if (code === 'access_revoked') return failure();
	// The run cannot continue, so a specialist that never finished is missing coverage.
	const coverageGap = workflowCoverageGap(state, { terminal: true });
	if (state.answer.status === 'accepted') {
		return {
			status: 'completed',
			quality: state.answer.quality ?? 'partial',
			assistantText: state.answer.text,
			answerSource: 'accepted_answer',
			coverageGap
		};
	}
	if (state.answer.text.length > 0) {
		return {
			status: 'completed',
			quality: 'partial',
			assistantText: `${state.answer.text}${AGENTIC_CHAT_WORKFLOW_CUT_SHORT_NOTE}`,
			answerSource: 'durable_prefix',
			coverageGap
		};
	}
	if (acceptedWorkflowReports(state).length > 0) {
		return {
			status: 'completed',
			quality: 'partial',
			assistantText: renderModelFreeWorkflowAnswer(state, code),
			answerSource: 'model_free_reports',
			coverageGap
		};
	}
	return failure();
}

/** The terminal-writer fields for a durable-truth decision; shared by every writer. */
export type AgenticChatWorkflowTerminalFieldsV1 = {
	status: 'completed' | 'failed';
	failureCode: string | null;
	assistantText: string;
	terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1;
	coverageGap: string | null;
	activity: string;
	metadata?: JsonObject;
};

export function agenticChatWorkflowTerminalFieldsV1(
	decision: AgenticChatWorkflowTerminalDecisionV1
): AgenticChatWorkflowTerminalFieldsV1 {
	if (decision.status === 'failed') {
		return {
			status: 'failed',
			failureCode: decision.failureCode,
			assistantText: '',
			terminalOutcome: 'failed',
			coverageGap: decision.message,
			activity: decision.message
		};
	}
	return {
		status: 'completed',
		failureCode: null,
		assistantText: decision.assistantText,
		terminalOutcome:
			decision.answerSource === 'accepted_answer' && decision.quality === 'complete'
				? 'complete'
				: 'partial',
		coverageGap: decision.coverageGap,
		activity: '',
		metadata: {
			workflow_quality: decision.quality,
			workflow_answer_source: decision.answerSource
		}
	};
}

/**
 * Stalled-worker recovery for a workflow that may not retry (deadline, budget, attempts,
 * access, or a non-retryable class). It writes the same durable-truth decision the
 * in-process terminal path writes, with no model call: bounded and deterministic.
 * Missing durable truth (`state === null`) can only fail, and never shows content.
 */
export function buildAgenticChatWorkflowStalledTerminalInputV1(input: {
	fence: AgenticChatWorkflowFenceV1;
	userId: string;
	state: AgenticChatWorkflowRunStateV1 | null;
	reason: string;
	observedAt: string;
}): {
	decision: AgenticChatWorkflowTerminalDecisionV1;
	request: AgenticChatTerminalFinalizeInputV1;
} {
	const code = input.reason.replace(/^workflow_/, '');
	const decision: AgenticChatWorkflowTerminalDecisionV1 = input.state
		? decideAgenticChatWorkflowTerminalFromDurableTruthV1(input.state, code)
		: {
				status: 'failed',
				failureCode: `workflow_${code}`.slice(0, 128),
				message:
					FAILURE_MESSAGES[code] ??
					'The review stopped before any specialist finished. Nothing was changed.'
			};
	const fields = agenticChatWorkflowTerminalFieldsV1(decision);
	const request = buildAgenticChatWorkflowTerminalInputV1({
		fence: input.fence,
		userId: input.userId,
		...fields,
		state: input.state,
		observedAt: input.observedAt,
		finishedReason: fields.status === 'failed' ? 'worker_interrupted' : undefined,
		recoveredFromStall: true
	});
	return { decision, request };
}

/** The user-facing line for a stopped review, from the live worker or from recovery. */
export const AGENTIC_CHAT_WORKFLOW_STOPPED_MESSAGE = 'Review stopped. Nothing was changed.';

/**
 * Stalled-worker recovery of a durable Stop: exactly the in-process cancel. The durable
 * answer prefix stays the visible partial message, with no notice and nothing regenerated.
 */
export function buildAgenticChatWorkflowStalledCancelInputV1(input: {
	fence: AgenticChatWorkflowFenceV1;
	userId: string;
	state: AgenticChatWorkflowRunStateV1 | null;
	observedAt: string;
}): AgenticChatTerminalFinalizeInputV1 {
	return buildAgenticChatWorkflowTerminalInputV1({
		fence: input.fence,
		userId: input.userId,
		status: 'cancelled',
		failureCode: 'cancelled',
		assistantText: input.state?.answer.text ?? '',
		state: input.state,
		terminalOutcome: 'cancelled',
		coverageGap: AGENTIC_CHAT_WORKFLOW_STOPPED_MESSAGE,
		activity: AGENTIC_CHAT_WORKFLOW_STOPPED_MESSAGE,
		observedAt: input.observedAt,
		recoveredFromStall: true
	});
}

/** One stable assistant message per turn generation, so a retried finalize is idempotent. */
export function stableAgenticChatWorkflowAnswerMessageIdV1(
	turnRunId: string,
	executionGeneration: number
): string {
	const bytes = createHash('sha256')
		.update(`agentic-chat-workflow-answer-v1:${turnRunId}:${executionGeneration}`, 'utf8')
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The finished projection for a terminal write, from the latest durable run truth. */
export function buildAgenticChatWorkflowFinishedProjectionV1(input: {
	state: AgenticChatWorkflowRunStateV1 | null;
	terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1;
	coverageGap: string | null;
	observedAt: string;
}) {
	return input.state
		? buildAgenticChatWorkflowProjectionV1(
				workflowProjectionInputFromRunV1(input.state, {
					phase: 'finished',
					providerActivity: 'idle',
					observedAt: input.observedAt,
					terminalOutcome: input.terminalOutcome,
					coverageGap: input.coverageGap
				})
			)
		: buildAgenticChatWorkflowProjectionV1({
				phase: 'finished',
				terminalOutcome: input.terminalOutcome,
				coverageGap: input.coverageGap
			});
}

/** The single terminal-writer input for a workflow turn (Tasker 87 slice C). */
export function buildAgenticChatWorkflowTerminalInputV1(input: {
	fence: AgenticChatWorkflowFenceV1;
	userId: string;
	status: 'completed' | 'failed' | 'cancelled';
	failureCode: string | null;
	assistantText: string;
	state: AgenticChatWorkflowRunStateV1 | null;
	terminalOutcome: AgenticChatWorkflowTerminalOutcomeV1;
	coverageGap: string | null;
	activity: string;
	observedAt: string;
	metadata?: JsonObject;
	/** Overrides the default finished reason (stalled recovery records `worker_interrupted`). */
	finishedReason?: string;
	/** Marks a terminal write made by stalled-worker recovery, not by the running worker. */
	recoveredFromStall?: boolean;
}): AgenticChatTerminalFinalizeInputV1 {
	const finishedReason =
		input.finishedReason ??
		(input.status === 'completed'
			? 'stop'
			: input.status === 'cancelled'
				? 'cancelled'
				: 'error');
	const stall = input.recoveredFromStall ? { recovered_from_stall: true } : {};
	const failureCode =
		input.status === 'completed'
			? null
			: input.status === 'cancelled'
				? 'cancelled'
				: (input.failureCode ?? 'workflow_internal_error');
	const persistsMessage =
		input.status === 'completed' ||
		(input.status === 'cancelled' && input.assistantText.length > 0);
	const workflow = buildAgenticChatWorkflowFinishedProjectionV1({
		state: input.state,
		terminalOutcome: input.terminalOutcome,
		coverageGap: input.coverageGap,
		observedAt: input.observedAt
	});
	return {
		turnRunId: input.fence.turnRunId,
		queueJobId: input.fence.queueJobId,
		processingToken: input.fence.processingToken,
		userId: input.userId,
		executionGeneration: input.fence.executionGeneration,
		status: input.status,
		finishedReason,
		failureCode,
		assistantMessageId: persistsMessage
			? stableAgenticChatWorkflowAnswerMessageIdV1(
					input.fence.turnRunId,
					input.fence.executionGeneration
				)
			: null,
		assistantText: persistsMessage ? input.assistantText : '',
		assistantMetadata: {
			transport_contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			turn_run_id: input.fence.turnRunId,
			execution_generation: input.fence.executionGeneration,
			worker_runtime: 'agentic_chat_v1',
			tool_round_count: 0,
			tool_call_count: 0,
			chat_workflow_v1: workflow as unknown as JsonObject,
			...(input.metadata ?? {}),
			...stall
		},
		promptTokens: null,
		completionTokens: null,
		totalTokens: null,
		projection: buildAgenticChatWorkflowStreamProjectionV1(workflow, input.activity),
		eventPayload: {
			type: 'done',
			workflow: workflow as unknown as JsonObject,
			status: input.status,
			finished_reason: finishedReason,
			failure_code: failureCode,
			usage: input.status === 'failed' ? { total_tokens: 0 } : null,
			...stall
		}
	};
}
