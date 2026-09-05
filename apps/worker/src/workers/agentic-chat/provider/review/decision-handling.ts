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
	reason: string;
	requiredCorrection: string;
	correctedContract: TurnContract | null;
};

export type ReferenceCandidateGroup = {
	reference: string;
	candidates: Array<{ id: string; title: string }>;
};

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
	contract: TurnContract,
	userMessageText: string | null | readonly string[] = null
): ReferenceCandidateGroup | null {
	return findAmbiguousReferenceCandidatesForTargetIds(
		argumentsValue,
		contract.outcomes.flatMap((outcome) => outcome.targetIds),
		userMessageText
	);
}

export function findAmbiguousReferenceCandidatesForTargetIds(
	argumentsValue: JsonObject,
	targetIds: readonly string[],
	userMessageText: string | null | readonly string[] = null
): ReferenceCandidateGroup | null {
	const contractTargets = new Set(targetIds);
	// Latest message first, then earlier ones: "the same document" in a
	// follow-up points at whatever the user named in their own earlier words.
	const userMessages = (
		Array.isArray(userMessageText)
			? userMessageText
			: [typeof userMessageText === 'string' ? userMessageText : '']
	).map((text) => normalizeCandidateMatchText(text ?? ''));
	const normalizedMessage = userMessages[0] ?? '';
	const priorMessages = userMessages.slice(1);
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
		if (covered >= group.candidates.length) continue;
		// Strictly narrowing: a reference the user already disambiguated in
		// their own words is not a choice to hand back. A 2026-09-03 browser
		// battery asked "Marketing Brief or Context Document?" for a message
		// that said "Marketing Brief" and a contract carrying that document's
		// id. Only an unambiguous naming skips the floor; anything the message
		// leaves open still reaches the user.
		if (userMessageIdentifiesExactlyOneCandidate(normalizedMessage, group.candidates)) continue;
		// A follow-up that says "the same document" or "those edits" names
		// nothing itself. When exactly one candidate was named in the user's
		// own recent earlier messages and the contract targets that candidate,
		// the reference is resolved by the user, not guessed by the model
		// (2026-09-04 retest: "Use the same existing document" after a message
		// that named the Marketing Brief was bounced back as a choice).
		const priorPick = priorMessages
			.map((text) => uniquelyIdentifiedCandidate(text, group.candidates))
			.find((candidate) => candidate !== null);
		if (priorPick && contractTargets.has(priorPick.id)) continue;
		return group;
	}
	return null;
}

/**
 * NFKC + lowercase + whitespace collapse, so a pasted id or title matches the
 * user's own typography (curly quotes, non-breaking spaces, wrapped lines).
 */
function normalizeCandidateMatchText(value: string): string {
	return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

const MIN_UNIQUE_TITLE_MATCH_LENGTH = 3;

function userMessageIdentifiesExactlyOneCandidate(
	normalizedMessage: string,
	candidates: readonly { id: string; title: string }[]
): boolean {
	return uniquelyIdentifiedCandidate(normalizedMessage, candidates) !== null;
}

function uniquelyIdentifiedCandidate<T extends { id: string; title: string }>(
	normalizedMessage: string,
	candidates: readonly T[]
): T | null {
	if (!normalizedMessage) return null;
	const byId = candidates.filter((candidate) => {
		const id = normalizeCandidateMatchText(candidate.id);
		return id.length > 0 && normalizedMessage.includes(id);
	});
	if (byId.length > 0) return byId.length === 1 ? byId[0]! : null;
	const byTitle = candidates.filter((candidate) => {
		const title = normalizeCandidateMatchText(candidate.title);
		return title.length >= MIN_UNIQUE_TITLE_MATCH_LENGTH && normalizedMessage.includes(title);
	});
	return byTitle.length === 1 ? byTitle[0]! : null;
}

/**
 * The reviewer never sees the conversation, so the candidate gate reads the
 * user's own latest words off the acting request it is about to answer.
 */
export function latestUserMessageText(request: AgenticChatTurnProviderRequestV1): string | null {
	return recentUserMessageTexts(request, 1)[0] ?? null;
}

const RECENT_USER_MESSAGE_WINDOW = 3;

/**
 * The user's own recent words, latest first. A follow-up ("the same one",
 * "those three edits") resolves against what the user named just before it.
 */
export function recentUserMessageTexts(
	request: AgenticChatTurnProviderRequestV1,
	limit = RECENT_USER_MESSAGE_WINDOW
): string[] {
	const texts: string[] = [];
	for (let index = request.messages.length - 1; index >= 0 && texts.length < limit; index -= 1) {
		const message = request.messages[index]!;
		if (message.role !== 'user') continue;
		const text =
			typeof message.content === 'string'
				? message.content
				: message.content
						.filter(
							(part): part is Extract<typeof part, { type: 'text' }> =>
								part.type === 'text' && typeof part.text === 'string'
						)
						.map((part) => part.text)
						.join('\n');
		if (text) texts.push(text);
	}
	return texts;
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

export type ClarificationRender = {
	question: string;
	labels: string[];
};

const CLARIFICATION_RENDER_MAX_LABELS = 20;

/**
 * The structured question the clarification executor already accepted. A
 * forced-synthesis pass that originates from a clarification disposition has
 * to put this in front of the user; the model's prose is only allowed to
 * paraphrase it, never to replace it with a promise to act.
 */
export function readClarificationRender(argumentsValue: JsonObject): ClarificationRender | null {
	const question =
		typeof argumentsValue.question === 'string'
			? argumentsValue.question.trim().slice(0, CANDIDATE_GATE_QUESTION_MAX_LENGTH)
			: '';
	if (!question) return null;
	const labels: string[] = [];
	if (Array.isArray(argumentsValue.candidates)) {
		for (const item of argumentsValue.candidates.slice(0, CLARIFICATION_RENDER_MAX_LABELS)) {
			if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
			const label = (item as Record<string, unknown>).label;
			const trimmed = typeof label === 'string' ? label.trim().slice(0, 200) : '';
			if (trimmed && !labels.includes(trimmed)) labels.push(trimmed);
		}
	}
	return { question, labels };
}

/**
 * The question survived if the prose repeats it, or at least asks something
 * and names every candidate. Both are checked case-insensitively on collapsed
 * whitespace so a reflowed paragraph still counts.
 */
export function clarificationRenderSatisfied(text: string, render: ClarificationRender): boolean {
	const normalized = normalizeCandidateMatchText(text);
	if (!normalized) return false;
	// Every candidate label has to reach the user: the clarification executor
	// no longer requires the question itself to repeat them, so the render is
	// the one place that guarantees the choices are visible.
	const labelsPresent = render.labels.every((label) =>
		normalized.includes(normalizeCandidateMatchText(label))
	);
	if (!labelsPresent) return false;
	if (normalized.includes(normalizeCandidateMatchText(render.question))) return true;
	return normalized.includes('?') && render.labels.length > 0;
}

export function renderClarificationText(render: ClarificationRender): string {
	if (render.labels.length === 0) return render.question;
	return [render.question, ...render.labels.map((label) => `- ${label}`)].join('\n');
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
