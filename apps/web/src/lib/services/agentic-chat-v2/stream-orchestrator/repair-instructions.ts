// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import {
	getSkillById,
	getSkillByReference
} from '$lib/services/agentic-chat/tools/skills/registry';
import type { SkillLoadFormat } from '$lib/services/agentic-chat/tools/skills/types';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import { looksLikeFastChatMutationRequest } from '../turn-intent';
import {
	doesToolExecutionRequireUserAction,
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isWebResearchToolName,
	isWriteLedgerToolExecution,
	isWriteLikeOperation
} from './tool-classification';
import { extractGatewayRequiredFieldFailuresFromValidationIssues } from './round-analysis';
import { looksLikeProjectDocumentOrganizeTurn } from '../tool-selector';
import {
	classifyToolFailure,
	isNotFoundFailure,
	parseRequiredParameterFailure
} from './tool-failure';

export function shouldRepairProjectCreateNoExecution(params: {
	contextType: string;
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (params.contextType !== 'project_create') return false;
	if (params.repairAlreadyInjected) return false;
	if (didSuccessfulGatewayOpExecute(params.toolExecutions, 'onto.project.create')) return false;

	const finalText = params.finalText.trim();
	if (!finalText) return true;
	if (looksLikePureClarifyingQuestion(finalText)) return false;
	return true;
}

export function buildProjectCreateNoExecutionRepairInstruction(): string {
	return [
		'You are in project_create context and no successful onto.project.create call has happened yet.',
		'Do not end the turn with a success summary unless onto.project.create has actually succeeded.',
		'You already have enough guidance to continue. Do not call more project creation help paths unless a new schema detail is genuinely missing.',
		'Your next response must do one of two things only: emit a valid create_onto_project call with complete arguments, or ask one concise clarifying question if critical information is still missing.',
		'Minimal valid create shape: create_onto_project({ project: { name: "Project Name", type_key: "project.business.initiative" }, entities: [], relationships: [] }).',
		'If a previous onto.project.create attempt already included a full payload, reuse that payload and patch only the failing fields. Never replace a prior complete create payload with input:{}.',
		'If the user stated an outcome, add one goal. If they stated concrete actions, add only those tasks. Keep the payload minimal.'
	].join(' ');
}

// Skill-load gate enforcement (2026-07-02): the prompt-level gate alone proved
// insufficient — a live turn had "Skill-load gate: ACTIVE" in its prompt and the
// model still rewrote a document with zero skill_load calls. When domain sensing
// marked the turn skill-covered and nothing satisfied the gate, block the first
// finalization attempt and demand the load. Fires at most once per turn.

export type SkillGateTelemetry = {
	skill_gate_required: boolean;
	expected_skill_ids: string[];
	expected_skill_format: SkillLoadFormat | null;
	expected_skill_formats: Record<string, SkillLoadFormat>;
	history_loaded_skill_ids: string[];
	loaded_skill_ids: string[];
	matching_loaded_skill_ids: string[];
	loaded_skill_formats: Record<string, SkillLoadFormat>;
	skill_gate_satisfied: boolean;
	skill_gate_violation_repaired: boolean;
	skill_contract_present: boolean | null;
};

type LoadedSkillExecutionTelemetry = {
	skillIds: string[];
	format: SkillLoadFormat | null;
	contractPresent: boolean | null;
};

export function shouldRepairSkillGateNoLoad(params: {
	skillLoadRequired: boolean;
	acceptableSkillIds: string[];
	historyLoadedSkillIds: string[];
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (!params.skillLoadRequired) return false;
	if (params.repairAlreadyInjected) return false;
	const acceptableSkillIds = normalizeSkillIdList(params.acceptableSkillIds);
	if (hasRelevantLoadedSkill(params.historyLoadedSkillIds, acceptableSkillIds)) return false;
	if (didRelevantSuccessfulSkillLoadExecute(params.toolExecutions, acceptableSkillIds))
		return false;
	const finalText = params.finalText.trim();
	if (!finalText) return true;
	// A pure clarifying question produces no work product; the gate allows it.
	if (looksLikePureClarifyingQuestion(finalText)) return false;
	return true;
}

export function buildSkillGateTelemetry(params: {
	skillLoadRequired: boolean;
	expectedSkillIds: string[];
	expectedSkillFormats?: Record<string, SkillLoadFormat>;
	historyLoadedSkillIds: string[];
	toolExecutions: FastToolExecution[];
	violationRepairInjected: boolean;
}): SkillGateTelemetry {
	const expectedSkillIds = normalizeSkillIdList(params.expectedSkillIds).slice(0, 20);
	const expectedSkillFormats = normalizeSkillLoadFormats(params.expectedSkillFormats ?? {});
	const historyLoadedSkillIds = normalizeSkillIdList(params.historyLoadedSkillIds).slice(0, 20);
	const loadedSkillExecutions = params.toolExecutions
		.map(extractLoadedSkillExecutionTelemetry)
		.filter(
			(summary): summary is LoadedSkillExecutionTelemetry =>
				summary !== null && summary.skillIds.length > 0
		);
	const currentLoadedSkillIds = uniqueSkillIds(
		loadedSkillExecutions.flatMap((summary) => summary.skillIds)
	);
	const loadedSkillIds = uniqueSkillIds([...historyLoadedSkillIds, ...currentLoadedSkillIds]);
	const matchingLoadedSkillIds = params.skillLoadRequired
		? loadedSkillIds.filter((skillId) =>
				expectedSkillIds.length === 0
					? true
					: doesLoadedSkillSatisfyAcceptableSkill(skillId, expectedSkillIds)
			)
		: [];
	const loadedSkillFormats = collectLoadedSkillFormats(loadedSkillExecutions);
	const skillGateSatisfied =
		!params.skillLoadRequired ||
		hasRelevantLoadedSkill(historyLoadedSkillIds, expectedSkillIds) ||
		loadedSkillExecutions.some((summary) =>
			summary.skillIds.some((skillId) =>
				expectedSkillIds.length === 0
					? true
					: doesLoadedSkillSatisfyAcceptableSkill(skillId, expectedSkillIds)
			)
		);

	return {
		skill_gate_required: params.skillLoadRequired,
		expected_skill_ids: expectedSkillIds,
		expected_skill_format: resolveExpectedSkillFormat(expectedSkillFormats),
		expected_skill_formats: expectedSkillFormats,
		history_loaded_skill_ids: historyLoadedSkillIds,
		loaded_skill_ids: loadedSkillIds,
		matching_loaded_skill_ids: matchingLoadedSkillIds,
		loaded_skill_formats: loadedSkillFormats,
		skill_gate_satisfied: skillGateSatisfied,
		skill_gate_violation_repaired: params.violationRepairInjected,
		skill_contract_present: resolveSkillContractPresent({
			loadedSkillExecutions,
			expectedSkillIds,
			skillGateRequired: params.skillLoadRequired,
			skillGateSatisfied
		})
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSkillIdList(skillIds: string[]): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const skillId of skillIds) {
		const canonicalId = canonicalizeSkillReference(skillId);
		if (!canonicalId || seen.has(canonicalId)) continue;
		seen.add(canonicalId);
		result.push(canonicalId);
	}
	return result;
}

function uniqueSkillIds(skillIds: string[]): string[] {
	return normalizeSkillIdList(skillIds);
}

function normalizeSkillLoadFormats(
	value: Record<string, SkillLoadFormat>
): Record<string, SkillLoadFormat> {
	const formats: Record<string, SkillLoadFormat> = {};
	for (const [skillId, format] of Object.entries(value)) {
		if (format !== 'short' && format !== 'full') continue;
		const canonicalId = canonicalizeSkillReference(skillId);
		if (!canonicalId) continue;
		formats[canonicalId] = format;
	}
	return formats;
}

function resolveExpectedSkillFormat(
	expectedSkillFormats: Record<string, SkillLoadFormat>
): SkillLoadFormat | null {
	const uniqueFormats = new Set(Object.values(expectedSkillFormats));
	return uniqueFormats.size === 1 ? ([...uniqueFormats][0] ?? null) : null;
}

function collectLoadedSkillFormats(
	loadedSkillExecutions: LoadedSkillExecutionTelemetry[]
): Record<string, SkillLoadFormat> {
	const formats: Record<string, SkillLoadFormat> = {};
	for (const summary of loadedSkillExecutions) {
		if (!summary.format) continue;
		for (const skillId of summary.skillIds) {
			formats[skillId] = summary.format;
		}
	}
	return formats;
}

function parseSkillLoadFormat(value: unknown): SkillLoadFormat | null {
	return value === 'short' || value === 'full' ? value : null;
}

function extractLoadedSkillExecutionTelemetry(
	execution: FastToolExecution
): LoadedSkillExecutionTelemetry | null {
	if (execution.toolCall.function?.name?.trim() !== 'skill_load') return null;
	if (execution.result.success !== true) return null;
	const skillIds = extractLoadedSkillIdsFromExecution(execution);
	if (skillIds.length === 0) return null;

	const result = execution.result.result;
	let resultFormat: SkillLoadFormat | null = null;
	let contractPresent: boolean | null = null;
	if (isRecord(result)) {
		resultFormat = parseSkillLoadFormat(result.format);
		if (result.type === 'skill') {
			contractPresent =
				typeof result.output_contract === 'string' &&
				result.output_contract.trim().length > 0;
		}
	}

	const parsedArgs = parseToolArguments(execution.toolCall.function?.arguments);
	const argumentFormat = parsedArgs.error ? null : parseSkillLoadFormat(parsedArgs.args.format);

	return {
		skillIds,
		format: resultFormat ?? argumentFormat,
		contractPresent
	};
}

function resolveSkillContractPresent(params: {
	loadedSkillExecutions: LoadedSkillExecutionTelemetry[];
	expectedSkillIds: string[];
	skillGateRequired: boolean;
	skillGateSatisfied: boolean;
}): boolean | null {
	if (!params.skillGateRequired || !params.skillGateSatisfied) return null;
	let sawMatchingCurrentLoad = false;
	for (const summary of params.loadedSkillExecutions) {
		const matchesGate = summary.skillIds.some((skillId) =>
			params.expectedSkillIds.length === 0
				? true
				: doesLoadedSkillSatisfyAcceptableSkill(skillId, params.expectedSkillIds)
		);
		if (!matchesGate) continue;
		sawMatchingCurrentLoad = true;
		if (summary.contractPresent === true) return true;
	}
	return sawMatchingCurrentLoad ? false : null;
}

function canonicalizeSkillReference(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const reference = value.trim();
	if (!reference) return null;
	return getSkillByReference(reference)?.id ?? reference;
}

function hasRelevantLoadedSkill(loadedSkillIds: string[], acceptableSkillIds: string[]): boolean {
	const normalizedLoadedSkillIds = normalizeSkillIdList(loadedSkillIds);
	if (acceptableSkillIds.length === 0) {
		return normalizedLoadedSkillIds.length > 0;
	}
	return normalizedLoadedSkillIds.some((skillId) =>
		doesLoadedSkillSatisfyAcceptableSkill(skillId, acceptableSkillIds)
	);
}

function didRelevantSuccessfulSkillLoadExecute(
	toolExecutions: FastToolExecution[],
	acceptableSkillIds: string[]
): boolean {
	for (const execution of toolExecutions) {
		if (execution.toolCall.function?.name?.trim() !== 'skill_load') continue;
		if (execution.result.success !== true) continue;
		const loadedSkillIds = extractLoadedSkillIdsFromExecution(execution);
		if (acceptableSkillIds.length === 0) return true;
		if (
			loadedSkillIds.some((skillId) =>
				doesLoadedSkillSatisfyAcceptableSkill(skillId, acceptableSkillIds)
			)
		) {
			return true;
		}
	}
	return false;
}

function extractLoadedSkillIdsFromExecution(execution: FastToolExecution): string[] {
	const resultSkillIds: Array<string | null> = [];
	const result = execution.result.result;
	if (isRecord(result)) {
		resultSkillIds.push(
			canonicalizeSkillReference(result.id),
			canonicalizeSkillReference(result.skill_id),
			canonicalizeSkillReference(result.skill)
		);
	}
	const normalizedResultSkillIds = normalizeSkillIdList(
		resultSkillIds.filter((id): id is string => Boolean(id))
	);
	if (normalizedResultSkillIds.length > 0) return normalizedResultSkillIds;

	const argumentSkillIds: Array<string | null> = [];
	const parsed = parseToolArguments(execution.toolCall.function?.arguments);
	if (!parsed.error) {
		argumentSkillIds.push(
			canonicalizeSkillReference(parsed.args.skill),
			canonicalizeSkillReference(parsed.args.id),
			canonicalizeSkillReference(parsed.args.path)
		);
	}
	return normalizeSkillIdList(argumentSkillIds.filter((id): id is string => Boolean(id)));
}

function doesLoadedSkillSatisfyAcceptableSkill(
	loadedSkillId: string,
	acceptableSkillIds: string[]
): boolean {
	const acceptableSet = new Set(acceptableSkillIds);
	if (acceptableSet.has(loadedSkillId)) return true;

	const seen = new Set<string>([loadedSkillId]);
	let currentParentId = getSkillById(loadedSkillId)?.parentId?.trim();
	while (currentParentId && !seen.has(currentParentId)) {
		const canonicalParentId = canonicalizeSkillReference(currentParentId);
		if (!canonicalParentId) return false;
		if (acceptableSet.has(canonicalParentId)) return true;
		seen.add(canonicalParentId);
		currentParentId = getSkillById(canonicalParentId)?.parentId?.trim();
	}
	return false;
}

export function buildSkillGateNoLoadRepairInstruction(recommendedSkillIds: string[]): string {
	const candidates = recommendedSkillIds.slice(0, 6);
	return [
		'The skill-load gate for this turn is ACTIVE and no matching skill has been loaded in this turn or earlier in this session.',
		'This request matches skill-covered work; do not finalize an answer from base knowledge.',
		candidates.length > 0
			? `Your next response must call skill_load for the best-matching skill among: ${candidates.join(', ')}.`
			: 'Your next response must call skill_load for the best-matching skill from the Active Domain Signals section.',
		"If none of those candidates fits the user's actual ask, call skill_search to find the right skill and then skill_load it.",
		"After the skill is loaded, write the final answer by applying that skill's playbook and output contract.",
		"If you already created or updated an entity this turn (for example a document rewrite), re-apply the loaded skill's contract to that content and update the entity again before finalizing — do not leave un-skill-grounded content as the persisted result."
	].join(' ');
}

/**
 * Research-capture floor (2026-07-25).
 *
 * A turn that runs real web research and persists nothing loses everything it learned the moment
 * the session ends, and the user cannot see that it happened — the reply looks complete.
 *
 * This is enforced in code rather than by prompt guidance because guidance was measured and did
 * not hold. Baseline on the `document-from-vague-description` e2e scenario was 3/5 turns
 * persisting; after explicit prompt instruction it was 1/6, with research volume going UP and
 * document writes going DOWN. `task-complete-cold-reference` is 0/7 lifetime. A skill cannot carry
 * this either: `activation: always_on` is a dead enum (parsed, never acted on), all runtime skills
 * are `progressive`, and across those 10 measured turns the model made exactly one `skill_load`
 * call — none for the research skill.
 *
 * The bar is deliberately low. One durable write of any kind satisfies it; this asks "did anything
 * survive the turn," not "was the right thing written."
 */
const RESEARCH_CAPTURE_MINIMUM_CALLS = 2;

export function countWebResearchCalls(toolExecutions: FastToolExecution[]): number {
	return toolExecutions.filter((execution) =>
		isWebResearchToolName(execution.toolCall.function?.name ?? '')
	).length;
}

/**
 * Forward-carry floor (2026-07-26).
 *
 * A user who says "that's done, I'm just waiting to hear back from them" has stated two things: an
 * outcome and a future. The agent reliably records the first and drops the second — measured
 * **0/17** on `task-complete-cold-reference` across every intervention tried:
 *   - no rule at all: 0/2
 *   - rule added mid-list (position 14 of 20): 0/5
 *   - after the research-budget fix: 0/5
 *   - rule moved to the Final Response Contract, the best boundary position available: 0/5
 *
 * Three placements, zero effect. Instruction cannot carry this one, so it becomes a gate.
 *
 * Unlike the research floor, the trigger cannot be read off tool calls — "the user stated a durable
 * future" is a language judgment. So detection is deliberately conservative AND the repair is
 * model-judged: it asks the model to consider recording, and explicitly permits declining. A false
 * positive therefore costs one extra round, never a spurious write — which matters because
 * `restraint-noop-and-ambiguity` asserts zero writes on a passing mention.
 */
const STATED_FUTURE_PATTERNS: RegExp[] = [
	/\bwaiting (?:to hear|on|for|back)\b/i,
	/\bhear(?:ing)? back\b/i,
	/\bnext (?:step|thing|up) is\b/i,
	/\bblocked (?:on|by)\b/i,
	/\bfollow(?:ing)? up\b/i,
	/\bonce (?:they|he|she|we|it|that|this)\b.*\b(?:then|i'?ll|we'?ll)\b/i,
	/\bi'?ll\b.*\b(?:tomorrow|next week|next month|later this week|by (?:mon|tue|wed|thu|fri|sat|sun))/i,
	/\bsupposed to\b/i,
	/\bstill (?:need|needs|have) to\b/i
];

export function looksLikeStatedFuture(text: string): boolean {
	const normalized = (text ?? '').trim();
	if (!normalized) return false;
	return STATED_FUTURE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * The user's own words for the stated future — the first sentence-ish segment that trips a
 * stated-future pattern — so deterministic capture can title the record verbatim instead of
 * paraphrasing. Falls back to the whole message for patterns that span sentence boundaries
 * ("once they sign off ... then I'll ..."). Null means "nothing matched, do not capture".
 */
export function extractStatedFutureClause(text: string): string | null {
	const normalized = (text ?? '').trim();
	if (!normalized) return null;
	const segments = normalized
		.split(/(?<=[.!?])\s+|\n+/g)
		.map((segment) => segment.trim())
		.filter(Boolean);
	for (const segment of segments) {
		if (STATED_FUTURE_PATTERNS.some((pattern) => pattern.test(segment))) return segment;
	}
	return looksLikeStatedFuture(normalized) ? normalized : null;
}

/**
 * A durable record of something NEW, as opposed to a state change on an entity that already existed.
 * Closing a task is not carrying its follow-up forward, which is the whole failure being gated.
 * Mirrors the four surfaces the scenario accepts: task, document, event, or START HERE edit.
 */
export function didCreateDurableRecord(toolExecutions: FastToolExecution[]): boolean {
	return toolExecutions.some((execution) => {
		if (execution.result.success !== true) return false;
		const name = execution.toolCall.function?.name?.trim() ?? '';
		if (!name) return false;
		if (name.startsWith('create_onto_')) return true;
		if (name === 'create_calendar_event') return true;
		// A document edit is how "update START HERE" lands.
		if (name === 'update_onto_document') return true;
		return false;
	});
}

export function shouldRepairStatedFutureNotRecorded(params: {
	latestUserText: string;
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (params.repairAlreadyInjected) return false;
	if (!looksLikeStatedFuture(params.latestUserText)) return false;
	// Only gate turns that already acted. A pure question or a turn that wrote nothing at all is a
	// different failure, and the other floors own it.
	const wrote = params.toolExecutions.some(
		(execution) => isWriteLedgerToolExecution(execution) && execution.result.success === true
	);
	if (!wrote) return false;
	if (didCreateDurableRecord(params.toolExecutions)) return false;
	// Deliberately NO looksLikePureClarifyingQuestion waiver, unlike the sibling floors. This gate
	// only reaches here when the turn ALREADY acted on the message — a trailing "want me to set a
	// follow-up?" after acting is exactly the prose-instead-of-record failure being gated, and in
	// the 2026-07-26 battery 2/5 runs dropped the future without the gate ever firing. Any '?' in
	// the final text was one of the two code paths that allowed that.
	return true;
}

/**
 * The subset of stated-future phrasings safe to act on DETERMINISTICALLY (the server-side
 * last-resort write in the stream route). The broad STATED_FUTURE_PATTERNS list is fine for the
 * model-judged gate — a false positive there costs one extra round — but a deterministic write
 * turns every false positive into a user-visible task. So this list keeps only unambiguous
 * waiting-state declarations and drops the patterns that routinely appear inside instructions
 * ("follow up", "still need to", "i'll ... tomorrow"), where the stated work is usually the very
 * thing the user just asked the agent to do.
 */
const CONSERVATIVE_STATED_FUTURE_PATTERNS: RegExp[] = [
	/\bwaiting (?:to hear|on|for|back)\b/i,
	/\bhear(?:ing)? back\b/i,
	/\bblocked (?:on|by)\b/i,
	/\bnext (?:step|thing|up) is\b/i
];

export function looksLikeConservativeStatedFuture(text: string): boolean {
	const normalized = (text ?? '').trim();
	if (!normalized) return false;
	return CONSERVATIVE_STATED_FUTURE_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True when the turn made a successful write yet created no new durable record — the
 * forward-carry failure condition, computed from ground truth rather than model output. */
export function didWriteWithoutDurableRecord(toolExecutions: FastToolExecution[]): boolean {
	const wrote = toolExecutions.some(
		(execution) => isWriteLedgerToolExecution(execution) && execution.result.success === true
	);
	return wrote && !didCreateDurableRecord(toolExecutions);
}

export function buildStatedFutureRepairInstruction(): string {
	// Measured 2026-07-26: an earlier version of this instruction offered the model two ways out —
	// "already recorded" OR "it was a passing remark not worth recording". It took the second one
	// on 5/5 runs and wrote nothing. The gate's own preconditions already rule that reading out:
	// it only fires when the user stated a future AND the agent acted AND created no new record.
	// A turn that merely heard a passing mention never reaches here, because it never wrote.
	// So the only legitimate escape left is "it already exists", and it must be evidenced.
	return [
		'The user told you what happens next — what they are waiting on, a decision, a constraint, or a deadline — and this turn changed an existing record without creating anything to hold that future.',
		'Create that record now. Pick exactly one, the smallest that fits: a task if it is work to do, an event if it has a time, or an update to the relevant document or the project START HERE if it is context. One record, not several.',
		'Base it on the user\'s own words — for "waiting to hear back from them", the record is the waiting, not a restatement of what you already closed.',
		'The only reason to skip this is that the future is ALREADY captured in a specific existing record. If you believe that, name that record by title in one short line instead of writing.',
		'Do not re-do the change you already made, do not restate the whole turn, and do not simply confirm the future back to the user in prose — prose is not a record.'
	].join(' ');
}

export function shouldRepairResearchNoPersist(params: {
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (params.repairAlreadyInjected) return false;
	if (countWebResearchCalls(params.toolExecutions) < RESEARCH_CAPTURE_MINIMUM_CALLS) return false;
	// Any successful durable write clears the floor, whatever it wrote.
	if (
		params.toolExecutions.some(
			(execution) =>
				isWriteLedgerToolExecution(execution) && execution.result.success === true
		)
	) {
		return false;
	}
	// Deliberately NO looksLikePureClarifyingQuestion waiver (removed 2026-07-26, DJ call, after
	// the same waiver measurably dropped stated futures 2/5 on the sibling gate). A turn that ran
	// two or more web searches has findings worth keeping regardless of how its reply ends, and a
	// trailing "want me to save this?" is the needless-confirmation anti-pattern, not a genuine
	// blocker. The repair instruction still permits a real blocking question — after persisting.
	return true;
}

/**
 * Organize-commission floor (2026-07-26).
 *
 * "Help me get these documents organized" is a commission, and the failure mode is a turn that
 * reads everything, proposes a structure in prose, and moves nothing. Measured on
 * `project-organize`: 0/3 with a read-only surface (router fix), then 0/3 with the surface
 * mounted and the read-loop ladder steering to execute — the model batches its reads into a few
 * rounds, never trips the ladder, and finalizes voluntarily with a plan. So the floor lives at
 * finalization, like the stated-future gate: a commissioned reorganization may not end with zero
 * writes and no repair round.
 *
 * Deliberately no clarifying-question waiver — that escape hatch measurably gets taken (twice
 * this week).
 */
export function shouldRepairOrganizeCommissionNoExecution(params: {
	latestUserText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (params.repairAlreadyInjected) return false;
	if (!looksLikeProjectDocumentOrganizeTurn(params.latestUserText)) return false;
	const wrote = params.toolExecutions.some(
		(execution) => isWriteLedgerToolExecution(execution) && execution.result.success === true
	);
	return !wrote;
}

export function buildOrganizeCommissionRepairInstruction(): string {
	return [
		'The user commissioned a reorganization and this turn has not changed anything yet — a structure proposed in prose is not a reorganization.',
		'Execute it now: call move_document_in_tree once per document that should live under a parent; multiple calls in this one response are expected.',
		'Group related documents under a sensible existing parent document.',
		'Do not re-read documents you have already read, and do not restate the plan.',
		'Then state exactly what changed, briefly.'
	].join(' ');
}

export function buildResearchNoPersistRepairInstruction(
	toolExecutions: FastToolExecution[]
): string {
	const researchCalls = countWebResearchCalls(toolExecutions);
	return [
		`You ran ${researchCalls} web research calls this turn and saved none of it.`,
		'Those findings exist only in this reply and are lost when the session ends.',
		'Before you finalize, persist what you learned: append to the project document the research was for, or create one if nothing fits.',
		'Include a Sources section listing the URLs used, and a short section naming anything you looked for and could not resolve.',
		'Then write the final reply as 3-5 bottom-line-up-front takeaways plus one line naming the document the detail lives in.',
		'Do not paste the document body into the reply.',
		'If you still need an answer from the user before going further, persist first, then ask — an unanswered question must not cost the research.',
		'If the user explicitly asked you not to save anything, say so in one line instead of writing.'
	].join(' ');
}

export function buildToolRoundBudgetSynthesisInstruction(): string {
	return [
		'The tool-round budget for this turn is exhausted.',
		'Do not request more tools, schemas, skills, searches, or reads.',
		'Answer from the evidence and context already loaded.',
		'If a fact you were about to fetch is still missing, state that limitation briefly and give the best next step instead of continuing tool coordination.'
	].join(' ');
}

export function shouldRepairGatewayMutationNoExecution(params: {
	gatewayModeActive: boolean;
	contextType: string;
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
	latestUserText?: string;
	explicitMutationRequested?: boolean;
}): boolean {
	if (!params.gatewayModeActive) return false;
	if (params.contextType === 'project_create') return false;
	if (params.repairAlreadyInjected) return false;

	const finalText = params.finalText.trim();
	if (!finalText) return true;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	if (mutationOutcomes.succeeded > 0) return false;

	const writeIntentOps = collectGatewayWriteIntentOps(params.toolExecutions);
	const explicitUserWriteIntent =
		params.explicitMutationRequested === true ||
		looksLikeExplicitMutationRequest(params.latestUserText ?? '');
	if (writeIntentOps.length === 0 && !explicitUserWriteIntent) return false;

	if (looksLikePureClarifyingQuestion(finalText)) return false;
	if (
		explicitUserWriteIntent &&
		writeIntentOps.length === 0 &&
		mutationOutcomes.attempted === 0 &&
		looksLikeWriteRefusalDisclosure(finalText)
	) {
		return false;
	}
	if (mutationOutcomes.attempted > 0 && looksLikeWriteFailureDisclosure(finalText)) return false;

	return true;
}

export function buildGatewayMutationNoExecutionRepairInstruction(
	toolExecutions: FastToolExecution[]
): string {
	const plannedWriteOps = collectGatewayWriteIntentOps(toolExecutions);
	const lines = [
		'You have not completed any write yet.',
		'Do not stop after schema discovery or failed writes without either retrying correctly or asking a concise blocker question.',
		'If you cannot execute the requested write after trying, say "I was unable to <requested action>" and briefly explain what blocked it. Make clear that nothing changed.'
	];

	if (plannedWriteOps.length > 0) {
		lines.push(`Write ops already identified: ${plannedWriteOps.join(', ')}.`);
	}

	if (plannedWriteOps.some((op) => op.endsWith('.create'))) {
		lines.push(
			'For create ops, use concrete user-provided titles/names from the current message. Do not emit creates with only project_id.'
		);
	}
	if (plannedWriteOps.some((op) => op.endsWith('.update'))) {
		lines.push(
			'For update ops, reuse exact *_id values already present in structured context and include at least one concrete field to change. Never emit empty argument objects.'
		);
	}
	if (plannedWriteOps.includes('onto.goal.update')) {
		lines.push(
			'For onto.goal.update, copy the exact goal_id from structured context and include a concrete field such as name, description, state_key, or target_date.'
		);
	}
	if (plannedWriteOps.includes('onto.milestone.create')) {
		lines.push(
			'For onto.milestone.create, use a concrete title from the user message, for example "Complete chapters 1-10".'
		);
	}
	if (plannedWriteOps.includes('onto.task.create')) {
		lines.push(
			'For onto.task.create, use a concrete title from the user message, for example "Research literary agents for fantasy genre".'
		);
	}
	if (plannedWriteOps.includes('onto.plan.create')) {
		lines.push(
			'For onto.plan.create, use a concrete name from the user message, for example "Weekday drafting routine".'
		);
	}
	if (plannedWriteOps.includes('cal.event.create')) {
		lines.push(
			'For cal.event.create, include concrete title, start_at, and end_at values before executing.'
		);
	}

	lines.push(
		'Your next response must do one of two things only: emit valid direct tool calls for the concrete writes already identified, or ask one concise blocker question.'
	);

	return lines.join(' ');
}

export function enforceMutationOutcomeIntegrity(
	finalText: string,
	params: {
		contextType: string;
		toolExecutions: FastToolExecution[];
		latestUserText?: string;
		explicitMutationRequested?: boolean;
		expectedWriteToolNames?: string[];
	}
): string {
	if (!finalText) return finalText;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	const successfulWriteToolNames = new Set(
		params.toolExecutions
			.filter((execution) => didWriteExecutionSucceed(execution))
			.map((execution) => execution.toolCall.function?.name?.trim() ?? '')
			.filter(Boolean)
	);
	const missingExpectedWriteTools = Array.from(
		new Set(params.expectedWriteToolNames ?? [])
	).filter((toolName) => !successfulWriteToolNames.has(toolName));
	if (
		mutationOutcomes.attempted === 0 &&
		(params.explicitMutationRequested === true ||
			looksLikeExplicitMutationRequest(params.latestUserText ?? '')) &&
		looksLikeMutationSuccessClaim(finalText)
	) {
		return buildNoExecutionMutationFailureMessage();
	}
	if (
		missingExpectedWriteTools.length > 0 &&
		params.explicitMutationRequested === true &&
		!looksLikeWriteFailureDisclosure(finalText) &&
		!looksLikePureClarifyingQuestion(finalText)
	) {
		return buildPartialMutationDisclosure(
			finalText,
			missingExpectedWriteTools,
			mutationOutcomes.succeeded
		);
	}

	if (mutationOutcomes.attempted > 0) {
		if (mutationOutcomes.failed > 0 && looksLikeBulkMutationSuccessClaim(finalText)) {
			return buildMutationFailureMessage(mutationOutcomes);
		}

		if (mutationOutcomes.succeeded === 0 && looksLikeMutationSuccessClaim(finalText)) {
			return buildMutationFailureMessage(mutationOutcomes);
		}

		const unrepairedFailures = collectUnrepairedFailedWrites(params.toolExecutions);
		if (unrepairedFailures.length > 0 && !looksLikeWriteFailureDisclosure(finalText)) {
			return appendWriteFailureDisclosure(finalText, unrepairedFailures);
		}
	}

	const writeIntentOps = collectGatewayWriteIntentOps(params.toolExecutions);
	if (
		mutationOutcomes.succeeded === 0 &&
		writeIntentOps.length > 0 &&
		looksLikeActionSuccessClaim(finalText)
	) {
		return buildMutationFailureMessage({
			attempted: writeIntentOps.length,
			succeeded: 0,
			failed: writeIntentOps.length,
			writeOps: writeIntentOps
		});
	}

	if (params.contextType === 'project_create') {
		const projectCreateSucceeded = didSuccessfulGatewayOpExecute(
			params.toolExecutions,
			'onto.project.create'
		);
		if (!projectCreateSucceeded && looksLikeProjectCreateSuccessClaim(finalText)) {
			const attemptedProjectCreate = didGatewayOpExecute(
				params.toolExecutions,
				'onto.project.create'
			);
			return attemptedProjectCreate
				? 'I was unable to create the project because the create payload never validated. Nothing changed yet; I need to retry with a complete project payload.'
				: 'I was unable to create the project because the create call did not run. Nothing changed yet; I only loaded the project creation guidance.';
		}
	}

	const unsupportedClaims = collectUnsupportedDocumentClaims(finalText, params.toolExecutions);
	if (unsupportedClaims.length > 0 && !looksLikeDocumentClaimCorrection(finalText)) {
		return appendDocumentClaimCorrection(finalText, unsupportedClaims);
	}

	return finalText;
}

function buildPartialMutationDisclosure(
	finalText: string,
	missingToolNames: string[],
	successfulWriteCount: number
): string {
	const remaining = missingToolNames.map(describeWriteTool).join(', ');
	const status =
		successfulWriteCount > 0
			? 'I completed only part of the requested change.'
			: 'The requested change has not run yet.';
	return `${finalText.trim()}\n\n${status} Still unfinished: ${remaining}. The request remains pending.`;
}

function describeWriteTool(toolName: string): string {
	const match =
		/^(create|update|delete)_onto_(document|task|project|goal|plan|milestone|risk)$/.exec(
			toolName
		);
	if (match) {
		const [, action, entity] = match;
		return `${entity} ${action}`;
	}
	if (toolName === 'create_calendar_event') return 'event creation';
	if (toolName === 'update_calendar_event') return 'event update';
	if (toolName === 'delete_calendar_event') return 'event deletion';
	if (toolName === 'move_document_in_tree') return 'document organization';
	if (toolName === 'link_onto_entities') return 'entity link';
	if (toolName === 'unlink_onto_edge') return 'entity unlink';
	return toolName.replaceAll('_', ' ');
}

export function buildToolValidationRepairInstruction(
	issues: ToolValidationIssue[],
	gatewayModeActive = false
): string {
	const hasGatewayIssue =
		gatewayModeActive &&
		issues.some((issue) => typeof issue.op === 'string' && issue.op.length > 0);
	const gatewayRequiredFieldFailures = hasGatewayIssue
		? extractGatewayRequiredFieldFailuresFromValidationIssues(issues)
		: [];
	const hasProjectCreateIssue =
		gatewayModeActive && issues.some((issue) => issue.op === 'onto.project.create');
	const hasProjectCreateRelationshipIssue =
		hasProjectCreateIssue &&
		issues.some(
			(issue) =>
				issue.op === 'onto.project.create' &&
				issue.errors.some((error) => error.includes('relationships['))
		);
	const hasTaskCreateTitleIssue = issues.some(
		(issue) =>
			issue.op === 'onto.task.create' &&
			issue.errors.some((error) => parseRequiredParameterFailure(error) === 'title')
	);
	const hasTaskUpdateIdIssue = issues.some(
		(issue) =>
			issue.op === 'onto.task.update' &&
			issue.errors.some((error) => parseRequiredParameterFailure(error) === 'task_id')
	);
	const hasTaskUpdateEmptyIssue = issues.some(
		(issue) =>
			issue.op === 'onto.task.update' &&
			issue.errors.some((error) => error.includes('No update fields provided'))
	);
	const hasSameRoundDiscoveryExecutionIssue = issues.some((issue) =>
		issue.errors.some(
			(error) =>
				error.includes('in the same response as') &&
				error.includes('Wait for the discovery result')
		)
	);
	const lines = [
		'One or more tool calls failed validation.',
		'Do not guess or fabricate IDs. Never use placeholders.',
		'Never truncate, abbreviate, or elide IDs (no "...", prefixes, or short forms).',
		'Tool calls are executed exactly as emitted. Return strict JSON arguments with concrete final values only.',
		'Treat each validation error as literal feedback about the exact missing field or invalid argument, and fix that exact field before retrying.',
		'If exact IDs are already present in the current structured context, reuse them directly instead of re-listing or reloading the same entities.',
		'If the fix is fully determined from the current context, return only corrected tool calls with arguments.',
		'If a required user value is still missing, do not call a tool; ask one concise clarifying question.'
	];
	if (hasGatewayIssue) {
		const exactHelpPaths = Array.from(
			new Set(
				issues
					.map((issue) => issue.op)
					.filter((op): op is string => typeof op === 'string' && op.length > 0)
			)
		);
		lines.push(
			'Gateway pattern: start from context and capability, load a skill when the workflow matters, identify the exact op, inspect its schema if needed, then execute.'
		);
		lines.push(
			'If the skill or current context already identifies the exact op, skip tool_search. Otherwise use tool_search only when the exact op is unknown. Search for the operation you need, not workspace data. Good examples: {"capability":"overview"}, {"entity":"task","kind":"write","query":"update existing task state"}, or {"group":"onto","entity":"document","kind":"write","query":"move document in tree"}.'
		);
		lines.push(
			'If the work is multi-step or easy to get wrong, load the relevant skill first. Exception: in project_create context, project creation guidance and the direct create_onto_project tool are already preloaded, so retry create_onto_project directly when the payload can be inferred.'
		);
		lines.push(
			'For first-time or uncertain writes, call tool_schema({ op: "<exact op>" }) before retrying the direct tool.'
		);
		lines.push(
			'After tool_schema, call the direct tool named by the schema with concrete arguments. Reuse exact IDs from structured context or prior results, and do not send empty or guessed fields.'
		);
		lines.push(
			'If a write still fails because an exact *_id is missing, use search/list/tree candidates and retry with the exact *_id.'
		);
		if (hasTaskCreateTitleIssue) {
			lines.push(
				'For onto.task.create, do not emit a blank create. Include a concrete title taken from the user request before calling create_onto_task.'
			);
		}
		if (hasTaskUpdateIdIssue || hasTaskUpdateEmptyIssue) {
			lines.push(
				'For onto.task.update, if the task is already listed in structured context, copy its exact task_id directly into task_id.'
			);
			lines.push(
				'Never emit onto.task.update with empty arguments. Include task_id plus at least one concrete field to change.'
			);
		}
		if (hasSameRoundDiscoveryExecutionIssue) {
			lines.push(
				'Do not combine exact-op discovery and write execution in the same response. If you call tool_schema({ op: "<exact op>" }) for a write, stop there, wait for that result, and emit the direct tool call in the next response.'
			);
		}
		if (hasProjectCreateIssue) {
			lines.push(
				'onto.project.create requires input.project, input.entities, and input.relationships. input.project must include name and type_key.'
			);
			lines.push(
				'Minimal valid example: create_onto_project({ project: { name: "Project Name", type_key: "project.business.initiative" }, entities: [], relationships: [] }).'
			);
			lines.push(
				'Keep project creation minimal. Add one goal only if the user stated the outcome, add tasks only for concrete actions mentioned, and use clarifications[] only when critical information cannot be inferred.'
			);
			lines.push(
				'If a previous onto.project.create attempt already included a full payload, reuse that payload and patch only the failing fields. Never replace a prior complete create payload with input:{}.'
			);
			if (hasProjectCreateRelationshipIssue) {
				lines.push(
					'Project-create relationships must use entity refs with temp_id and kind. Valid forms are [ { temp_id, kind }, { temp_id, kind } ] or { from: { temp_id, kind }, to: { temp_id, kind } }.'
				);
				lines.push(
					'Do not use raw string pairs like ["g1","t1"] unless the runtime can infer both kinds from input.entities; prefer the explicit object form.'
				);
			}
		}
		lines.push(...buildGatewayCreateFieldRepairLines(gatewayRequiredFieldFailures));
		if (exactHelpPaths.length > 0) {
			lines.push(
				`Load exact-op help before retrying: ${exactHelpPaths
					.map((path) => `tool_schema({ op: "${path}" })`)
					.join(', ')}.`
			);
		}
	}

	for (const issue of issues) {
		lines.push(`Tool "${issue.toolName || 'unknown'}": ${issue.errors.join(' ')}`);
	}

	return lines.join(' ');
}

export function hasGatewayCreateFieldNoProgressFailure(
	failures: GatewayRequiredFieldFailure[]
): boolean {
	return failures.some(
		(failure) =>
			(failure.op === 'onto.task.create' && failure.field === 'title') ||
			(failure.op === 'onto.milestone.create' && failure.field === 'title') ||
			(failure.op === 'onto.goal.create' && failure.field === 'name') ||
			(failure.op === 'onto.plan.create' && failure.field === 'name')
	);
}

export function buildGatewayCreateFieldNoProgressRepairInstruction(
	failures: GatewayRequiredFieldFailure[]
): string {
	const lines = [
		'You are repeating create ops without the required user-facing title/name field.',
		'Do not emit the same blank create again.',
		'If the current user message already contains the goal, milestone, plan, or task wording, copy that text directly into title or name before calling the direct create tool.'
	];

	if (
		failures.some((failure) => failure.op === 'onto.task.create' && failure.field === 'title')
	) {
		lines.push(
			'For onto.task.create, use a concrete task title from the user message, for example "Research literary agents for fantasy genre".'
		);
	}
	if (
		failures.some(
			(failure) => failure.op === 'onto.milestone.create' && failure.field === 'title'
		)
	) {
		lines.push(
			'For onto.milestone.create, use a concrete milestone title from the user message, for example "Complete chapters 1-10".'
		);
	}
	if (failures.some((failure) => failure.op === 'onto.goal.create' && failure.field === 'name')) {
		lines.push(
			'For onto.goal.create, use a concrete goal name from the user message, for example "Finish first draft by March 31st".'
		);
	}
	if (failures.some((failure) => failure.op === 'onto.plan.create' && failure.field === 'name')) {
		lines.push(
			'For onto.plan.create, use a concrete plan name from the user message, for example "Weekday drafting routine".'
		);
	}

	lines.push(
		'Your next response must do one of two things only: emit valid direct create-tool calls with concrete title/name values, or ask one concise clarifying question if the user truly did not provide those values.'
	);

	return lines.join(' ');
}

export function buildGatewayRequiredFieldRepairInstruction(
	failures: GatewayRequiredFieldFailure[]
): string {
	const labels = failures.map((failure) => `${failure.op} -> ${failure.field}`).join(', ');
	const hasProjectCreateFailure = failures.some(
		(failure) => failure.op === 'onto.project.create'
	);
	const hasTaskCreateTitleFailure = failures.some(
		(failure) => failure.op === 'onto.task.create' && failure.field === 'title'
	);
	const hasTaskUpdateIdFailure = failures.some(
		(failure) => failure.op === 'onto.task.update' && failure.field === 'task_id'
	);
	return [
		`Repeated required-field validation failures detected: ${labels}.`,
		'Do not use tools willy-nilly. A missing required parameter means you do not understand that op well enough to execute it yet.',
		'For routine status questions, prefer get_workspace_overview or get_project_overview instead of repeating empty search/list calls.',
		'Do not call write tools with empty argument objects.',
		'For search ops, include query (for example onto.project.search, onto.task.search, onto.search).',
		'If query is unclear, ask one concise clarifying question instead of repeating empty search args.',
		'Before retrying any create/update/delete op, call tool_schema({ op: "<exact op>" }) and follow that schema exactly.',
		'If exact IDs are already present in the current structured context, reuse them directly. If the named entity is already listed there, copy its exact UUID into the direct tool arguments instead of searching again.',
		'Do not emit another empty update after tool_schema. Use the current structured context to fill the required *_id and include at least one concrete field to change.',
		'If the missing value is user input rather than an ID, ask one concise clarifying question instead of calling a tool.',
		'For onto.<entity>.update, include <entity>_id and at least one concrete field to change.',
		'For onto.<entity>.delete, include <entity>_id.',
		'For cal.event.update, include event_id or onto_event_id plus at least one concrete field to change.',
		...(hasTaskCreateTitleFailure
			? [
					'For onto.task.create, do not emit a blank create. Include a concrete title taken from the user request, for example "Revise chapter 2 dialogue between Elena and Master Thorne".'
				]
			: []),
		...(hasTaskUpdateIdFailure
			? [
					'For onto.task.update, if the task is already listed in structured context, copy its exact task_id directly into task_id instead of retrying with empty arguments.',
					'If the user is referring to an in-scope task like an outline or chapter task, map that reference to the exact task_id before calling update_onto_task.'
				]
			: []),
		...(hasProjectCreateFailure
			? [
					'For onto.project.create, include input.project with project.name and project.type_key, plus input.entities and input.relationships arrays.',
					'Minimal valid project creation shape: { project: { name, type_key }, entities: [], relationships: [] }.',
					'If the user gave an outcome, add one goal. If the user gave explicit actions, add only those tasks. If critical detail is missing, include clarifications[] and still send the project skeleton.',
					'If a previous onto.project.create attempt already included a full payload, reuse that payload and patch only the failing fields. Never replace a prior complete create payload with input:{}.'
				]
			: []),
		...buildGatewayCreateFieldRepairLines(failures),
		'For document organization, get IDs from onto.document.tree.get result.unlinked/documents and pass exact input.document_id for delete/move.',
		'If IDs are still unclear, ask one concise clarifying question instead of repeating failed writes.'
	].join(' ');
}

export type ReadLoopRepairInstructionLevel = 'nudge' | 'stop_and_answer' | 'must_synthesize';

export function buildReadLoopRepairInstruction(
	readOps: string[],
	options: {
		level?: ReadLoopRepairInstructionLevel;
		roundsRemaining?: number;
		/**
		 * 'research_budget' swaps the stuck-loop framing for research framing:
		 * the turn was gathering web evidence productively and simply reached
		 * its budget. Loop framing here makes weak models open their answer
		 * with "I hit a read loop" — misdescribing a healthy research turn.
		 */
		framing?: 'read_loop' | 'research_budget';
		/**
		 * The turn is a commissioned write (e.g. "help me get these documents organized") whose
		 * write tools are mounted but unused. Without this, every ladder level steers to "answer
		 * from existing results" — on a commission that instruction produces a prose plan instead
		 * of the requested change. Measured 2026-07-26 on project-organize: the model read six
		 * documents (correct), then the ladder told it to answer, and it obeyed — 0/3 with the
		 * write tools sitting mounted and untouched.
		 */
		pendingWriteCommission?: { toolNames: string[] };
	} = {}
): string {
	const opsLabel = readOps.length > 0 ? readOps.join(', ') : 'read-only ops';
	const roundsRemaining =
		typeof options.roundsRemaining === 'number' && Number.isFinite(options.roundsRemaining)
			? Math.max(0, Math.floor(options.roundsRemaining))
			: null;
	const roundsRemainingLine =
		roundsRemaining === null
			? null
			: `Tool rounds remaining before the safety cap: ${roundsRemaining}.`;
	const level = options.level ?? 'nudge';

	if (level === 'must_synthesize' && options.framing === 'research_budget') {
		// This instruction previously said "do not call more tools" outright, which forbade the
		// one write that keeps the research. Measured effect: turns that researched hardest were
		// structurally prevented from saving anything, and the harder the turn researched, the
		// more reliably it lost everything. Stopping *research* is the intent; blocking the
		// capture write was collateral. See research_capture floor in this file.
		return [
			'Research budget reached: you have gathered enough web evidence for this turn.',
			roundsRemainingLine,
			'Do not run any more searches or page visits.',
			'First persist what you learned in a single write: append to the project document this research was for, or create one if nothing fits, including a Sources section listing the URLs used. That one write is the only tool call allowed.',
			'Then write the final answer from the evidence already collected as bottom-line-up-front takeaways, naming the document the detail lives in; state any remaining gaps concisely.'
		]
			.filter((line): line is string => Boolean(line))
			.join(' ');
	}

	const commissionTools = options.pendingWriteCommission?.toolNames ?? [];
	const commissionToolsLabel = commissionTools.join(', ');

	if (level === 'must_synthesize') {
		if (commissionTools.length > 0) {
			return [
				'Context gathering is over — execute the requested change now.',
				roundsRemainingLine,
				'Do not call more read tools.',
				`Use only these write tools: ${commissionToolsLabel}.`,
				'Multiple calls to the same write tool in this one response are expected — for a reorganization, one move call per document that needs a new parent.',
				'Then give a short final answer stating exactly what changed.'
			]
				.filter((line): line is string => Boolean(line))
				.join(' ');
		}
		return [
			'Read-loop hard stop: synthesize now.',
			`Repeated ops: ${opsLabel}.`,
			roundsRemainingLine,
			'Do not call more read tools in the next response.',
			'Answer from the existing tool results now; state uncertainty or missing facts concisely.'
		]
			.filter((line): line is string => Boolean(line))
			.join(' ');
	}

	if (level === 'stop_and_answer') {
		if (commissionTools.length > 0) {
			return [
				'Read-loop escalation: stop broad context gathering.',
				`Repeated ops: ${opsLabel}.`,
				roundsRemainingLine,
				'Only call another read tool if one specific missing fact blocks the write.',
				`Otherwise begin executing the requested change now with ${commissionToolsLabel}.`,
				'Do not end the turn with only a proposal — the user asked for the change to be made.'
			]
				.filter((line): line is string => Boolean(line))
				.join(' ');
		}
		return [
			'Read-loop escalation: stop broad context gathering.',
			`Repeated ops: ${opsLabel}.`,
			roundsRemainingLine,
			'Only call another read tool if one specific missing fact blocks the answer.',
			'Otherwise answer from the existing results now.'
		]
			.filter((line): line is string => Boolean(line))
			.join(' ');
	}

	if (commissionTools.length > 0) {
		return [
			'Read-loop nudge: you are repeating read-only tool calls without making progress.',
			`Repeated ops: ${opsLabel}.`,
			roundsRemainingLine,
			`You already have enough context to start the requested change — begin executing it now with ${commissionToolsLabel}.`,
			'If required IDs are still missing, ask one concise clarification question instead of repeating the same reads.'
		]
			.filter((line): line is string => Boolean(line))
			.join(' ');
	}

	return [
		'Read-loop nudge: you are repeating read-only tool calls without making progress.',
		`Repeated ops: ${opsLabel}.`,
		roundsRemainingLine,
		'Stop reloading the same data. Use the existing results to answer, or perform the next required action.',
		'If required IDs are still missing, ask one concise clarification question instead of repeating the same reads.'
	]
		.filter((line): line is string => Boolean(line))
		.join(' ');
}

export function buildConsolidatedRepairInstruction(instructions: string[]): string {
	const unique = Array.from(
		new Set(
			instructions
				.map((instruction) => instruction.trim())
				.filter((instruction) => instruction.length > 0)
		)
	);
	if (unique.length === 0) return '';
	if (unique.length === 1) return unique[0] ?? '';

	const lines = [
		'Repair instructions for the next response:',
		...unique.map((instruction, index) => `${index + 1}. ${instruction}`),
		'Apply all relevant items in a single corrected tool response.'
	];
	return lines.join('\n');
}

export function collectGatewayWriteIntentOps(toolExecutions: FastToolExecution[]): string[] {
	const ops = new Set<string>();

	for (const execution of toolExecutions) {
		if (isDuplicateWriteSkippedExecution(execution)) continue;
		const toolName = execution.toolCall.function?.name?.trim();
		if (!toolName) continue;

		const executedOp = getGatewayExecOp(execution);
		if (executedOp && isWriteLikeOperation(executedOp)) {
			ops.add(executedOp);
			continue;
		}

		if (toolName === 'tool_schema') {
			const parsed = parseToolArguments(execution.toolCall.function?.arguments);
			const rawReference = typeof parsed.args.op === 'string' ? parsed.args.op : '';
			const normalizedOp = rawReference ? normalizeGatewayOpName(rawReference.trim()) : '';
			if (normalizedOp && isWriteLikeOperation(normalizedOp)) {
				ops.add(normalizedOp);
			}
		}

		if (toolName === 'tool_search') {
			const payload = execution.result.result;
			const matches =
				payload &&
				typeof payload === 'object' &&
				Array.isArray((payload as Record<string, unknown>).matches)
					? ((payload as Record<string, unknown>).matches as Array<
							Record<string, unknown>
						>)
					: [];
			for (const match of matches) {
				const rawOp = typeof match?.op === 'string' ? match.op.trim() : '';
				const normalizedOp = rawOp ? normalizeGatewayOpName(rawOp) : '';
				if (normalizedOp && isWriteLikeOperation(normalizedOp)) {
					ops.add(normalizedOp);
				}
			}
		}
	}

	return Array.from(ops).sort();
}

function looksLikePureClarifyingQuestion(text: string): boolean {
	return text.includes('?') && !looksLikeActionSuccessClaim(text);
}

export function looksLikeExplicitMutationRequest(text: string): boolean {
	return looksLikeFastChatMutationRequest(text);
}

function looksLikeActionSuccessClaim(text: string): boolean {
	return (
		looksLikeMutationSuccessClaim(text) ||
		looksLikeBulkMutationSuccessClaim(text) ||
		looksLikeProjectCreateSuccessClaim(text)
	);
}

function collectUnsupportedDocumentClaims(
	finalText: string,
	toolExecutions: FastToolExecution[]
): string[] {
	const corrections: string[] = [];

	if (looksLikeDocumentLinkClaim(finalText) && !hasSuccessfulDocumentLinkWrite(toolExecutions)) {
		corrections.push('I did not create a document link.');
	}

	if (
		looksLikeDocumentPlacementClaim(finalText) &&
		!hasSuccessfulDocumentPlacementWrite(toolExecutions)
	) {
		corrections.push('I did not move or place the document in the tree.');
	}

	return corrections;
}

// Require the link/placement verb and the document noun to appear within the
// same sentence or short clause. A whole-answer match produced false positives
// when unrelated clauses mentioned "tasks linked to the goal" alongside "context
// document" elsewhere in the response.
const DOC_LINK_VERBS = /(?:linked|cross-linked|attached|connected)/i;
const DOC_PLACEMENT_VERBS = /(?:placed|moved|nested|organized|organised)/i;
const DOC_NOUN = /(?:doc|document)s?/i;
const CLAUSE_GAP = /[^.!?\n]{0,80}/;

function hasClauseLevelMatch(text: string, verb: RegExp, noun: RegExp): boolean {
	const verbThenNoun = new RegExp(
		`\\b${verb.source}\\b${CLAUSE_GAP.source}\\b${noun.source}\\b`,
		'i'
	);
	const nounThenVerb = new RegExp(
		`\\b${noun.source}\\b${CLAUSE_GAP.source}\\b${verb.source}\\b`,
		'i'
	);
	return verbThenNoun.test(text) || nounThenVerb.test(text);
}

function looksLikeDocumentLinkClaim(text: string): boolean {
	if (
		/\b(?:not|did not|didn't|was not|wasn't|no)\s+(?:linked|cross-linked|attached|connected)\b/i.test(
			text
		)
	) {
		return false;
	}
	return hasClauseLevelMatch(text, DOC_LINK_VERBS, DOC_NOUN);
}

function looksLikeDocumentPlacementClaim(text: string): boolean {
	if (
		/\b(?:not|did not|didn't|was not|wasn't|no)\s+(?:placed|moved|nested|organized|organised)\b/i.test(
			text
		)
	) {
		return false;
	}
	return hasClauseLevelMatch(text, DOC_PLACEMENT_VERBS, DOC_NOUN);
}

function hasSuccessfulDocumentLinkWrite(toolExecutions: FastToolExecution[]): boolean {
	return toolExecutions.some((execution) => {
		if (!didWriteExecutionSucceed(execution)) return false;
		const op = getWriteOperationName(execution);
		return (
			op === 'link_onto_entities' ||
			op === 'onto.edge.link' ||
			op === 'create_task_document' ||
			op === 'onto.task.docs.create_or_attach'
		);
	});
}

function hasSuccessfulDocumentPlacementWrite(toolExecutions: FastToolExecution[]): boolean {
	return toolExecutions.some((execution) => {
		if (!didWriteExecutionSucceed(execution)) return false;
		const op = getWriteOperationName(execution);
		if (op === 'move_document_in_tree' || op === 'onto.document.tree.move') return true;
		if (op !== 'create_onto_document' && op !== 'onto.document.create') return false;

		const parsed = parseToolArguments(execution.toolCall.function?.arguments);
		const parentId = parsed.args.parent_id;
		return typeof parentId === 'string' && parentId.trim().length > 0;
	});
}

function looksLikeDocumentClaimCorrection(text: string): boolean {
	return /\b(?:did not|didn't|not linked|not placed|not moved|not organized|not organised|no document link)\b/i.test(
		text
	);
}

function appendDocumentClaimCorrection(finalText: string, corrections: string[]): string {
	return `${finalText.trim()}\n\nCorrection: ${corrections.join(' ')}`;
}

function looksLikeProjectCreateSuccessClaim(text: string): boolean {
	const normalized = text.toLowerCase();
	return (
		/\bproject\b/.test(normalized) &&
		(/\bcreated successfully\b/.test(normalized) ||
			/\bi(?:'ve| have)?\s+created\b/.test(normalized) ||
			/\bcreated the project\b/.test(normalized) ||
			/\bcreated\b[^.?!]*\bproject\b/.test(normalized) ||
			/\bproject\b[^.?!]*\bcreated\b/.test(normalized))
	);
}

type MutationOutcomeSummary = {
	attempted: number;
	succeeded: number;
	failed: number;
	writeOps: string[];
};

function summarizeMutationOutcomes(toolExecutions: FastToolExecution[]): MutationOutcomeSummary {
	const writeOps: string[] = [];
	let succeeded = 0;
	let failed = 0;

	for (const execution of toolExecutions) {
		if (isDuplicateWriteSkippedExecution(execution)) continue;
		const writeOp = getWriteOperationName(execution);
		if (!writeOp) continue;
		writeOps.push(writeOp);
		if (didWriteExecutionSucceed(execution)) {
			succeeded += 1;
		} else {
			failed += 1;
		}
	}

	return {
		attempted: writeOps.length,
		succeeded,
		failed,
		writeOps
	};
}

type FailedWriteDisclosure = {
	op: string;
	error?: string;
};

function collectUnrepairedFailedWrites(
	toolExecutions: FastToolExecution[]
): FailedWriteDisclosure[] {
	const failures: FailedWriteDisclosure[] = [];

	for (let index = 0; index < toolExecutions.length; index += 1) {
		const execution = toolExecutions[index];
		if (!execution) continue;
		if (isDuplicateWriteSkippedExecution(execution)) continue;
		const writeOp = getWriteOperationName(execution);
		if (!writeOp || didWriteExecutionSucceed(execution)) continue;
		if (hasLaterSuccessfulRetry(toolExecutions, index, execution, writeOp)) continue;
		failures.push({
			op: writeOp,
			error: typeof execution.result.error === 'string' ? execution.result.error : undefined
		});
	}

	return failures;
}

function hasLaterSuccessfulRetry(
	toolExecutions: FastToolExecution[],
	failedIndex: number,
	failedExecution: FastToolExecution,
	failedOp: string
): boolean {
	const failedTargetId = getPrimaryMutationTargetId(failedExecution);
	for (let index = failedIndex + 1; index < toolExecutions.length; index += 1) {
		const execution = toolExecutions[index];
		if (!execution) continue;
		if (getWriteOperationName(execution) !== failedOp) continue;
		if (!didWriteExecutionSucceed(execution)) continue;
		if (!failedTargetId) return true;
		if (getPrimaryMutationTargetId(execution) === failedTargetId) return true;
		if (
			looksLikeNotFoundError(failedExecution.result.error) &&
			hasSameMutationIntentIgnoringIds(failedExecution, execution)
		) {
			return true;
		}
	}
	return false;
}

function looksLikeNotFoundError(error: unknown): boolean {
	return isNotFoundFailure(classifyToolFailure({ message: error }));
}

function hasSameMutationIntentIgnoringIds(
	failedExecution: FastToolExecution,
	successfulExecution: FastToolExecution
): boolean {
	const failedComparable = buildMutationIntentComparable(failedExecution);
	const successfulComparable = buildMutationIntentComparable(successfulExecution);
	return (
		failedComparable !== null &&
		successfulComparable !== null &&
		failedComparable === successfulComparable
	);
}

function buildMutationIntentComparable(execution: FastToolExecution): string | null {
	const parsed = parseToolArguments(execution.toolCall.function?.arguments);
	const comparable: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(parsed.args)) {
		if (isEntityIdArgKey(key)) continue;
		comparable[key] = value;
	}
	if (Object.keys(comparable).length === 0) return null;
	return stableStringify(comparable);
}

function isEntityIdArgKey(key: string): boolean {
	return key === 'id' || key.endsWith('_id') || key.endsWith('Id');
}

function stableStringify(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(',')}}`;
}

function getPrimaryMutationTargetId(execution: FastToolExecution): string | null {
	const parsed = parseToolArguments(execution.toolCall.function?.arguments);
	const args = parsed.args;
	const keys = [
		'task_id',
		'goal_id',
		'plan_id',
		'document_id',
		'milestone_id',
		'risk_id',
		'entity_id',
		'edge_id'
	];
	for (const key of keys) {
		const value = args[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return `${key}:${value.trim()}`;
		}
	}
	return null;
}

function getWriteOperationName(execution: FastToolExecution): string | null {
	const toolName = execution.toolCall.function?.name?.trim();
	if (!toolName) return null;
	if (isDuplicateWriteSkippedExecution(execution)) return null;
	if (doesToolExecutionRequireUserAction(execution)) return null;

	const op = getGatewayExecOp(execution) ?? toolName;
	return isWriteLikeOperation(op) ? op : null;
}

function didWriteExecutionSucceed(execution: FastToolExecution): boolean {
	const toolName = execution.toolCall.function?.name?.trim();
	if (!toolName) return false;
	if (isDuplicateWriteSkippedExecution(execution)) return false;
	return didGatewayExecSucceed(execution);
}

const BULK_MUTATION_SUCCESS_CLAIM_PATTERNS = [
	/\bupdates?\s+confirmed\b/i,
	/\bchanges?\s+confirmed\b/i,
	/\bcompleted\s+updates?\b/i
];

const MUTATION_SUCCESS_CLAIM_PATTERNS = [
	/^\s*done\b/i,
	/\bmarked(?:\s+\w+){0,4}\s+(?:done|complete|completed)\b/i,
	/\b(?:i|we)(?:'ve| have)?\s+(?:created|updated|deleted|removed|moved|linked|unlinked|scheduled|rescheduled|set)\b/i,
	/\b(?:i|we)(?:'ve| have)?\s+(?:merged|archived)\b/i,
	/\b(?:created|updated|deleted|removed|moved|merged|archived|linked|unlinked|scheduled|rescheduled|set)\s+successfully\b/i,
	/\b(?:has|have|was|were)\s+been\s+(?:created|updated|deleted|removed|moved|merged|archived|linked|unlinked|scheduled|rescheduled|set|marked)\b/i,
	/\b(?:is|are)\s+back\s+to\s+(?:done|complete|completed|todo|to-do|open|in progress|blocked|cancelled|canceled)\b/i,
	/\bis\s+now\s+(?:done|complete|completed|updated|merged|archived|scheduled|rescheduled)\b/i
];

function looksLikeBulkMutationSuccessClaim(text: string): boolean {
	return BULK_MUTATION_SUCCESS_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeMutationSuccessClaim(text: string): boolean {
	return MUTATION_SUCCESS_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeWriteFailureDisclosure(text: string): boolean {
	return /\b(?:failed|unable|could not|did not|didn't|not saved|not updated|not created|nothing changed|tool error)\b/i.test(
		text
	);
}

function looksLikeWriteRefusalDisclosure(text: string): boolean {
	return (
		/\b(?:won't|will not|not going to|decline to|refuse to)\b/i.test(text) ||
		/\b(?:cannot|can't)\b[^.?!\n]{0,120}\b(?:protected|not allowed|outside|permission|scope|unsafe|fixture)\b/i.test(
			text
		)
	);
}

function appendWriteFailureDisclosure(
	finalText: string,
	failures: FailedWriteDisclosure[]
): string {
	const uniqueFailures = groupFailedWriteDisclosures(failures);
	const labels = uniqueFailures.map((failure) => formatWriteFailureLabel(failure));
	const subject =
		uniqueFailures.length === 1 ? 'One write did not complete' : 'Some writes did not complete';
	const persistedPart = uniqueFailures.length === 1 ? 'that part' : 'those parts';
	return `${finalText.trim()}\n\n${subject}: ${labels.join('; ')}. I did not persist ${persistedPart}.`;
}

function groupFailedWriteDisclosures(failures: FailedWriteDisclosure[]): FailedWriteDisclosure[] {
	return Array.from(
		new Map(
			failures.map((failure) => [buildFailedWriteDisclosureGroupKey(failure), failure])
		).values()
	);
}

function buildFailedWriteDisclosureGroupKey(failure: FailedWriteDisclosure): string {
	const classified = classifyToolFailure({
		message: failure.error,
		canonicalOp: failure.op
	});
	return classified?.canonicalOp ?? failure.op;
}

function formatWriteFailureLabel(failure: FailedWriteDisclosure): string {
	const label = formatWriteOperationLabel(failure.op);
	const error = sanitizeFailureReason(failure.error);
	return error ? `${label} failed (${error})` : `${label} failed`;
}

function sanitizeFailureReason(error: string | undefined): string {
	if (!error) return '';
	const compact = error.replace(/\s+/g, ' ').trim();
	if (!compact) return '';
	return compact.length <= 140 ? compact : `${compact.slice(0, 137)}...`;
}

function formatWriteOperationLabel(op: string): string {
	const normalized = normalizeGatewayOpName(op);
	const parts = normalized.split('.');
	if (parts.length >= 3) {
		return `${parts[1]} ${parts[2]}`;
	}
	return normalized
		.replace(/^update_onto_/, '')
		.replace(/^create_onto_/, '')
		.replace(/_/g, ' ');
}

function buildMutationFailureMessage(summary: MutationOutcomeSummary): string {
	const dominantOp = summary.writeOps[0] ?? '';

	if (summary.succeeded === 0) {
		if (dominantOp.endsWith('.update') || dominantOp.startsWith('update_')) {
			return 'I was unable to complete that update because no write call succeeded. Nothing changed yet; I need to retry with the exact ID and valid arguments.';
		}
		if (dominantOp.endsWith('.create') || dominantOp.startsWith('create_')) {
			return 'I was unable to create that because no write call succeeded. Nothing changed yet; I need to retry with a valid payload.';
		}
		if (dominantOp.endsWith('.delete') || dominantOp.startsWith('delete_')) {
			return 'I was unable to complete that delete because no write call succeeded. Nothing changed yet; I need to retry after confirming the exact target.';
		}
		return 'I was unable to complete that change because no write call succeeded. Nothing changed yet; I need to retry with the exact target and valid arguments.';
	}

	return 'Some requested changes did not go through. I need to verify the final state before I confirm any updates.';
}

function buildNoExecutionMutationFailureMessage(): string {
	return 'I was unable to complete that change because no write call ran. Nothing changed yet; I need to retry with the exact target and valid arguments.';
}

function buildGatewayCreateFieldRepairLines(failures: GatewayRequiredFieldFailure[]): string[] {
	const hasFailure = (op: string, field?: string): boolean =>
		failures.some(
			(failure) => failure.op === op && (field === undefined || failure.field === field)
		);

	const lines: string[] = [];

	if (hasFailure('onto.goal.create')) {
		lines.push(
			'For onto.goal.create, include project_id and name. Goal titles use name, not title.'
		);
		lines.push(
			'Minimal valid goal create shape: create_onto_goal({ project_id: "<project_id_uuid>", name: "Finish first draft by March 31st" }).'
		);
	}

	if (hasFailure('onto.milestone.create')) {
		lines.push(
			'For onto.milestone.create, include project_id and title. Milestone titles use title, not name.'
		);
		lines.push(
			'If the milestone belongs to a known goal, also include goal_id. Minimal example: create_onto_milestone({ project_id: "<project_id_uuid>", title: "Complete chapters 1-10" }).'
		);
	}

	if (hasFailure('onto.plan.create')) {
		lines.push(
			'For onto.plan.create, include project_id and name. Plan titles use name, not title.'
		);
		lines.push(
			'If the plan belongs under a known goal or milestone, include goal_id or milestone_id. Minimal example: create_onto_plan({ project_id: "<project_id_uuid>", name: "Weekday drafting routine" }).'
		);
	}

	return lines;
}
