// apps/worker/src/workers/agentic-chat/provider/review/decision-completion.ts

import { createHash } from 'node:crypto';
import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import {
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import {
	type TurnContract,
	describeDeclaredTurnContractIssues,
	isProseTurnContractChange,
	parseDeclaredTurnContract,
	serializeTurnContractForDeclaration
} from '@buildos/agentic-chat-runtime/loop';
import {
	APPROVE_TURN_CONTRACT_REVIEW_TOOL_NAME,
	REQUEST_PROPOSAL_REVISION_TOOL_NAME
} from '../../tools/execution-adapter';
import type {
	AgenticChatControlDecisionAuthorV1,
	AgenticChatTurnProviderRequestV1,
	AgenticChatTurnProviderToolV1,
	ContractReviewDiagnostic,
	ContractReviewRejectionCode
} from '../contracts';
import { AgenticChatProviderExecutionError } from '../contracts';
import { validateContractEffectFields } from '../contract-fields';
import {
	type CompletedProviderToolCall,
	completeReviewerToolCalls,
	createToolCallAccumulator,
	isToolArgumentsTextTruncated
} from '../stream-tool-calls';
import { validateCompletedProviderCalls } from '../validation';
import {
	buildCandidateGateClarification,
	findAmbiguousReferenceCandidates,
	recentUserMessageTexts
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
	rejectionCode: ContractReviewRejectionCode | null;
};

export function completeTurnContractReviewDecision(
	input: ReviewDecisionCompletionInput & {
		contract: TurnContract;
		contractReviewSha256: string;
		allowRevision: boolean;
		admittedTools?: readonly AgenticChatTurnProviderToolV1[];
	}
): CompletedProviderToolCall[] {
	let { calls, fallbackReason, rejectionCode } = completeSingleReviewDecision(
		input,
		'Independent semantic review'
	);
	let validationIssueCount = 0;
	let validationErrors: string[] = [];
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
		// One schema validation per decision (2026-09-04, one-engine stage S9).
		// A correction that needs canonicalizing is canonicalized FIRST, because
		// the canonical call is the one that will be adopted and therefore the
		// one that has to pass. Validating the raw decision and then the
		// normalized decision spent two validator passes to answer one question.
		const canonicalCall =
			revision &&
			correctedContract &&
			(normalizedCorrection.changed ||
				usesInternalContractFieldNames(call.arguments.corrected_contract) ||
				correctionCarriesProseChanges(normalizedCorrection.value))
				? normalizeCorrectedContractCall(call, correctedContract)
				: null;
		let validationIssues = validateCompletedProviderCalls(
			canonicalCall ? [canonicalCall] : calls,
			input.reviewRequest
		);
		if (canonicalCall && validationIssues.length === 0) {
			call = canonicalCall;
			calls = [call];
		} else if (!canonicalCall && correctedContract && validationIssues.length > 0) {
			// Bounded repair, not a re-validation: the reviewer's own JSON failed,
			// so its canonical serialization gets one attempt before the turn falls
			// back to an internal review fault.
			const repairedCall = normalizeCorrectedContractCall(call, correctedContract);
			if (validateCompletedProviderCalls([repairedCall], input.reviewRequest).length === 0) {
				call = repairedCall;
				calls = [call];
				validationIssues = [];
			}
		}
		validationIssueCount = validationIssues.reduce(
			(sum, issue) => sum + issue.errors.length,
			0
		);
		validationErrors = validationIssues.flatMap((issue) => issue.errors);
		if (revision && !correctedContract) {
			validationErrors.push(
				...describeDeclaredTurnContractIssues(normalizedCorrection.value)
			);
			validationIssueCount = validationErrors.length;
		}
		rejectionCode =
			!approval && !readOnly && !clarification && !revision
				? 'unexpected_control_tool'
				: revision && !input.allowRevision
					? 'revision_disallowed'
					: revision && !correctedContract
						? 'corrected_contract_invalid'
						: approval &&
							  !approvalShaMatches(
									call.arguments.contract_sha256,
									input.contractReviewSha256
							  )
							? 'approval_sha_mismatch'
							: validationIssues.length > 0
								? 'decision_schema_invalid'
								: null;
		if (rejectionCode) {
			fallbackReason = 'Independent semantic review returned an invalid or unbound decision.';
		} else if (approval || (revision && correctedContract)) {
			// Models propose; code disposes. If the reviewer enumerated several
			// plausible entities and the reviewed contract chose only some, the user
			// owns the remaining choice regardless of whether the reviewer approved
			// the original contract or supplied a typed correction.
			const reviewedContract = approval ? input.contract : correctedContract;
			// Only a reviewer-authored correction is a new contract. An APPROVED
			// contract is the exact contract the acting pass already put through
			// `validateCompletedProviderCalls` against this same admitted surface,
			// which runs `validateContractEffectFields` on it; re-running it here
			// validated the identical contract twice on every write turn that
			// reached review (and a third time when a correction was re-reviewed).
			const fieldErrors =
				!approval && correctedContract
					? validateContractEffectFields(
							correctedContract,
							input.admittedTools ?? input.actingRequest.tools
						)
					: [];
			if (fieldErrors.length > 0) {
				rejectionCode = 'unexecutable_effect_fields';
				validationIssueCount = fieldErrors.length;
				validationErrors = fieldErrors;
				fallbackReason = `Independent semantic review returned an unexecutable contract. ${fieldErrors[0]}`;
			}
			const ambiguity = reviewedContract
				? findAmbiguousReferenceCandidates(
						call.arguments,
						reviewedContract,
						recentUserMessageTexts(input.actingRequest)
					)
				: null;
			if (ambiguity) {
				calls = [buildCandidateGateClarification(input.actingRequest, ambiguity)];
			}
		}
	}
	if (fallbackReason) {
		const diagnostic: ContractReviewDiagnostic = {
			kind: 'rejected_contract_review',
			code: rejectionCode ?? 'provider_failure',
			finished: input.finished,
			finishedReason:
				input.finishedReason && /^[a-z_]{1,64}$/.test(input.finishedReason)
					? input.finishedReason
					: null,
			validationIssueCount,
			validationIssueFields: [
				...new Set(
					validationErrors.flatMap(
						(error) =>
							error.match(
								/\b(?:src_label|dst_label|parent_label|label|target_ids|required_fields|changes|minimum_successful_effects|entity_kind|action|contract_sha256|reference_candidates)\b/g
							) ?? []
					)
				)
			],
			calls: [...input.toolCalls.values()].map((call) => ({
				toolName: input.reviewRequest.tools.some((tool) => tool.function.name === call.name)
					? call.name
					: null,
				argumentBytes: Buffer.byteLength(call.argumentsText, 'utf8'),
				argumentSha256: createHash('sha256').update(call.argumentsText).digest('hex'),
				truncated: isToolArgumentsTextTruncated(call.argumentsText)
			}))
		};
		// Internal rejection is neither user ambiguity nor permission to write.
		throw new AgenticChatProviderExecutionError(
			'provider_semantic_review_invalid',
			'transient_infra',
			'Independent change verification failed.',
			diagnostic
		);
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
	const createLabels = new Set(
		record.outcomes.flatMap((outcome) => {
			if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return [];
			const value = outcome as Record<string, unknown>;
			return typeof value.action === 'string' &&
				value.action.trim().toLowerCase() === 'create' &&
				typeof value.label === 'string'
				? [value.label.trim().toLowerCase()]
				: [];
		})
	);
	const outcomes = record.outcomes.map((outcome) => {
		if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return outcome;
		const normalized = { ...(outcome as Record<string, unknown>) };
		const action =
			typeof normalized.action === 'string' ? normalized.action.trim().toLowerCase() : null;
		const rawEntityKind = normalized.entity_kind ?? normalized.entityKind;
		const entityKind =
			typeof rawEntityKind === 'string' ? rawEntityKind.trim().toLowerCase() : null;
		for (const endpoint of ['src', 'dst']) {
			const changes = Array.isArray(normalized.changes) ? normalized.changes : [];
			const hasExistingId = changes.some(
				(change) =>
					change &&
					typeof change === 'object' &&
					change.field === `${endpoint}_id` &&
					typeof change.value === 'string' &&
					/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
						change.value
					)
			);
			for (const field of [`${endpoint}_label`, `${endpoint}Label`]) {
				if (!Object.hasOwn(normalized, field)) continue;
				// Discard decorations only when they cannot designate a create.
				// A real create label plus an ID is a conflict, and still fails closed.
				if (
					(action && (action !== 'link' || entityKind !== 'relationship')) ||
					(hasExistingId &&
						(typeof normalized[field] !== 'string' ||
							!createLabels.has(normalized[field].trim().toLowerCase())))
				) {
					delete normalized[field];
					changed = true;
				}
			}
		}
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

/**
 * The contract parser demotes prose change values (document content, a
 * description) to required_fields postconditions. A reviewer that pasted such
 * text into changes hit the 160-character cap and padded it with garbage in
 * the 2026-09-04 retest; the canonical serialization of the parsed contract is
 * the one to record and re-review, so the durable transition never carries a
 * value the fulfilment check cannot match.
 */
function correctionCarriesProseChanges(rawValue: unknown): boolean {
	if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) return false;
	const outcomes = (rawValue as Record<string, unknown>).outcomes;
	if (!Array.isArray(outcomes)) return false;
	return outcomes.some((outcome) => {
		if (!outcome || typeof outcome !== 'object' || Array.isArray(outcome)) return false;
		const changes = (outcome as Record<string, unknown>).changes;
		if (!Array.isArray(changes)) return false;
		return changes.some((change) => {
			if (!change || typeof change !== 'object' || Array.isArray(change)) return false;
			const record = change as Record<string, unknown>;
			const field =
				typeof record.field === 'string'
					? record.field
							.trim()
							.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
							.toLowerCase()
					: '';
			const value = typeof record.value === 'string' ? record.value.trim() : '';
			return Boolean(field) && isProseTurnContractChange(field, value);
		});
	});
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
				'parentLabel',
				'srcLabel',
				'dstLabel'
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
