// apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts

import { createHash } from 'node:crypto';
import { groundedMutationReviewIds, reviewerReferencesAreGrounded } from './grounded-ids';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	type MutationBatch,
	type TurnContract,
	parseRequestExpectation,
	requestExpectationsMatch
} from '@buildos/agentic-chat-runtime/loop';
import type {
	AgenticChatControlDecisionAuthorV1,
	AgenticChatTurnProviderRequestV1,
	ContractReviewDiagnostic,
	ContractReviewRejectionCode
} from '../contracts';
import { AgenticChatProviderExecutionError } from '../contracts';
import {
	type CompletedProviderToolCall,
	completeReviewerToolCalls,
	createToolCallAccumulator,
	isToolArgumentsTextTruncated
} from '../stream-tool-calls';
import {
	checkMutationBatchRevisionEvidence,
	checkMutationBatchRevisionStage
} from './revision-evidence';

type ReviewDecisionCompletionInput = {
	actingRequest: AgenticChatTurnProviderRequestV1;
	reviewRequest: AgenticChatTurnProviderRequestV1;
	toolCalls: ReturnType<typeof createToolCallAccumulator>;
	finished: boolean;
	finishedReason: string | null;
	fallbackReason: string | null;
};

type SingleReviewDecision = {
	calls: CompletedProviderToolCall[];
	fallbackReason: string | null;
	rejectionCode: ContractReviewRejectionCode | null;
};

/**
 * Complete one mutation-batch review decision.
 *
 * Deliberately short: there is no corrected contract to parse, canonicalize,
 * re-validate and re-review, and no effect-field authorization check. The
 * reviewer never authors calls. The first approval also records a complete
 * request checklist using the existing outcome format, solely for completion.
 * The reviewer either approves the exact SHA it was shown, sends the calls back with a
 * reason, downgrades the turn to read-only, or asks the user.
 */
export function completeMutationBatchReviewDecision(
	input: ReviewDecisionCompletionInput & {
		batchSha256: string;
		batch?: MutationBatch;
		allowRevision: boolean;
		requestExpectation?: TurnContract | null;
		/**
		 * The first decision of a review: a revision that names no wrong held
		 * call, or carries unreadable findings, gets one fresh reviewer decision
		 * instead of an actor repair plus a second review. The retry decision
		 * is accepted as-is, so these checks can cost one reviewer pass but can
		 * never end a turn that the old ladder would have finished.
		 */
		recheckRevision?: boolean;
	}
): CompletedProviderToolCall[] {
	const { calls, fallbackReason, rejectionCode } = completeSingleReviewDecision(
		input,
		'Independent semantic review'
	);
	let resolvedFallback = fallbackReason;
	let resolvedCode = rejectionCode;
	const decisionCalls = calls;
	if (!resolvedFallback) {
		const call = calls[0]!;
		const approval = call.name === APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME;
		const readOnly = call.name === DECLARE_READ_ONLY_TURN_TOOL_NAME;
		const clarification = call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
		const revision = call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME;
		resolvedCode =
			!approval && !readOnly && !clarification && !revision
				? 'unexpected_control_tool'
				: revision && !input.allowRevision
					? 'revision_disallowed'
					: approval &&
						  !approvalShaMatches(call.arguments.batch_sha256, input.batchSha256)
						? 'approval_sha_mismatch'
						: revision && input.batch
							? (checkMutationBatchRevisionEvidence(call.arguments, input.batch) ??
								(input.recheckRevision
									? checkMutationBatchRevisionStage(call.arguments, input.batch)
									: null))
							: null;
		if (resolvedCode) {
			resolvedFallback =
				'Independent semantic review returned an invalid or unbound decision.';
		}
		if (
			!resolvedFallback &&
			!reviewerReferencesAreGrounded(
				call.arguments,
				groundedMutationReviewIds(input.actingRequest, input.batch),
				input.batch
			)
		) {
			resolvedCode = 'ungrounded_reference_id';
			resolvedFallback =
				'Reviewer reference IDs must come from loaded records or exact rejected targets.';
		}
		if (
			approval &&
			(!input.requestExpectation || call.arguments.request_expectation !== undefined)
		) {
			const expectation = parseRequestExpectation(call.arguments.request_expectation);
			if (
				!expectation ||
				(input.requestExpectation &&
					!requestExpectationsMatch(input.requestExpectation, expectation))
			) {
				resolvedCode = 'decision_schema_invalid';
				resolvedFallback =
					'The request expectation is invalid or changes the frozen user commission.';
			}
		}
	}
	if (resolvedFallback) {
		throw new AgenticChatProviderExecutionError(
			'provider_semantic_review_invalid',
			'transient_infra',
			'Independent change verification failed.',
			{
				kind: 'rejected_contract_review',
				code: resolvedCode ?? 'provider_failure',
				finished: input.finished,
				finishedReason:
					input.finishedReason && /^[a-z_]{1,64}$/.test(input.finishedReason)
						? input.finishedReason
						: null,
				validationIssueCount: 0,
				validationIssueFields: [],
				calls: [...input.toolCalls.values()].map((call) => ({
					toolName: input.reviewRequest.tools.some(
						(tool) => tool.function.name === call.name
					)
						? call.name
						: null,
					argumentBytes: Buffer.byteLength(call.argumentsText, 'utf8'),
					argumentSha256: createHash('sha256').update(call.argumentsText).digest('hex'),
					truncated: isToolArgumentsTextTruncated(call.argumentsText)
				}))
			} satisfies ContractReviewDiagnostic
		);
	}
	return withDecisionAuthor(decisionCalls, 'contract_reviewer');
}

/**
 * The approval tool schemas are static (no per-review `const`), so this is
 * the only binding between an approval and the exact proposal the reviewer
 * was shown. A missing, non-string, or different SHA fails closed to the
 * internal review fault.
 */
export function approvalShaMatches(value: unknown, expected: string): boolean {
	return typeof value === 'string' && expected.length > 0 && value === expected;
}

function completeSingleReviewDecision(
	input: ReviewDecisionCompletionInput,
	reviewLabel: string
): SingleReviewDecision {
	let fallbackReason = input.fallbackReason;
	let rejectionCode: ContractReviewRejectionCode | null = fallbackReason
		? 'provider_failure'
		: null;
	if (input.finishedReason && !['tool_calls', 'function_call'].includes(input.finishedReason)) {
		rejectionCode =
			input.finishedReason === 'length' ? 'decision_truncated' : 'unexpected_finish_reason';
		fallbackReason = `${reviewLabel} did not finish a control decision.`;
	}
	let calls: CompletedProviderToolCall[] = [];
	if (!fallbackReason && input.finished) {
		const completion = completeReviewerToolCalls(input.toolCalls, input.reviewRequest.tools, {
			finishedReason: input.finishedReason,
			completionBudgetExhausted: input.finishedReason === 'length'
		});
		if (completion.rejectionCode) {
			rejectionCode =
				completion.rejectionCode === 'provider_tool_arguments_truncated'
					? 'decision_truncated'
					: 'unreadable_decision';
			fallbackReason = `${reviewLabel} did not return a readable decision (${completion.rejectionCode}).`;
		} else {
			calls = completion.calls;
		}
	}
	if (!fallbackReason && (!input.finished || calls.length !== 1)) {
		rejectionCode = !input.finished ? 'missing_done' : 'decision_count_invalid';
		fallbackReason = `${reviewLabel} did not return exactly one decision.`;
	}
	return { calls, fallbackReason, rejectionCode };
}

function withDecisionAuthor(
	calls: readonly CompletedProviderToolCall[],
	decidedBy: AgenticChatControlDecisionAuthorV1
): CompletedProviderToolCall[] {
	return calls.map((call) => ({
		...call,
		decidedBy: call.decidedBy ?? decidedBy
	}));
}
