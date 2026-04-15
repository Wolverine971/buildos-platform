// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import {
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	extractGatewayRequiredFieldFailuresFromValidationIssues,
	getGatewayExecOp,
	isWriteLikeOperation
} from './round-analysis';

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

export function shouldRepairGatewayMutationNoExecution(params: {
	gatewayModeActive: boolean;
	contextType: string;
	finalText: string;
	toolExecutions: FastToolExecution[];
	repairAlreadyInjected: boolean;
}): boolean {
	if (!params.gatewayModeActive) return false;
	if (params.contextType === 'project_create') return false;
	if (params.repairAlreadyInjected) return false;

	const finalText = params.finalText.trim();
	if (!finalText) return true;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	if (mutationOutcomes.succeeded > 0) return false;

	const writeIntentOps = collectGatewayWriteIntentOps(params.toolExecutions);
	if (writeIntentOps.length === 0) return false;

	if (looksLikePureClarifyingQuestion(finalText)) return false;

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
	params: { contextType: string; toolExecutions: FastToolExecution[] }
): string {
	if (!finalText) return finalText;

	const mutationOutcomes = summarizeMutationOutcomes(params.toolExecutions);
	if (mutationOutcomes.attempted > 0) {
		if (mutationOutcomes.failed > 0 && looksLikeBulkMutationSuccessClaim(finalText)) {
			return buildMutationFailureMessage(mutationOutcomes);
		}

		if (mutationOutcomes.succeeded === 0 && looksLikeMutationSuccessClaim(finalText)) {
			return buildMutationFailureMessage(mutationOutcomes);
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
			issue.errors.some((error) => error.includes('Missing required parameter: title'))
	);
	const hasTaskUpdateIdIssue = issues.some(
		(issue) =>
			issue.op === 'onto.task.update' &&
			issue.errors.some((error) => error.includes('Missing required parameter: task_id'))
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
			'If the work is multi-step or easy to get wrong, load the relevant skill first. For project creation, especially in project_create context, prefer skill_load({ skill: "project_creation" }) before onto.project.create.'
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

export function buildReadLoopRepairInstruction(readOps: string[]): string {
	const opsLabel = readOps.length > 0 ? readOps.join(', ') : 'read-only ops';
	return [
		'You are repeating read-only tool calls without making progress.',
		`Repeated ops: ${opsLabel}.`,
		'Stop reloading the same data. Use the existing results to answer, or perform the next required action.',
		'If required IDs are still missing, ask one concise clarification question instead of repeating the same reads.'
	].join(' ');
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

function collectGatewayWriteIntentOps(toolExecutions: FastToolExecution[]): string[] {
	const ops = new Set<string>();

	for (const execution of toolExecutions) {
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

function looksLikeActionSuccessClaim(text: string): boolean {
	return (
		looksLikeMutationSuccessClaim(text) ||
		looksLikeBulkMutationSuccessClaim(text) ||
		looksLikeProjectCreateSuccessClaim(text)
	);
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

function getWriteOperationName(execution: FastToolExecution): string | null {
	const toolName = execution.toolCall.function?.name?.trim();
	if (!toolName) return null;

	const op = getGatewayExecOp(execution) ?? toolName;
	return isWriteLikeOperation(op) ? op : null;
}

function didWriteExecutionSucceed(execution: FastToolExecution): boolean {
	const toolName = execution.toolCall.function?.name?.trim();
	if (!toolName) return false;
	return didGatewayExecSucceed(execution);
}

const BULK_MUTATION_SUCCESS_CLAIM_PATTERNS = [
	/\bupdates?\s+confirmed\b/i,
	/\bchanges?\s+confirmed\b/i,
	/\bcompleted\s+updates?\b/i
];

const MUTATION_SUCCESS_CLAIM_PATTERNS = [
	/\bmarked(?:\s+\w+){0,4}\s+(?:done|complete|completed)\b/i,
	/\b(?:i|we)(?:'ve| have)?\s+(?:created|updated|deleted|removed|moved|linked|unlinked|scheduled|rescheduled|set)\b/i,
	/\b(?:i|we)(?:'ve| have)?\s+(?:merged|archived)\b/i,
	/\b(?:created|updated|deleted|removed|moved|merged|archived|linked|unlinked|scheduled|rescheduled|set)\s+successfully\b/i,
	/\b(?:has|have|was|were)\s+been\s+(?:created|updated|deleted|removed|moved|merged|archived|linked|unlinked|scheduled|rescheduled|set|marked)\b/i,
	/\bis\s+now\s+(?:done|complete|completed|updated|merged|archived|scheduled|rescheduled)\b/i
];

function looksLikeBulkMutationSuccessClaim(text: string): boolean {
	return BULK_MUTATION_SUCCESS_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
}

function looksLikeMutationSuccessClaim(text: string): boolean {
	return MUTATION_SUCCESS_CLAIM_PATTERNS.some((pattern) => pattern.test(text));
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
