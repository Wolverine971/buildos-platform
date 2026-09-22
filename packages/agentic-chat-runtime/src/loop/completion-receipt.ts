// packages/agentic-chat-runtime/src/loop/completion-receipt.ts
import type { FastToolExecution } from './shared';
import { isWriteLedgerToolExecution, didGatewayExecSucceed } from './tool-classification';
import {
	type TurnContract,
	type TurnContractOutcomeResult,
	type TurnContractResolution,
	resolveTurnContractOutcome
} from './turn-contract';

/**
 * Tasker 92 slice C. A reviewer's approval of one mutation batch proves that
 * stage was commissioned; it never proves the whole request landed. The
 * 2026-09-21 gate's task batch created five tasks under one approval and
 * linked three dependencies under another; an earlier run lost the second
 * stage after provider failures with nothing recording which stage was owed.
 *
 * This receipt persists that distinction, computed only from the durable
 * tool-execution ledger, never from model text:
 *
 * - each `stage` is one reviewer-approved batch, bound to the exact batch
 *   SHA-256 the reviewer echoed, with the write executions that ran under it;
 * - `request` is the host's verdict on the entire request, taken from the
 *   reviewed contract resolution. Without a reviewed contract there is no
 *   request-level expectation to verify, so the verdict is `request_unverified`,
 *   never fulfilled. A post-start partial failure or an uncertain commit can
 *   never become fulfilled either.
 *
 * Only `request_fulfilled` may ever justify a host-rendered final change summary
 * that skips the closing model call. Nothing consumes the receipt that way yet;
 * it is evidence for inspectors and the precondition for that later change.
 */
export const AGENTIC_CHAT_COMPLETION_RECEIPT_VERSION = 1 as const;

export const APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME_V1 = 'approve_mutation_batch_review';

export type AgenticChatCompletionStageDispositionV1 =
	| 'stage_approved'
	| 'stage_partial'
	| 'stage_failed';

export type AgenticChatCompletionRequestDispositionV1 =
	| 'request_fulfilled'
	| 'request_partial'
	| 'request_uncertain'
	| 'request_unverified';

export type AgenticChatCompletionStageV1 = {
	/** Digest the reviewer echoed; the harness only executes that exact batch. */
	batchSha256: string;
	/** Provider tool-call id of the approval execution. */
	approvalCallId: string;
	/** Provider tool-call ids of write executions that succeeded under this approval. */
	executedCallIds: string[];
	/** Provider tool-call ids of write executions that failed under this approval. */
	failedCallIds: string[];
	disposition: AgenticChatCompletionStageDispositionV1;
};

export type AgenticChatCompletionReceiptV1 = {
	version: typeof AGENTIC_CHAT_COMPLETION_RECEIPT_VERSION;
	/** SHA-256 of the reviewed contract bytes, when a contract governed the turn. */
	contractSha256: string | null;
	expectation: 'turn_contract' | 'none';
	stages: AgenticChatCompletionStageV1[];
	/** Successful writes that ran outside any approved stage (simple direct writes). */
	unreviewedWriteCallIds: string[];
	failedUnreviewedWriteCallIds: string[];
	request: {
		disposition: AgenticChatCompletionRequestDispositionV1;
		outcomeStatus: TurnContractResolution['status'];
		outcomes: TurnContractOutcomeResult[];
		/** Why the request is not fulfilled, when it is not. Stable, code-owned reasons. */
		reasons: string[];
	};
};

export type AgenticChatCompletionReceiptInputV1 = {
	contract: TurnContract | null;
	/** Digest of `contract`; the host computes it so the runtime stays digest-agnostic. */
	contractSha256: string | null;
	toolExecutions: readonly FastToolExecution[] | null | undefined;
	finishedReason: string | null;
	/**
	 * Recovery class of a post-start failure the turn survived after a durable
	 * write, when finalizing as a partial completion. Any value blocks fulfilment.
	 */
	partialFailureClass?: string | null;
};

export function buildAgenticChatCompletionReceiptV1(
	input: AgenticChatCompletionReceiptInputV1
): AgenticChatCompletionReceiptV1 {
	const executions = [...(input.toolExecutions ?? [])];
	const stages: AgenticChatCompletionStageV1[] = [];
	const unreviewedWriteCallIds: string[] = [];
	const failedUnreviewedWriteCallIds: string[] = [];
	let open: AgenticChatCompletionStageV1 | null = null;

	for (const execution of executions) {
		const approval = readBatchApproval(execution);
		if (approval) {
			if (open) stages.push(finishStage(open));
			open = {
				batchSha256: approval,
				approvalCallId: execution.toolCall.id,
				executedCallIds: [],
				failedCallIds: [],
				disposition: 'stage_failed'
			};
			continue;
		}
		if (!isWriteLedgerToolExecution(execution)) continue;
		const succeeded = didGatewayExecSucceed(execution);
		if (open) {
			(succeeded ? open.executedCallIds : open.failedCallIds).push(execution.toolCall.id);
		} else {
			(succeeded ? unreviewedWriteCallIds : failedUnreviewedWriteCallIds).push(
				execution.toolCall.id
			);
		}
	}
	if (open) stages.push(finishStage(open));

	const resolution = resolveTurnContractOutcome({
		contract: input.contract,
		toolExecutions: executions,
		finishedReason: input.finishedReason
	});
	const reasons: string[] = [];
	let disposition: AgenticChatCompletionRequestDispositionV1;
	const partialFailureClass = input.partialFailureClass ?? null;
	if (partialFailureClass === 'uncertain_external_commit') {
		disposition = 'request_uncertain';
		reasons.push('uncertain_external_commit');
	} else if (!input.contract) {
		disposition = 'request_unverified';
		reasons.push('no_reviewed_contract');
		if (partialFailureClass) reasons.push(`partial_failure:${partialFailureClass}`);
	} else if (partialFailureClass) {
		disposition = 'request_partial';
		reasons.push(`partial_failure:${partialFailureClass}`);
		if (!resolution.fulfilled) reasons.push(`outcome_${resolution.status}`);
	} else if (resolution.fulfilled) {
		disposition = 'request_fulfilled';
	} else {
		disposition = 'request_partial';
		reasons.push(`outcome_${resolution.status}`);
	}
	for (const outcome of resolution.outcomes) {
		if (outcome.fulfilled) continue;
		if (outcome.missingTargetIds.length > 0) reasons.push(`missing_targets:${outcome.id}`);
		if (outcome.missingRequiredFields.length > 0) {
			reasons.push(`missing_required_fields:${outcome.id}`);
		}
		if (outcome.unboundParentLabel) reasons.push(`unbound_parent_label:${outcome.id}`);
		if (
			outcome.missingTargetIds.length === 0 &&
			outcome.missingRequiredFields.length === 0 &&
			!outcome.unboundParentLabel
		) {
			reasons.push(`insufficient_effects:${outcome.id}`);
		}
	}

	return {
		version: AGENTIC_CHAT_COMPLETION_RECEIPT_VERSION,
		contractSha256: input.contract ? input.contractSha256 : null,
		expectation: input.contract ? 'turn_contract' : 'none',
		stages,
		unreviewedWriteCallIds,
		failedUnreviewedWriteCallIds,
		request: {
			disposition,
			outcomeStatus: resolution.status,
			outcomes: resolution.outcomes,
			reasons: [...new Set(reasons)]
		}
	};
}

/** True only for the one disposition that could ever replace a closing model call. */
export function isAgenticChatRequestFulfilledV1(
	receipt: AgenticChatCompletionReceiptV1 | null | undefined
): boolean {
	return (
		receipt?.version === AGENTIC_CHAT_COMPLETION_RECEIPT_VERSION &&
		receipt.expectation === 'turn_contract' &&
		receipt.request.disposition === 'request_fulfilled' &&
		receipt.stages.every((stage) => stage.disposition === 'stage_approved')
	);
}

function finishStage(stage: AgenticChatCompletionStageV1): AgenticChatCompletionStageV1 {
	const executed = stage.executedCallIds.length;
	const failed = stage.failedCallIds.length;
	return {
		...stage,
		disposition:
			executed > 0 && failed === 0
				? 'stage_approved'
				: executed > 0
					? 'stage_partial'
					: 'stage_failed'
	};
}

function readBatchApproval(execution: FastToolExecution): string | null {
	if (execution.toolCall.function?.name !== APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME_V1) {
		return null;
	}
	if (execution.result.success !== true) return null;
	const payload = execution.result.result;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	const record = payload as Record<string, unknown>;
	if (record.status !== 'mutation_batch_review_approved') return null;
	const sha = typeof record.batch_sha256 === 'string' ? record.batch_sha256.trim() : '';
	return /^[0-9a-f]{64}$/.test(sha) ? sha : null;
}
