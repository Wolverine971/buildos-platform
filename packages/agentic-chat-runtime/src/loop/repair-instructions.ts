// packages/agentic-chat-runtime/src/loop/repair-instructions.ts
import { normalizeGatewayOpName } from '@buildos/shared-agent-ops/ops/gateway-op-aliases';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import {
	doesToolExecutionRequireUserAction,
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isWriteLedgerToolExecution,
	isWriteLikeOperation
} from './tool-classification';
import { extractGatewayRequiredFieldFailuresFromValidationIssues } from './round-analysis';
import { getDocumentUpdateContentCandidate } from '@buildos/shared-agent-ops/ops/update-value-validation';
import {
	classifyToolFailure,
	isNotFoundFailure,
	parseRequiredParameterFailure
} from './tool-failure';

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

function looksLikeStatedFuture(text: string): boolean {
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
function didCreateDurableRecord(toolExecutions: FastToolExecution[]): boolean {
	return toolExecutions.some((execution) => {
		if (execution.result.success !== true) return false;
		const name = execution.toolCall.function?.name?.trim() ?? '';
		if (!name) return false;
		if (name.startsWith('create_onto_')) return true;
		if (name === 'create_calendar_event') return true;
		// A document edit is how "update START HERE" lands, but metadata-only
		// edits do not carry the stated future on the accepted document surface.
		// Counting every nominal update suppressed both the repair and the D1
		// floor when a model changed only description/state and left body content
		// untouched (Phase 0 gate, 2026-07-31).
		if (name === 'update_onto_document') {
			const { args } = parseToolArguments(execution.toolCall.function?.arguments);
			return getDocumentUpdateContentCandidate(args) !== null;
		}
		return false;
	});
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
	contextType: string;
	toolExecutions: FastToolExecution[];
	latestUserText?: string;
	explicitMutationRequested?: boolean;
	expectedWriteToolNames?: string[];
	/**
	 * Declared outcomes still unfulfilled at finalization. After at least one
	 * successful write, prose that does not disclose the unfinished remainder
	 * gets a deterministic "Done: N of M ... Not yet ...: ..." line appended so
	 * the user learns what is still pending without relying on model prose.
	 */
	unfulfilledOutcomes?: UnfulfilledMutationOutcomeDisclosureV1[];
};

export function enforceMutationOutcomeIntegrity(
	finalText: string,
	params: EnforceMutationOutcomeIntegrityParams
): string {
	const text = enforceMutationOutcomeIntegrityCore(finalText, params);
	return appendUnfulfilledMutationOutcomeDisclosure(text, params);
}

function appendUnfulfilledMutationOutcomeDisclosure(
	finalText: string,
	params: EnforceMutationOutcomeIntegrityParams
): string {
	const unfulfilledOutcomes = params.unfulfilledOutcomes ?? [];
	if (!finalText || unfulfilledOutcomes.length === 0) return finalText;
	// Zero-write turns are already corrected by the no-execution and
	// finalization-guard floors; the partial line is for work that half-happened.
	if (summarizeMutationOutcomes(params.toolExecutions).succeeded === 0) return finalText;
	if (looksLikeUnfulfilledMutationDisclosure(finalText)) return finalText;
	return `${finalText.trim()}\n\n${formatUnfulfilledMutationOutcomeDisclosure(unfulfilledOutcomes)}`;
}

function enforceMutationOutcomeIntegrityCore(
	finalText: string,
	params: EnforceMutationOutcomeIntegrityParams
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
		params.explicitMutationRequested === true &&
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

const UNFULFILLED_MUTATION_DISCLOSURE_PATTERNS: RegExp[] = [
	/\bnot yet\b/i,
	/\b\d+\s+(?:of|out of)\s+\d+\b/i,
	/\b(?:still|remain(?:s|ing)?|left)\b[^.!?\n]{0,40}\b(?:pending|unfinished|undone|outstanding|to do|to be (?:done|moved|updated|created|completed))\b/i,
	/\b(?:the )?(?:rest|remainder|remaining|others?)\b[^.!?\n]{0,60}\b(?:pending|later|next turn|unfinished|not (?:yet )?(?:done|moved|updated|created|complete))\b/i,
	/\b(?:only|just)\s+(?:moved|updated|created|completed|deleted|linked|managed|got)\b/i,
	/\b(?:haven['’]?t|have not|didn['’]?t|did not|couldn['’]?t|could not|wasn['’]?t able to|was not able to|unable to)\s+(?:yet\s+)?(?:move|update|create|complete|finish|delete|link|get to|do|make|process|handle|reach)\b/i,
	/\bran out of\b/i,
	/\bpending\b/i,
	/\bstill unfinished\b/i
];

/** True when the prose already tells the user that requested work is unfinished. */
export function looksLikeUnfulfilledMutationDisclosure(text: string): boolean {
	return UNFULFILLED_MUTATION_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(text));
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

type ReadLoopRepairInstructionLevel = 'nudge' | 'stop_and_answer' | 'must_synthesize';

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

type ReceiptGroundedAssistantDisposition = 'mutation_claim' | 'clarification_question';

/**
 * Identify terminal prose that cannot safely be authoritative on its own.
 *
 * This intentionally inspects only the assistant candidate, never the user's
 * message. The provider's semantic-disposition gate remains responsible for
 * deciding whether the turn is a write, a real ambiguity, or neither. This
 * helper only prevents an unreceipted completion claim or unresolved-choice
 * question from bypassing that gate as plain text.
 */
export function classifyReceiptGroundedAssistantDisposition(
	text: string
): ReceiptGroundedAssistantDisposition | null {
	const candidate = text.replace(/\s+/g, ' ').trim();
	if (!candidate) return null;
	if (looksLikeActionSuccessClaim(candidate)) return 'mutation_claim';
	if (!candidate.includes('?')) return null;
	return UNRESOLVED_CHOICE_QUESTION_PATTERNS.some((pattern) => pattern.test(candidate))
		? 'clarification_question'
		: null;
}

const UNRESOLVED_CHOICE_QUESTION_PATTERNS = [
	/\b(?:are|were)\s+you\s+(?:referring\s+to|talking\s+about)\b[^?]*\?/i,
	/\b(?:do|did)\s+you\s+mean\b[^?]*\?/i,
	/\b(?:can|could|would)\s+you\s+(?:clarify|specify|choose|tell\s+me\s+which)\b[^?]*\?/i,
	/\bwhich\b[^?]{0,160}\b(?:one|task|project|document|goal|plan|milestone|risk|event|email|target|item|record|date|time|priority|status|state)\b[^?]*\?/i
];

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
	/(?:^\s*marking|\b(?:i(?:['’]?m| am)|we(?:['’]?re| are))\s+marking|\b(?:got it|okay|ok|sure)\b[^.!?\n]{0,40}\bmarking)\b[^.!?\n]{0,120}\b(?:done|complete|completed)\b/i,
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
