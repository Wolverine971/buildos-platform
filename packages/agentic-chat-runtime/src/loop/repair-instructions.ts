// packages/agentic-chat-runtime/src/loop/repair-instructions.ts
import { normalizeGatewayOpName } from '@buildos/shared-agent-ops/ops/gateway-op-aliases';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import {
	doesToolExecutionRequireUserAction,
	didGatewayExecSucceed,
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

const DOCUMENT_READ_TOOL_NAMES = new Set([
	'get_document_tree',
	'list_onto_documents',
	'get_document_outline',
	'get_onto_document_details',
	'read_document_section'
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The document inventory the turn has actually seen, from its own read results. Measured
 * 2026-07-26: told to "use the document UUIDs from your earlier reads", the model instead
 * FABRICATED four parent UUIDs for folder-style parents it wished existed — every move failed the
 * entity-scope guard and the retry supervisor locked the turn. Weak models invent ids the moment
 * a plan needs an entity that does not exist; the countermeasure is handing them the real
 * inventory, not asking them to remember it.
 */
function collectDocumentInventoryFromReads(
	toolExecutions: FastToolExecution[]
): Array<{ id: string; title: string }> {
	const found = new Map<string, string>();
	const sweep = (value: unknown, depth: number): void => {
		if (depth > 6 || found.size >= 40 || value == null) return;
		if (Array.isArray(value)) {
			for (const item of value) sweep(item, depth + 1);
			return;
		}
		if (typeof value !== 'object') return;
		const record = value as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : undefined;
		const title = typeof record.title === 'string' ? record.title : undefined;
		if (id && title && UUID_PATTERN.test(id)) {
			if (!found.has(id)) found.set(id, title);
		}
		for (const item of Object.values(record)) sweep(item, depth + 1);
	};
	for (const execution of toolExecutions) {
		const name = execution.toolCall.function?.name?.trim() ?? '';
		if (!DOCUMENT_READ_TOOL_NAMES.has(name)) continue;
		if (execution.result.success !== true) continue;
		sweep(execution.result.result, 0);
	}
	return Array.from(found, ([id, title]) => ({ id, title }));
}

export function buildOrganizeCommissionRepairInstruction(
	toolExecutions: FastToolExecution[] = []
): string {
	const inventory = collectDocumentInventoryFromReads(toolExecutions);
	const inventoryLines =
		inventory.length > 0
			? `The ONLY valid document ids in this project are: ${inventory
					.map((doc) => `${doc.id} ("${doc.title}")`)
					.join('; ')}. Any other id will be rejected.`
			: null;
	return [
		'The user commissioned a reorganization and this turn has not changed anything yet — a structure proposed in prose is not a reorganization.',
		'Execute it now: call move_document_in_tree once per document that should live under a parent; multiple calls in this one response are expected.',
		'For each move, set new_parent_title to a short category name (e.g. "Pricing", "Meeting notes") — the server reuses the existing document with that title or creates the parent. A move with neither parent field goes to the root and organizes nothing.',
		'Group related documents under the SAME parent: reuse the exact same new_parent_title string for every document in a category (e.g. "meeting 3-14 raw" and "meeting 4-02 raw" both get new_parent_title "Meeting notes"). Giving every document its own distinct parent is filing, not organizing — prefer a few shared categories over one folder per document.',
		inventoryLines,
		'Use new_parent_id only for a UUID that appears in that list. NEVER invent a UUID — an unknown id is rejected.',
		'Do not restate the plan. Then state exactly what changed, briefly.'
	]
		.filter((line): line is string => Boolean(line))
		.join(' ');
}

/**
 * One declared turn-contract outcome the write ledger could not prove complete,
 * shaped for the user-facing partial-fulfilment disclosure. The caller resolves
 * target titles from tool evidence; an unresolved target falls back to its id.
 */
export type UnfulfilledMutationOutcomeDisclosureV1 = {
	action: string;
	entityKind: string;
	description?: string;
	/** Targets the outcome declared; 0 for create/label outcomes. */
	declaredTargetCount: number;
	/** Distinct effects the ledger matched against the outcome. */
	completedTargetCount: number;
	/** Effects the outcome needs before it counts as fulfilled. */
	requiredEffects: number;
	missingTargets: Array<{ id: string; title: string | null }>;
};

type EnforceMutationOutcomeIntegrityParams = {
	toolExecutions: FastToolExecution[];
	/**
	 * Declared outcomes still unfulfilled at finalization. After at least one
	 * successful write, a deterministic "Done: N of M ... Not yet ...: ..." line
	 * is appended so the user learns what is still pending from the ledger, not
	 * from model prose.
	 */
	unfulfilledOutcomes?: UnfulfilledMutationOutcomeDisclosureV1[];
};

/**
 * Terminal receipts rendered from the write ledger, appended under the model's
 * answer. The answer itself is never read: whether the prose already admitted a
 * failure or claimed a success is a language judgment (AGENTS.md "Never
 * classify language with regex"), and the regexes that used to make it both
 * rewrote correct answers and let paraphrased overclaims through. The ledger
 * decides; at worst a receipt repeats what an honest answer already said.
 *
 * Prevention lives upstream: the acting prompt tells the model to report only
 * what tool results confirm, and a write the model merely describes is never
 * saved (ACTOR_COMMISSION_GUIDANCE in the worker).
 */
export function enforceMutationOutcomeIntegrity(
	finalText: string,
	params: EnforceMutationOutcomeIntegrityParams
): string {
	if (!finalText) return finalText;
	const blocks: string[] = [];
	const unrepairedFailures = collectUnrepairedFailedWrites(params.toolExecutions);
	const succeeded = countSuccessfulWrites(params.toolExecutions);
	if (unrepairedFailures.length > 0) {
		blocks.push(formatWriteFailureDisclosure(unrepairedFailures, succeeded));
	}
	const unfulfilledOutcomes = params.unfulfilledOutcomes ?? [];
	// Zero-write turns get the finalization guard's notice instead; the
	// partial line is for work that half-happened.
	if (unfulfilledOutcomes.length > 0 && succeeded > 0) {
		blocks.push(formatUnfulfilledMutationOutcomeDisclosure(unfulfilledOutcomes));
	}
	if (blocks.length === 0) return finalText;
	return [finalText.trim(), ...blocks].join('\n\n');
}

const MAX_DISCLOSED_MISSING_TARGETS = 10;

const OUTCOME_ACTION_NOUNS: Record<string, { singular: string; plural: string }> = {
	create: { singular: 'creation', plural: 'creations' },
	update: { singular: 'update', plural: 'updates' },
	move: { singular: 'move', plural: 'moves' },
	organize: { singular: 'move', plural: 'moves' },
	link: { singular: 'link', plural: 'links' },
	unlink: { singular: 'unlink', plural: 'unlinks' },
	delete: { singular: 'deletion', plural: 'deletions' },
	schedule: { singular: 'scheduling change', plural: 'scheduling changes' },
	set: { singular: 'update', plural: 'updates' },
	assign: { singular: 'assignment', plural: 'assignments' },
	complete: { singular: 'completion', plural: 'completions' },
	archive: { singular: 'archive', plural: 'archives' },
	restore: { singular: 'restore', plural: 'restores' },
	tag: { singular: 'tag', plural: 'tags' }
};

const OUTCOME_ACTION_PARTICIPLES: Record<string, string> = {
	create: 'created',
	update: 'updated',
	move: 'moved',
	organize: 'moved',
	link: 'linked',
	unlink: 'unlinked',
	delete: 'deleted',
	schedule: 'scheduled',
	set: 'set',
	assign: 'assigned',
	complete: 'completed',
	archive: 'archived',
	restore: 'restored',
	tag: 'tagged'
};

/**
 * "Done: 2 of 6 moves. Not yet moved: A, B, C, D." One sentence pair per
 * unfulfilled outcome, targets named by title when tool evidence carried one
 * and by id otherwise, so the user can see exactly what still needs doing.
 */
export function formatUnfulfilledMutationOutcomeDisclosure(
	outcomes: readonly UnfulfilledMutationOutcomeDisclosureV1[]
): string {
	const sentences: string[] = [];
	for (const outcome of outcomes) {
		const total = Math.max(
			outcome.declaredTargetCount > 0 ? outcome.declaredTargetCount : outcome.requiredEffects,
			1
		);
		const done = Math.min(Math.max(outcome.completedTargetCount, 0), total);
		const nouns = OUTCOME_ACTION_NOUNS[outcome.action] ?? {
			singular: `${outcome.action} change`,
			plural: `${outcome.action} changes`
		};
		const participle = OUTCOME_ACTION_PARTICIPLES[outcome.action] ?? 'done';
		const remaining = describeMissingOutcomeTargets(outcome);
		sentences.push(
			`Done: ${done} of ${total} ${total === 1 ? nouns.singular : nouns.plural}.` +
				(remaining ? ` Not yet ${participle}: ${remaining}.` : '')
		);
	}
	return sentences.join(' ');
}

function describeMissingOutcomeTargets(outcome: UnfulfilledMutationOutcomeDisclosureV1): string {
	const labels = outcome.missingTargets
		.map((target) => target.title?.trim() || target.id.trim())
		.filter(Boolean);
	if (labels.length === 0) {
		const description = outcome.description?.trim();
		return description ? description : `${outcome.entityKind} ${outcome.action}`;
	}
	const shown = labels.slice(0, MAX_DISCLOSED_MISSING_TARGETS);
	const hidden = labels.length - shown.length;
	return hidden > 0 ? `${shown.join(', ')}, and ${hidden} more` : shown.join(', ');
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
		if (hasProjectCreateIssue) {
			lines.push(
				'create_onto_project is already available for this retry. Correct its arguments and call it directly; do not call tool_search, tool_schema, skill tools, or turn-contract tools.'
			);
		} else {
			lines.push(
				'Gateway pattern: start from context and capability, load a skill when the workflow matters, identify the exact op, inspect its schema if needed, then execute.'
			);
			lines.push(
				'If the skill or current context already identifies the exact op, skip tool_search. Otherwise use tool_search only when the exact op is unknown. Search for the operation you need, not workspace data. Good examples: {"capability":"overview"}, {"entity":"task","kind":"write","query":"update existing task state"}, or {"group":"onto","entity":"document","kind":"write","query":"move document in tree"}.'
			);
			lines.push(
				'If the work is multi-step or easy to get wrong, load the relevant skill first.'
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
		}
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
		if (hasSameRoundDiscoveryExecutionIssue && !hasProjectCreateIssue) {
			lines.push(
				'Do not combine exact-op discovery and write execution in the same response. If you call tool_schema({ op: "<exact op>" }) for a write, stop there, wait for that result, and emit the direct tool call in the next response.'
			);
		}
		if (hasProjectCreateIssue) {
			lines.push(
				'create_onto_project requires project, entities, and relationships. project must include name and type_key; entities and relationships must be arrays and may be empty.'
			);
			lines.push(
				'Minimal valid example: create_onto_project({ project: { name: "Project Name", type_key: "project.business.initiative" }, entities: [], relationships: [] }).'
			);
			lines.push(
				'Keep any initial goals, tasks, plans, documents, or other supported records in entities in the same create_onto_project call.'
			);
			lines.push(
				'If a previous create_onto_project attempt included a full payload, reuse that payload and patch only the failing fields. Never replace a complete payload with empty arguments.'
			);
			if (hasProjectCreateRelationshipIssue) {
				lines.push(
					'Each relationship must be an object with from and to objects; both endpoints require temp_id and kind. Do not use pair arrays, raw temp_id strings, or null items.'
				);
			}
		}
		lines.push(...buildGatewayCreateFieldRepairLines(gatewayRequiredFieldFailures));
		if (exactHelpPaths.length > 0 && !hasProjectCreateIssue) {
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

function countSuccessfulWrites(toolExecutions: FastToolExecution[]): number {
	let succeeded = 0;
	for (const execution of toolExecutions) {
		if (getWriteOperationName(execution) && didWriteExecutionSucceed(execution)) succeeded += 1;
	}
	return succeeded;
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

function formatWriteFailureDisclosure(
	failures: FailedWriteDisclosure[],
	succeededWrites: number
): string {
	const uniqueFailures = groupFailedWriteDisclosures(failures);
	const labels = uniqueFailures.map((failure) => formatWriteFailureLabel(failure));
	if (succeededWrites === 0) {
		return `No changes were saved: ${labels.join('; ')}.`;
	}
	const subject =
		uniqueFailures.length === 1 ? 'One write did not complete' : 'Some writes did not complete';
	const persistedPart = uniqueFailures.length === 1 ? 'that part' : 'those parts';
	return `${subject}: ${labels.join('; ')}. I did not persist ${persistedPart}.`;
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
