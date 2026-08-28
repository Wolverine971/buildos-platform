// apps/worker/src/workers/agentic-chat/provider/review/decision-handling.ts
import { type JsonObject, canonicalizeAgenticChatJson } from '@buildos/shared-types';
import {
	DECLARE_TURN_CONTRACT_TOOL_NAME,
	REQUEST_TURN_CLARIFICATION_TOOL_NAME
} from '@buildos/agentic-chat-runtime/catalog';
import { type TurnContract, parseDeclaredTurnContract } from '@buildos/agentic-chat-runtime/loop';
import type { AgenticChatTurnProviderRequestV1, AgenticChatTurnProviderToolV1 } from '../contracts';
import { appendSystemInstruction } from '../request-builders';
import type { CompletedProviderToolCall } from '../stream-tool-calls';
import {
	buildPostSemanticDispositionRequest,
	buildSemanticTurnDispositionGateRequest
} from './disposition';

export type PendingProposalRevision = {
	kind: 'contract' | 'mutation_batch';
	reason: string;
	requiredCorrection: string;
	correctedContract: TurnContract | null;
};

export type ReferenceCandidateGroup = {
	reference: string;
	candidates: Array<{ id: string; title: string }>;
};

export function buildReviewFallbackClarification(
	request: AgenticChatTurnProviderRequestV1,
	reason: string
): CompletedProviderToolCall {
	const id = `semantic-review-fallback:${request.turnRunId}:${request.logicalProviderRound}`;
	const argumentsValue: JsonObject = {
		reason: reason.trim().slice(0, 240),
		question:
			'I could not safely verify the exact target and values for this change. Which exact item should I change, and what should the final value be?'
	};
	return {
		id,
		name: REQUEST_TURN_CLARIFICATION_TOOL_NAME,
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue),
		decidedBy: 'harness_review_fallback'
	};
}

export function readProposalRevision(argumentsValue: JsonObject): {
	reason: string;
	requiredCorrection: string;
	correctedContract: TurnContract | null;
} {
	const reason =
		typeof argumentsValue.reason === 'string' ? argumentsValue.reason.trim().slice(0, 400) : '';
	const requiredCorrection =
		typeof argumentsValue.required_correction === 'string'
			? argumentsValue.required_correction.trim().slice(0, 400)
			: '';
	return {
		reason,
		requiredCorrection,
		correctedContract: parseDeclaredTurnContract(argumentsValue.corrected_contract)
	};
}

function readReferenceCandidates(value: unknown): ReferenceCandidateGroup[] {
	if (!Array.isArray(value)) return [];
	const groups: ReferenceCandidateGroup[] = [];
	for (const item of value.slice(0, 20)) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
		const record = item as Record<string, unknown>;
		const reference =
			typeof record.reference === 'string' ? record.reference.trim().slice(0, 160) : '';
		if (!reference || !Array.isArray(record.candidates)) continue;
		const seen = new Set<string>();
		const candidates: Array<{ id: string; title: string }> = [];
		for (const candidate of record.candidates.slice(0, 20)) {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
			const candidateRecord = candidate as Record<string, unknown>;
			const id = typeof candidateRecord.id === 'string' ? candidateRecord.id.trim() : '';
			const title =
				typeof candidateRecord.title === 'string'
					? candidateRecord.title.trim().slice(0, 160)
					: '';
			if (!id || seen.has(id)) continue;
			seen.add(id);
			candidates.push({ id, title: title || id });
		}
		if (candidates.length > 0) groups.push({ reference, candidates });
	}
	return groups;
}

/**
 * Deterministic restraint floor on top of the reviewer's judgment: when the
 * reviewer itself lists several loaded entities for one user reference and the
 * approved contract targets only some of them, the remaining choice is the
 * user's. This triggers from the reviewer's own enumeration, never from
 * pattern-matching its prose.
 */
export function findAmbiguousReferenceCandidates(
	argumentsValue: JsonObject,
	contract: TurnContract
): ReferenceCandidateGroup | null {
	return findAmbiguousReferenceCandidatesForTargetIds(
		argumentsValue,
		contract.outcomes.flatMap((outcome) => outcome.targetIds)
	);
}

export function findAmbiguousReferenceCandidatesForTargetIds(
	argumentsValue: JsonObject,
	targetIds: readonly string[]
): ReferenceCandidateGroup | null {
	const contractTargets = new Set(targetIds);
	for (const group of readReferenceCandidates(argumentsValue.reference_candidates)) {
		if (group.candidates.length < 2) continue;
		const covered = group.candidates.filter((candidate) =>
			contractTargets.has(candidate.id)
		).length;
		// The floor guards a singular reference resolved to one of several
		// plausible entities ("the email one" → three email tasks). A contract
		// that already covers two or more of the listed candidates treated the
		// reference as a set; which members of a delegated set to include (for
		// example every loose document but the managed START HERE) is the
		// reviewer's judgment, not a user choice. Live organize turns were
		// converted from approval to clarification here.
		if (covered >= 2) continue;
		if (covered < group.candidates.length) return group;
	}
	return null;
}

const CANDIDATE_GATE_QUESTION_MAX_LENGTH = 500;
const CANDIDATE_GATE_LABEL_SEPARATOR = ' · ';

export function buildCandidateGateClarification(
	request: AgenticChatTurnProviderRequestV1,
	group: ReferenceCandidateGroup
): CompletedProviderToolCall {
	const id = `candidate-gate:${request.turnRunId}:${request.logicalProviderRound}`;
	// The deterministic clarification executor rejects a question that does not
	// contain every supplied candidate label verbatim, so the question prefix and
	// every label must share one truncation budget instead of slicing the
	// assembled question afterwards.
	const questionPrefix = `Which one did you mean by "${group.reference}"? `;
	const labelBudget = Math.floor(
		(CANDIDATE_GATE_QUESTION_MAX_LENGTH -
			questionPrefix.length -
			CANDIDATE_GATE_LABEL_SEPARATOR.length * (group.candidates.length - 1)) /
			group.candidates.length
	);
	const candidates = group.candidates.map((candidate) => {
		const label = candidate.title.slice(0, labelBudget).trim();
		return {
			id: candidate.id,
			label: label || candidate.id.slice(0, labelBudget),
			kind: 'entity'
		};
	});
	const argumentsValue: JsonObject = {
		reason: `Independent review listed ${group.candidates.length} loaded entities that plausibly match "${group.reference}" but the contract targets only some of them; the choice belongs to the user.`.slice(
			0,
			240
		),
		question: `${questionPrefix}${candidates
			.map((candidate) => candidate.label)
			.join(CANDIDATE_GATE_LABEL_SEPARATOR)}`,
		candidates
	};
	return {
		id,
		name: REQUEST_TURN_CLARIFICATION_TOOL_NAME,
		arguments: argumentsValue,
		canonicalArguments: canonicalizeAgenticChatJson(argumentsValue),
		canonicalProviderArguments: canonicalizeAgenticChatJson(argumentsValue),
		decidedBy: 'harness_candidate_gate'
	};
}

export function buildContractRevisionRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	revision: PendingProposalRevision
): AgenticChatTurnProviderRequestV1 {
	const base =
		buildSemanticTurnDispositionGateRequest(request, availableTools) ??
		buildPostSemanticDispositionRequest(
			request,
			availableTools,
			DECLARE_TURN_CONTRACT_TOOL_NAME
		);
	return appendSystemInstruction(
		{ ...base, passRole: 'repair' },
		[
			'Independent review returned your proposed contract to you for correction; it did not reach the user.',
			`Reason: ${revision.reason || 'not stated'}.`,
			`Required correction: ${revision.requiredCorrection || 'not stated'}.`,
			'Declare the corrected exact contract now with declare_turn_contract: one outcome per distinct change, exact target ids from the loaded context, and the full cardinality the user commissioned.',
			'Request clarification only if a choice genuinely belongs to the user. Do not narrate this correction to the user.'
		].join(' ')
	);
}

export function buildMutationBatchRevisionRequest(
	request: AgenticChatTurnProviderRequestV1,
	availableTools: readonly AgenticChatTurnProviderToolV1[],
	revision: PendingProposalRevision
): AgenticChatTurnProviderRequestV1 {
	return appendSystemInstruction(
		{
			...buildPostSemanticDispositionRequest(
				request,
				availableTools,
				DECLARE_TURN_CONTRACT_TOOL_NAME
			),
			passRole: 'repair'
		},
		[
			'Independent review returned your exact mutation batch to you for correction; it did not reach the user. The approved contract still stands.',
			`Reason: ${revision.reason || 'not stated'}.`,
			`Required correction: ${revision.requiredCorrection || 'not stated'}.`,
			'Propose the corrected mutation calls now using only the approved contract targets and values the user stated or delegated. Do not re-declare the contract, do not add unstated values, and do not narrate this correction to the user.'
		].join(' ')
	);
}
