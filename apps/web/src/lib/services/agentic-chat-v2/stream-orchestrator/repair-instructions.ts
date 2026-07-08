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
import {
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isWriteLikeOperation
} from './tool-classification';
import { extractGatewayRequiredFieldFailuresFromValidationIssues } from './round-analysis';
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
}): boolean {
	if (!params.gatewayModeActive) return false;
	if (params.contextType === 'project_create') return false;
	if (params.repairAlreadyInjected) return false;

	const finalText = params.finalText.trim();
	if (!finalText) return true;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	if (mutationOutcomes.succeeded > 0) return false;

	const writeIntentOps = collectGatewayWriteIntentOps(params.toolExecutions);
	const explicitUserWriteIntent = looksLikeExplicitMutationRequest(params.latestUserText ?? '');
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
	params: { contextType: string; toolExecutions: FastToolExecution[]; latestUserText?: string }
): string {
	if (!finalText) return finalText;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	if (
		mutationOutcomes.attempted === 0 &&
		looksLikeExplicitMutationRequest(params.latestUserText ?? '') &&
		looksLikeMutationSuccessClaim(finalText)
	) {
		return buildNoExecutionMutationFailureMessage();
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

	if (level === 'must_synthesize') {
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

const EXPLICIT_MUTATION_VERB =
	/(?:set|mark|update|change|rename|move|create|add|delete|remove|archive|unarchive|complete|reopen|close|schedule|reschedule|cancel|link|unlink|edit|assign|unassign|postpone|defer|push|merge|split|label|tag|prioritize|deprioritize)/i;
const MUTATION_ENTITY_NOUN =
	/\b(?:tasks?|projects?|documents?|docs?|milestones?|goals?|plans?|events?|meetings?|calendar|title|name|status|state)\b/i;
const MUTATION_STATE_PHRASE =
	/\b(?:to|as|back to)\s+(?:done|complete|completed|todo|to-do|open|in progress|blocked|cancelled|canceled)\b/i;
const MUTATION_TARGET_PRONOUN = /\b(?:this|that|these|those|it|them)\b/i;
const READ_ONLY_STATUS_REQUEST_PATTERNS = [
	/^(?:please\s+)?update\s+(?:me|us)\s+(?:on|about)\b/i,
	/^(?:please\s+)?catch\s+(?:me|us)\s+up\s+(?:on|about)\b/i,
	/^(?:please\s+)?(?:give|send)\s+(?:me|us)\s+(?:an?\s+)?(?:update|status|summary)\s+(?:on|about)\b/i,
	/^(?:what(?:'s| is)|where\s+(?:are\s+we|am\s+i))\b.*\b(?:status|progress|standing|at|on)\b/i,
	/^(?:is|are|was|were)\b.*\b(?:still|currently)\b/i
];

export function looksLikeExplicitMutationRequest(text: string): boolean {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return false;
	if (READ_ONLY_STATUS_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized))) {
		return false;
	}

	const commandish =
		new RegExp(`^(?:please\\s+)?${EXPLICIT_MUTATION_VERB.source}\\b`, 'i').test(normalized) ||
		new RegExp(
			`\\b(?:can you|could you|please|i need you to|i want you to)\\s+${EXPLICIT_MUTATION_VERB.source}\\b`,
			'i'
		).test(normalized) ||
		new RegExp(`\\b(?:and|then)\\s+${EXPLICIT_MUTATION_VERB.source}\\b`, 'i').test(normalized);
	if (!commandish) return false;

	return (
		MUTATION_ENTITY_NOUN.test(normalized) ||
		MUTATION_STATE_PHRASE.test(normalized) ||
		MUTATION_TARGET_PRONOUN.test(normalized)
	);
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
