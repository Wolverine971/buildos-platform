// packages/agentic-chat-runtime/src/loop/turn-contract.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from './shared';
import { parseToolArguments } from './tool-arguments';
import { didGatewayExecSucceed, isWriteLedgerToolExecution } from './tool-classification';
import { buildWriteLedger, type WriteLedgerEntry } from './write-ledger';

export const DECLARE_TURN_CONTRACT_TOOL_NAME = 'declare_turn_contract';
export const DECLARE_READ_ONLY_TURN_TOOL_NAME = 'declare_read_only_turn';
export const REQUEST_TURN_CLARIFICATION_TOOL_NAME = 'request_turn_clarification';
export const CANCEL_TURN_CONTRACT_TOOL_NAME = 'cancel_turn_contract';
export const FASTCHAT_PENDING_TURN_CONTRACT_METADATA_KEY = 'fastchat_pending_turn_contract';

export const TURN_CONTRACT_ACTIONS = [
	'create',
	'update',
	'move',
	'organize',
	'link',
	'unlink',
	'delete',
	'schedule',
	'set',
	'assign',
	'complete',
	'archive',
	'restore',
	'tag'
] as const;

export type TurnContractAction = (typeof TURN_CONTRACT_ACTIONS)[number];

export const TURN_CONTRACT_ENTITY_KINDS = [
	'project',
	'task',
	'document',
	'event',
	'goal',
	'plan',
	'milestone',
	'risk',
	'relationship',
	'calendar',
	'entity'
] as const;

export type TurnContractEntityKind = (typeof TURN_CONTRACT_ENTITY_KINDS)[number];

/**
 * A durable field value an outcome sets on every one of its targets. Targets
 * that receive different values belong in separate outcomes, so an
 * independent reviewer can tell "mark A and B done" from "make C top priority".
 */
export type TurnContractChange = {
	field: string;
	value: string;
};

export type TurnContractOutcome = {
	id: string;
	action: TurnContractAction;
	entityKind: TurnContractEntityKind;
	description?: string;
	targetIds: string[];
	requiredFields: string[];
	/** Present only when declared; every change field is also a required field. */
	changes?: TurnContractChange[];
	minimumSuccessfulEffects: number;
};

export type TurnContract = {
	version: 1;
	source: 'declared' | 'implicit' | 'combined';
	summary?: string;
	outcomes: TurnContractOutcome[];
};

export type TurnContractOutcomeResult = {
	id: string;
	fulfilled: boolean;
	matchedEffects: number;
	requiredEffects: number;
	missingTargetIds: string[];
	missingRequiredFields: string[];
};

export type TurnContractResolution = {
	status: 'fulfilled' | 'blocked' | 'unfulfilled' | 'failed';
	fulfilled: boolean;
	outcomes: TurnContractOutcomeResult[];
	contract: TurnContract | null;
};

export type FastChatPendingTurnContract = {
	version: 1;
	contract: TurnContract;
	contextType: string;
	projectId: string | null;
	originatingTurnRunId: string | null;
	createdAt: string;
	finishedReason: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as UnknownRecord)
		: null;
}

function readString(value: unknown, maxLength = 240): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function readStringArray(value: unknown, maxItems = 50): string[] | null {
	if (!Array.isArray(value) || value.length > maxItems) return null;
	const strings = value.map((item) => readString(item, 160));
	if (strings.some((item) => !item)) return null;
	return Array.from(new Set(strings as string[]));
}

function readPositiveInteger(value: unknown, fallback: number): number | null {
	if (value === undefined) return fallback;
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 100
		? value
		: null;
}

function normalizeAction(value: unknown): TurnContractAction | null {
	const normalized = readString(value, 32)?.toLowerCase();
	return TURN_CONTRACT_ACTIONS.includes(normalized as TurnContractAction)
		? (normalized as TurnContractAction)
		: null;
}

function normalizeEntityKind(value: unknown): TurnContractEntityKind | null {
	const normalized = readString(value, 40)?.toLowerCase();
	if (!normalized) return null;
	const singular = normalized.endsWith('s') ? normalized.slice(0, -1) : normalized;
	return TURN_CONTRACT_ENTITY_KINDS.includes(singular as TurnContractEntityKind)
		? (singular as TurnContractEntityKind)
		: null;
}

function normalizeFieldName(value: string): string {
	const normalized = value
		.trim()
		.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
		.toLowerCase();
	// Tree creation and movement use different transport names for the same
	// semantic placement dimensions. Contracts describe the durable property,
	// not whichever adapter happened to carry it.
	if (normalized === 'new_parent_id') return 'parent_id';
	if (normalized === 'new_position') return 'position';
	return normalized;
}

const MAX_CHANGES_PER_OUTCOME = 20;

function readChangeValue(value: unknown): string | undefined {
	if (typeof value === 'string') return readString(value, 160);
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
		return String(value);
	}
	return undefined;
}

/**
 * Returns the declared changes, `[]` when none were declared, or `null` when
 * any entry is malformed. Like target_ids, a malformed entry rejects the whole
 * outcome rather than silently weakening it. Repeated fields keep the last value.
 */
function readChanges(value: unknown): TurnContractChange[] | null {
	if (value === undefined) return [];
	if (!Array.isArray(value) || value.length > MAX_CHANGES_PER_OUTCOME) return null;
	const valuesByField = new Map<string, string>();
	for (const item of value) {
		const record = asRecord(item);
		if (!record) return null;
		const rawField = readString(record.field, 80);
		const changeValue = readChangeValue(record.value);
		if (!rawField || changeValue === undefined) return null;
		const field = normalizeFieldName(rawField);
		if (!field) return null;
		valuesByField.set(field, changeValue);
	}
	return Array.from(valuesByField, ([field, changeValue]) => ({ field, value: changeValue }));
}

/**
 * Collects why an outcome was rejected so the bounded validation-repair loop can
 * name the exact property instead of restating every rule. The 2026-08-20
 * `task-multi-update` failure exhausted repair because a single catch-all
 * sentence never told the model which of four candidate causes actually fired.
 */
type TurnContractIssueSink = { push(issue: string): void } | undefined;

function rejectOutcome(issues: TurnContractIssueSink, index: number, reason: string): null {
	issues?.push(`Outcome ${index + 1}: ${reason}`);
	return null;
}

function normalizeOutcome(
	value: unknown,
	index: number,
	issues?: TurnContractIssueSink
): TurnContractOutcome | null {
	const record = asRecord(value);
	if (!record) {
		return rejectOutcome(issues, index, 'must be a JSON object.');
	}
	const action = normalizeAction(record.action);
	const entityKind = normalizeEntityKind(record.entity_kind ?? record.entityKind);
	if (!action) {
		return rejectOutcome(
			issues,
			index,
			`action ${JSON.stringify(record.action ?? null)} is not supported. Use one of: ${TURN_CONTRACT_ACTIONS.join(', ')}.`
		);
	}
	if (!entityKind) {
		return rejectOutcome(
			issues,
			index,
			`entity_kind ${JSON.stringify(record.entity_kind ?? record.entityKind ?? null)} is not supported. Use one of: ${TURN_CONTRACT_ENTITY_KINDS.join(', ')}.`
		);
	}
	const rawTargetIds = record.target_ids ?? record.targetIds;
	const rawRequiredFields = record.required_fields ?? record.requiredFields;
	const parsedTargetIds = readStringArray(rawTargetIds ?? []);
	const parsedRequiredFields = readStringArray(rawRequiredFields ?? [], 30);
	const changes = readChanges(record.changes);
	if (!parsedTargetIds) {
		return rejectOutcome(
			issues,
			index,
			'target_ids must be an array of at most 50 non-empty id strings.'
		);
	}
	if (!parsedRequiredFields) {
		return rejectOutcome(
			issues,
			index,
			'required_fields must be an array of at most 30 non-empty field-name strings.'
		);
	}
	if (!changes) {
		return rejectOutcome(
			issues,
			index,
			`changes must be an array of at most ${MAX_CHANGES_PER_OUTCOME} objects, each with a non-empty "field" and a string, number, boolean, or null "value".`
		);
	}
	// A create has no durable entity id until after it executes. Models sometimes
	// put the containing project id in target_ids, but target_ids means existing
	// entity ids and would make both pre-execution authorization and completion
	// impossible. Exact parent/project scope remains protected by the independently
	// reviewed mutation batch.
	const targetIds = action === 'create' ? [] : parsedTargetIds;
	// A declared change is a postcondition: the field must actually be written on
	// each counted target, so it joins required_fields for fulfillment.
	const requiredFields = Array.from(
		new Set([
			...parsedRequiredFields.map(normalizeFieldName),
			...changes.map((change) => change.field)
		])
	);
	const minimumSuccessfulEffects = readPositiveInteger(
		record.minimum_successful_effects ?? record.minimumSuccessfulEffects,
		Math.max(1, targetIds.length)
	);
	if (minimumSuccessfulEffects === null) {
		return rejectOutcome(
			issues,
			index,
			`minimum_successful_effects ${JSON.stringify(record.minimum_successful_effects ?? record.minimumSuccessfulEffects ?? null)} must be a whole number from 1 to 100.`
		);
	}
	if (targetIds.length > 0 && minimumSuccessfulEffects > targetIds.length) {
		return rejectOutcome(
			issues,
			index,
			`minimum_successful_effects is ${minimumSuccessfulEffects} but target_ids lists only ${targetIds.length} ${targetIds.length === 1 ? 'target' : 'targets'}. ` +
				'An effect is one target that changed, not one field changed on a target: setting several fields on a single target is still one effect. ' +
				`Either set minimum_successful_effects to at most ${targetIds.length}, or list every target this outcome must change in target_ids.`
		);
	}
	return {
		id: readString(record.id, 80) ?? `outcome_${index + 1}`,
		action,
		entityKind,
		...(readString(record.description, 240)
			? { description: readString(record.description, 240) }
			: {}),
		targetIds,
		requiredFields,
		...(changes.length > 0 ? { changes } : {}),
		minimumSuccessfulEffects
	};
}

export function parseDeclaredTurnContract(
	value: unknown,
	issues?: TurnContractIssueSink
): TurnContract | null {
	const record = asRecord(value);
	if (!record) {
		issues?.push('The turn contract must be a JSON object with an "outcomes" array.');
		return null;
	}
	const rawOutcomes = Array.isArray(record.outcomes) ? record.outcomes : [];
	if (rawOutcomes.length < 1 || rawOutcomes.length > 20) {
		issues?.push(
			`outcomes must be an array of 1 to 20 outcomes; received ${Array.isArray(record.outcomes) ? rawOutcomes.length : JSON.stringify(record.outcomes ?? null)}.`
		);
		return null;
	}
	const outcomes = rawOutcomes
		.map((outcome, index) => normalizeOutcome(outcome, index, issues))
		.filter((outcome): outcome is TurnContractOutcome => Boolean(outcome));
	if (outcomes.length !== rawOutcomes.length) return null;
	const summary = readString(record.summary, 300);
	return {
		version: 1,
		source: 'declared',
		...(summary ? { summary } : {}),
		outcomes
	};
}

/**
 * Returns one human-readable issue per rejected outcome, or `[]` when the
 * contract parses. Used by pre-execution validation so a repair round tells the
 * model which property to change rather than repeating the whole rule set.
 */
export function describeDeclaredTurnContractIssues(value: unknown): string[] {
	const issues: string[] = [];
	if (parseDeclaredTurnContract(value, issues)) return [];
	return issues.length > 0
		? issues
		: [
				'Every outcome must use a supported action and entity kind, valid target/field arrays, and minimum_successful_effects from 1 to 100.'
			];
}

export function readFastChatPendingTurnContract(
	value: unknown
): FastChatPendingTurnContract | null {
	const record = asRecord(value);
	if (!record || record.version !== 1) return null;
	const contract = parseDeclaredTurnContract(record.contract);
	const contextType = readString(record.contextType ?? record.context_type, 60);
	const createdAt = readString(record.createdAt ?? record.created_at, 80);
	if (!contract || !contextType || !createdAt || !Number.isFinite(Date.parse(createdAt))) {
		return null;
	}
	return {
		version: 1,
		contract,
		contextType,
		projectId: readString(record.projectId ?? record.project_id, 160) ?? null,
		originatingTurnRunId:
			readString(record.originatingTurnRunId ?? record.originating_turn_run_id, 160) ?? null,
		createdAt,
		finishedReason: readString(record.finishedReason ?? record.finished_reason, 100) ?? null
	};
}

export function buildFastChatPendingTurnContract(params: {
	resolution: TurnContractResolution;
	contextType: string;
	projectId?: string | null;
	turnRunId?: string | null;
	finishedReason?: string | null;
	now?: Date;
}): FastChatPendingTurnContract | null {
	if (!params.resolution.contract || params.resolution.fulfilled) return null;
	const unfinishedOutcomes = params.resolution.contract.outcomes.filter(
		(_outcome, index) => params.resolution.outcomes[index]?.fulfilled !== true
	);
	if (unfinishedOutcomes.length === 0) return null;
	return {
		version: 1,
		contract: {
			...params.resolution.contract,
			source: 'declared',
			outcomes: unfinishedOutcomes
		},
		contextType: params.contextType,
		projectId: params.projectId ?? null,
		originatingTurnRunId: params.turnRunId ?? null,
		createdAt: (params.now ?? new Date()).toISOString(),
		finishedReason: params.finishedReason ?? null
	};
}

export function buildPendingTurnContractSystemMessage(
	pending: FastChatPendingTurnContract | null | undefined
): string | null {
	if (!pending) return null;
	return [
		'<pending_turn_contract>',
		'The prior turn ended before these user-commissioned durable outcomes were fulfilled.',
		JSON.stringify(pending.contract),
		'Continue them in this turn. Re-declare the unfinished outcomes alongside any reads, then complete them with durable write effects. If the user explicitly cancels or supersedes this prior commission, call cancel_turn_contract instead and do not perform the cancelled writes. Do not claim completion from prose or read results.',
		'</pending_turn_contract>'
	].join('\n');
}

export function isPendingTurnContractInScope(
	pending: FastChatPendingTurnContract | null | undefined,
	contextType: string,
	projectId: string | null
): pending is FastChatPendingTurnContract {
	return Boolean(
		pending && pending.contextType === contextType && pending.projectId === projectId
	);
}

export function extractDeclaredTurnContract(toolCall: ChatToolCall): TurnContract | null {
	if (toolCall.function?.name !== DECLARE_TURN_CONTRACT_TOOL_NAME) return null;
	const { args } = parseToolArguments(toolCall.function.arguments);
	return parseDeclaredTurnContract(args);
}

export function executeDeclareTurnContract(toolCall: ChatToolCall): ChatToolResult {
	const contract = extractDeclaredTurnContract(toolCall);
	if (!contract) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Turn contract validation failed: provide at least one outcome with a supported action and entity_kind.'
		};
	}
	return {
		tool_call_id: toolCall.id,
		success: true,
		result: {
			status: 'declared',
			contract,
			instruction:
				'Continue this turn until every declared outcome is backed by successful durable effects, or explain the concrete blocker.'
		}
	};
}

export function isDeclareReadOnlyTurnCall(toolCall: ChatToolCall): boolean {
	return toolCall.function?.name === DECLARE_READ_ONLY_TURN_TOOL_NAME;
}

export function executeDeclareReadOnlyTurn(toolCall: ChatToolCall): ChatToolResult {
	if (!isDeclareReadOnlyTurnCall(toolCall)) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Read-only turn declaration failed: wrong control tool.'
		};
	}
	const { args, error } = parseToolArguments(toolCall.function.arguments);
	const reason = readString(args.reason, 240);
	if (error || !reason) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Read-only turn declaration failed: explain why the current request commissions no durable data change.'
		};
	}
	return {
		tool_call_id: toolCall.id,
		success: true,
		result: {
			status: 'read_only_declared',
			reason,
			instruction:
				'Continue with reads or answer from evidence; do not claim a durable mutation.'
		}
	};
}

export function isRequestTurnClarificationCall(toolCall: ChatToolCall): boolean {
	return toolCall.function?.name === REQUEST_TURN_CLARIFICATION_TOOL_NAME;
}

export function executeRequestTurnClarification(toolCall: ChatToolCall): ChatToolResult {
	if (!isRequestTurnClarificationCall(toolCall)) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Turn clarification failed: wrong control tool.'
		};
	}
	const { args, error } = parseToolArguments(toolCall.function.arguments);
	const reason = readString(args.reason, 240);
	const question = readString(args.question, 500);
	if (error || !reason || !question) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Turn clarification failed: provide the unresolved semantic choice and a concise question for the user.'
		};
	}
	return {
		tool_call_id: toolCall.id,
		success: true,
		requires_user_action: true,
		result: {
			status: 'clarification_required',
			reason,
			question,
			requires_user_action: true,
			instruction:
				'Ask the question and wait for the user. Do not perform a durable mutation in this turn.'
		}
	};
}

export function isCancelTurnContractCall(toolCall: ChatToolCall): boolean {
	return toolCall.function?.name === CANCEL_TURN_CONTRACT_TOOL_NAME;
}

export function executeCancelTurnContract(toolCall: ChatToolCall): ChatToolResult {
	if (!isCancelTurnContractCall(toolCall)) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Turn contract cancellation failed: wrong control tool.'
		};
	}
	const { args, error } = parseToolArguments(toolCall.function.arguments);
	const reason = readString(args.reason, 240);
	if (error || !reason) {
		return {
			tool_call_id: toolCall.id,
			success: false,
			result: null,
			error: 'Turn contract cancellation failed: provide a concise reason grounded in the current user message.'
		};
	}
	return {
		tool_call_id: toolCall.id,
		success: true,
		result: {
			status: 'cancelled',
			reason,
			instruction: 'Do not execute the cancelled durable outcomes.'
		}
	};
}

function uniqueOutcomes(outcomes: TurnContractOutcome[]): TurnContractOutcome[] {
	const seen = new Set<string>();
	return outcomes.filter((outcome) => {
		const key = JSON.stringify([
			outcome.action,
			outcome.entityKind,
			[...outcome.targetIds].sort(),
			[...outcome.requiredFields].sort(),
			(outcome.changes ?? [])
				.map((change) => [change.field, change.value])
				.sort(([left], [right]) => (left ?? '').localeCompare(right ?? '')),
			outcome.minimumSuccessfulEffects
		]);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function mergeTurnContracts(
	current: TurnContract | null | undefined,
	next: TurnContract | null | undefined
): TurnContract | null {
	if (!current) return next ?? null;
	if (!next) return current;
	return {
		version: 1,
		source: current.source === next.source ? current.source : 'combined',
		...(current.summary || next.summary
			? { summary: [current.summary, next.summary].filter(Boolean).join('; ').slice(0, 300) }
			: {}),
		outcomes: uniqueOutcomes([...current.outcomes, ...next.outcomes])
	};
}

function implicitOutcomeFromLedgerEntry(
	entry: WriteLedgerEntry,
	index: number
): TurnContractOutcome | null {
	if (!entry.action || !entry.entityKind) return null;
	const action = normalizeAction(entry.action);
	const entityKind = normalizeEntityKind(entry.entityKind);
	if (!action || !entityKind) return null;
	return {
		id: `implicit_${index + 1}`,
		action,
		entityKind,
		targetIds: entry.entityId ? [entry.entityId] : [],
		requiredFields: entry.changedFields ?? [],
		minimumSuccessfulEffects: 1
	};
}

export function deriveImplicitTurnContract(
	toolExecutions: FastToolExecution[] | null | undefined
): TurnContract | null {
	const writes = (toolExecutions ?? []).filter(isWriteLedgerToolExecution);
	if (writes.length === 0) return null;
	const outcomes = buildWriteLedger(writes)
		.map(implicitOutcomeFromLedgerEntry)
		.filter((outcome): outcome is TurnContractOutcome => Boolean(outcome));
	if (outcomes.length === 0) return null;
	return { version: 1, source: 'implicit', outcomes: uniqueOutcomes(outcomes) };
}

export function extractDeclaredTurnContractFromExecutions(
	toolExecutions: FastToolExecution[] | null | undefined
): TurnContract | null {
	let contract: TurnContract | null = null;
	for (const execution of toolExecutions ?? []) {
		if (!execution.result.success) continue;
		contract = mergeTurnContracts(contract, extractDeclaredTurnContract(execution.toolCall));
	}
	return contract;
}

export function resolveTurnContractFromExecutions(
	toolExecutions: FastToolExecution[] | null | undefined,
	initialContract: TurnContract | null = null
): TurnContract | null {
	const executions = toolExecutions ?? [];
	let contract = initialContract;
	let lastCancellationIndex = -1;
	for (let index = 0; index < executions.length; index += 1) {
		const execution = executions[index];
		if (!execution?.result.success) continue;
		if (
			isCancelTurnContractCall(execution.toolCall) ||
			isRequestTurnClarificationCall(execution.toolCall)
		) {
			contract = null;
			lastCancellationIndex = index;
			continue;
		}
		contract = mergeTurnContracts(contract, extractDeclaredTurnContract(execution.toolCall));
	}

	const writesAfterLastCancellation = executions
		.slice(lastCancellationIndex + 1)
		.filter(isWriteLedgerToolExecution);
	if (!contract) return deriveImplicitTurnContract(writesAfterLastCancellation);

	// A declaration is the reviewed authority for this turn. Calls outside it are
	// rejected proposals, not evidence that the user commissioned another
	// outcome, so they must never become durable carry-forward authority. The
	// implicit fallback remains only for older/direct paths with no declaration.
	return contract;
}

const SAFE_WRITE_TOOLS_BY_OUTCOME: Partial<
	Record<TurnContractEntityKind, Partial<Record<TurnContractAction, readonly string[]>>>
> = {
	project: {
		create: ['create_onto_project'],
		update: ['update_onto_project'],
		organize: ['reorganize_onto_project_graph']
	},
	task: {
		create: ['create_onto_task'],
		update: ['update_onto_task'],
		move: ['move_onto_task'],
		assign: ['update_onto_task'],
		complete: ['update_onto_task']
	},
	document: {
		create: ['create_onto_document'],
		update: ['update_onto_document'],
		move: ['move_document_in_tree'],
		organize: ['move_document_in_tree', 'create_onto_document'],
		archive: ['update_onto_document'],
		restore: ['update_onto_document']
	},
	event: {
		create: ['create_calendar_event'],
		update: ['update_calendar_event'],
		schedule: ['create_calendar_event', 'update_calendar_event']
	},
	calendar: { set: ['set_project_calendar'], schedule: ['set_project_calendar'] },
	goal: { create: ['create_onto_goal'], update: ['update_onto_goal'] },
	plan: { create: ['create_onto_plan'], update: ['update_onto_plan'] },
	milestone: { create: ['create_onto_milestone'], update: ['update_onto_milestone'] },
	risk: { create: ['create_onto_risk'], update: ['update_onto_risk'] },
	relationship: { link: ['link_onto_entities'] },
	entity: { tag: ['tag_onto_entity'] }
};

/**
 * Returns only non-destructive tools that can make progress on a contract.
 * This is recovery routing, not the contract's meaning or its fulfillment test.
 */
export function getSafeWriteToolNamesForTurnContract(
	contract: TurnContract | null | undefined
): string[] {
	if (!contract) return [];
	return Array.from(
		new Set(
			contract.outcomes.flatMap(
				(outcome) => SAFE_WRITE_TOOLS_BY_OUTCOME[outcome.entityKind]?.[outcome.action] ?? []
			)
		)
	);
}

function actionMatches(expected: TurnContractAction, entry: WriteLedgerEntry): boolean {
	const actual = entry.action ?? '';
	if (expected === actual) return true;
	if (expected === 'organize') return actual === 'move' || actual === 'organize';
	if (expected === 'schedule')
		return actual === 'create' || actual === 'update' || actual === 'set';
	if (actual !== 'update') return false;
	if (expected === 'assign') {
		return Boolean(
			entry.changedFields?.some((field) =>
				['assignee_actor_ids', 'assignee_handles'].includes(field)
			)
		);
	}
	if (expected === 'complete') return ['done', 'completed'].includes(entry.stateKey ?? '');
	if (expected === 'archive') return ['archived', 'cancelled'].includes(entry.stateKey ?? '');
	if (expected === 'restore') {
		return Boolean(entry.stateKey && !['archived', 'cancelled'].includes(entry.stateKey));
	}
	return false;
}

function entityMatches(expected: TurnContractEntityKind, actual: string): boolean {
	return expected === 'entity' || expected === actual;
}

function resolveOutcome(
	outcome: TurnContractOutcome,
	ledger: WriteLedgerEntry[]
): TurnContractOutcomeResult {
	const candidates = ledger.filter(
		(entry) =>
			entry.status === 'success' &&
			Boolean(entry.action && actionMatches(outcome.action, entry)) &&
			Boolean(entry.entityKind && entityMatches(outcome.entityKind, entry.entityKind)) &&
			(outcome.targetIds.length === 0 ||
				Boolean(entry.entityId && outcome.targetIds.includes(entry.entityId)))
	);
	const requiredFields = outcome.requiredFields.map(normalizeFieldName);
	const candidatesForTarget = (targetId: string): WriteLedgerEntry[] =>
		candidates.filter((entry) => entry.entityId === targetId);
	const entriesHaveRequiredFields = (entries: WriteLedgerEntry[]): boolean => {
		const fields = new Set(
			entries.flatMap((entry) => (entry.changedFields ?? []).map(normalizeFieldName))
		);
		return requiredFields.every((field) => fields.has(field));
	};
	const matchedCandidateTargetIds = Array.from(
		new Set(candidates.map((entry) => entry.entityId).filter((id): id is string => Boolean(id)))
	).filter((targetId) => entriesHaveRequiredFields(candidatesForTarget(targetId)));
	const matchedTargetIds = new Set(matchedCandidateTargetIds);
	const missingTargetIds = outcome.targetIds.filter((id) => !matchedTargetIds.has(id));
	const missingRequiredFields =
		outcome.targetIds.length > 0
			? outcome.targetIds.flatMap((targetId) => {
					const targetCandidates = candidatesForTarget(targetId);
					return requiredFields
						.filter(
							(field) =>
								!targetCandidates.some((entry) =>
									(entry.changedFields ?? [])
										.map(normalizeFieldName)
										.includes(field)
								)
						)
						.map((field) => `${targetId}.${field}`);
				})
			: requiredFields.filter(
					(field) =>
						!candidates.some((entry) =>
							(entry.changedFields ?? []).map(normalizeFieldName).includes(field)
						)
				);
	const fieldCompleteCandidates = candidates.filter((entry) =>
		entriesHaveRequiredFields([entry])
	);
	const distinctEffects =
		outcome.targetIds.length > 0
			? matchedTargetIds.size
			: new Set(
					fieldCompleteCandidates.map(
						(entry, index) =>
							entry.entityId ?? entry.effectId ?? `${entry.toolName}:${index}`
					)
				).size;
	// targetIds bound the eligible target set; minimumSuccessfulEffects is the
	// semantic completion cardinality. The default equals the target count, but
	// an explicitly reviewed lower minimum permits a bounded partial outcome.
	// Required fields are postconditions and therefore determine which effects
	// count; missing optional candidates are diagnostic, not an extra hidden
	// all-target requirement.
	const fulfilled = distinctEffects >= outcome.minimumSuccessfulEffects;
	return {
		id: outcome.id,
		fulfilled,
		matchedEffects: distinctEffects,
		requiredEffects: outcome.minimumSuccessfulEffects,
		missingTargetIds,
		missingRequiredFields
	};
}

export function resolveTurnContractOutcome(params: {
	contract?: TurnContract | null;
	toolExecutions?: FastToolExecution[] | null;
	finishedReason?: string | null;
}): TurnContractResolution {
	const contract = params.contract ?? null;
	if (!contract) {
		return {
			status: params.finishedReason === 'synthesis_failed' ? 'failed' : 'fulfilled',
			fulfilled: params.finishedReason !== 'synthesis_failed',
			outcomes: [],
			contract: null
		};
	}
	const ledger = buildWriteLedger(params.toolExecutions ?? []);
	const outcomes = contract.outcomes.map((outcome) => resolveOutcome(outcome, ledger));
	const fulfilled = outcomes.every((outcome) => outcome.fulfilled);
	return {
		status: fulfilled
			? 'fulfilled'
			: params.finishedReason === 'supervisor_question'
				? 'blocked'
				: 'unfulfilled',
		fulfilled,
		outcomes,
		contract
	};
}

export function hasSuccessfulDurableEffects(
	toolExecutions: FastToolExecution[] | null | undefined
): boolean {
	return (toolExecutions ?? []).some(
		(execution) => isWriteLedgerToolExecution(execution) && didGatewayExecSucceed(execution)
	);
}
