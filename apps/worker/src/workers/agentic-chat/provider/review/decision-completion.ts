// apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts

import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import {
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	type TurnContract,
	parseDeclaredTurnContract,
	serializeTurnContractForDeclaration
} from '@buildos/agentic-chat-runtime/loop';
import {
	APPROVE_MUTATION_BATCH_REVIEW_TOOL_NAME,
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../../tools/execution-adapter';
import type {
	AgenticChatControlDecisionAuthorV1,
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1
} from '../contracts';
import { validateContractEffectFields } from '../contract-fields';
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
		admittedTools?: readonly AgenticChatTurnProviderToolV1[];
	}
): CompletedProviderToolCall[] {
	let { calls, fallbackReason } = completeSingleReviewDecision(
		input,
		'Independent semantic review'
	);
	if (!fallbackReason) {
		let call = calls[0]!;
		const approval = call.name === APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME;
		const readOnly = call.name === DECLARE_READ_ONLY_TURN_TOOL_NAME;
		const clarification = call.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
		const revision = call.name === REQUEST_PROPOSAL_REVISION_TOOL_NAME;
		const normalizedCorrection = revision
			? normalizeReviewerCorrectedContractValue(call.arguments.corrected_contract)
			: { value: null, changed: false };
		const correctedContract = revision
			? parseDeclaredTurnContract(normalizedCorrection.value)
			: null;
		let validationIssues = validateCompletedProviderCalls(calls, input.reviewRequest);
		if (
			revision &&
			correctedContract &&
			(normalizedCorrection.changed ||
				usesInternalContractFieldNames(call.arguments.corrected_contract) ||
				validationIssues.length > 0)
		) {
			const normalizedCall = normalizeCorrectedContractCall(call, correctedContract);
			const normalizedIssues = validateCompletedProviderCalls(
				[normalizedCall],
				input.reviewRequest
			);
			if (normalizedIssues.length === 0) {
				call = normalizedCall;
				calls = [call];
				validationIssues = [];
			}
		}
		if (
			(!approval && !readOnly && !clarification && !revision) ||
			(revision && !input.allowRevision) ||
			(revision && !correctedContract) ||
			(approval &&
				!approvalShaMatches(call.arguments.contract_sha256, input.contractReviewSha256)) ||
			validationIssues.length > 0
		) {
			fallbackReason = 'Independent semantic review returned an invalid or unbound decision.';
		} else if (approval || (revision && correctedContract)) {
			// Models propose; code disposes. If the reviewer enumerated several
			// plausible entities and the reviewed contract chose only some, the user
			// owns the remaining choice regardless of whether the reviewer approved
			// the original contract or supplied a typed correction.
			const reviewedContract = approval ? input.contract : correctedContract;
			const fieldErrors = reviewedContract
				? validateContractEffectFields(
						reviewedContract,
						input.admittedTools ?? input.actingRequest.tools
					)
				: [];
			if (fieldErrors.length > 0) {
				fallbackReason = `Independent semantic review returned an unexecutable contract. ${fieldErrors[0]}`;
			}
			const ambiguity = reviewedContract
				? findAmbiguousReferenceCandidates(call.arguments, reviewedContract)
				: null;
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

/**
 * Reviewer schemas expose symbolic create/move fields because organization
 * corrections need them. Tool models can still populate optional fields with
 * generic placeholders on unrelated outcomes. Those decorations have no user
 * semantics and the contract parser rightly rejects them, so discard only the
 * fields that the declared action can never consume before canonical re-review.
 */
function normalizeReviewerCorrectedContractValue(value: unknown): {
	value: unknown;
	changed: boolean;
} {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { value, changed: false };
	}
	const record = value as Record<string, unknown>;
	if (!Array.isArray(record.outcomes)) return { value, changed: false };
	let changed = false;
	const outcomes = record.outcomes.map((outcome) => {
		if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return outcome;
		const normalized = { ...(outcome as Record<string, unknown>) };
		const action =
			typeof normalized.action === 'string' ? normalized.action.trim().toLowerCase() : null;
		if (action && action !== 'create' && Object.hasOwn(normalized, 'label')) {
			delete normalized.label;
			changed = true;
		}
		if (action && action !== 'move' && action !== 'organize') {
			for (const field of ['parent_label', 'parentLabel']) {
				if (!Object.hasOwn(normalized, field)) continue;
				delete normalized[field];
				changed = true;
			}
		}
		return normalized;
	});
	return changed ? { value: { ...record, outcomes }, changed } : { value, changed: false };
}

function usesInternalContractFieldNames(value: unknown): boolean {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
	const record = value as Record<string, unknown>;
	if ('source' in record || 'version' in record) return true;
	if (!Array.isArray(record.outcomes)) return false;
	return record.outcomes.some(
		(outcome) =>
			Boolean(outcome) &&
			typeof outcome === 'object' &&
			!Array.isArray(outcome) &&
			[
				'entityKind',
				'targetIds',
				'requiredFields',
				'minimumSuccessfulEffects',
				'parentLabel'
			].some((field) => field in outcome)
	);
}

function normalizeCorrectedContractCall(
	call: CompletedProviderToolCall,
	correctedContract: TurnContract
): CompletedProviderToolCall {
	const argumentsValue: JsonObject = {
		...call.arguments,
		corrected_contract: serializeTurnContractForDeclaration(correctedContract)
	};
	const providerArguments: JsonObject = { ...argumentsValue };
	if (call.scheduling?.callRef) providerArguments.call_ref = call.scheduling.callRef;
	if (call.scheduling && call.scheduling.after.length > 0) {
		providerArguments.after = [...call.scheduling.after];
	}
	return {
		...call,
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(providerArguments)
	};
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
			(approval && !approvalShaMatches(call.arguments.batch_sha256, input.batchSha256)) ||
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

/**
 * The approval tool schemas are static (no per-review `const`), so this is
 * the only binding between an approval and the exact proposal the reviewer
 * was shown. A missing, non-string, or different SHA fails closed to the
 * clarification fallback.
 */
export function approvalShaMatches(value: unknown, expected: string): boolean {
	return typeof value === 'string' && expected.length > 0 && value === expected;
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
