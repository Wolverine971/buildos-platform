// apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts

import {
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../../tools/execution-adapter';
import type {
	AgenticChatControlDecisionAuthorV1,
	AgenticChatTurnProviderRequestV1
} from '../contracts';
import {
	type CompletedProviderToolCall,
	completeReviewerToolCalls,
	createToolCallAccumulator
} from '../stream-tool-calls';
import { validateCompletedProviderCalls } from '../validation';
import {
	buildCandidateGateClarification,
	buildReviewFallbackClarification,
	findAmbiguousReferenceCandidates
} from './decision-handling';

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
};

export function completeTurnContractReviewDecision(
	input: ReviewDecisionCompletionInput & {
		contract: TurnContract;
		contractReviewSha256: string;
		allowRevision: boolean;
	}
): CompletedProviderToolCall[] {
	let { calls, fallbackReason } = completeSingleReviewDecision(
		input,
		'Independent semantic review'
	);
	if (!fallbackReason) {
		const call = calls[0]!;
		const approval = call.name === APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME;
		const readOnly = call.name === DECLARE_READ_ONLY_TURN_TOOL_NAME;
		const clarification = call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
		const revision = call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME;
		if (
			(!approval && !readOnly && !clarification && !revision) ||
			(revision && !input.allowRevision) ||
			(approval && call.arguments.contract_sha256 !== input.contractReviewSha256) ||
			validateCompletedProviderCalls(calls, input.reviewRequest).length > 0
		) {
			fallbackReason = 'Independent semantic review returned an invalid or unbound decision.';
		} else if (approval) {
			// Models propose; code disposes. If the reviewer enumerated several
			// plausible entities and the contract chose only some, the user owns the
			// remaining choice regardless of how confident the approval reads.
			const ambiguity = findAmbiguousReferenceCandidates(call.arguments, input.contract);
			if (ambiguity) {
				calls = [buildCandidateGateClarification(input.actingRequest, ambiguity)];
			}
		}
	}
	if (fallbackReason) {
		calls = [buildReviewFallbackClarification(input.actingRequest, fallbackReason)];
	}
	return withDecisionAuthor(calls, 'contract_reviewer');
}

export function completeMutationBatchReviewDecision(
	input: ReviewDecisionCompletionInput & {
		batchSha256: string;
		allowRevision: boolean;
	}
): CompletedProviderToolCall[] {
	let { calls, fallbackReason } = completeSingleReviewDecision(
		input,
		'Independent mutation review'
	);
	if (!fallbackReason) {
		const call = calls[0]!;
		const approval = call.name === APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME;
		const clarification = call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
		const revision = call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME;
		if (
			(!approval && !clarification && !revision) ||
			(revision && !input.allowRevision) ||
			(approval && call.arguments.batch_sha256 !== input.batchSha256) ||
			validateCompletedProviderCalls(calls, input.reviewRequest).length > 0
		) {
			fallbackReason = 'Independent mutation review returned an invalid or unbound decision.';
		}
	}
	if (fallbackReason) {
		calls = [buildReviewFallbackClarification(input.actingRequest, fallbackReason)];
	}
	return withDecisionAuthor(calls, 'mutation_batch_reviewer');
}

function completeSingleReviewDecision(
	input: ReviewDecisionCompletionInput,
	reviewLabel: string
): SingleReviewDecision {
	let fallbackReason = input.fallbackReason;
	let calls: CompletedProviderToolCall[] = [];
	if (!fallbackReason && input.finished) {
		const completion = completeReviewerToolCalls(input.toolCalls, input.reviewRequest.tools, {
			finishedReason: input.finishedReason,
			completionBudgetExhausted: input.finishedReason === 'length'
		});
		if (completion.rejectionCode) {
			fallbackReason = `${reviewLabel} did not return a readable decision (${completion.rejectionCode}).`;
		} else {
			calls = completion.calls;
		}
	}
	if (!fallbackReason && (!input.finished || calls.length !== 1)) {
		fallbackReason = `${reviewLabel} did not return exactly one decision.`;
	}
	return { calls, fallbackReason };
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
