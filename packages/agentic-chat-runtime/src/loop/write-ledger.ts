// packages/agentic-chat-runtime/src/loop/write-ledger.ts
//
// Builds a compact "write ledger" summary of the durable writes that have
// succeeded or failed during a chat turn. The ledger is injected into the
// model's message context after each tool round so the final user-facing
// response can be grounded in the actual tool results rather than in the
// assistant's planned intent.
//
// The ledger is complementary to the bookend prompt rules and to the
// document-link correction detector. Prompts alone did not reliably keep
// final prose aligned with the write set — see
// docs/reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md
// (Post-Fix Replay Result sections) for the specific omissions this layer is
// designed to prevent.

import type { ChatToolCall } from '@buildos/shared-types';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution } from './shared';
import { isWriteLedgerToolExecution } from './tool-classification';

export type WriteLedgerEntry = {
	toolName: string;
	op?: string;
	status: 'success' | 'failure';
	/** Semantic effect dimensions used by turn-contract fulfillment. */
	action?: string;
	entityKind?: string;
	effectId?: string;
	entityId?: string;
	changedFields?: string[];
	/** Canonical scalar values requested by a successful write, keyed by durable field. */
	changedValues?: Record<string, string>;
	title?: string;
	stateKey?: string;
	typeKey?: string;
	parentId?: string;
	/** Title of the resolved parent for a tree move (from the receipt or the requested title). */
	parentTitle?: string;
	/** True when a parent-by-title move created the parent document. */
	parentCreated?: boolean;
	strategy?: string;
	error?: string;
};

type ParsedArgs = Record<string, unknown>;

function readString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function extractArgs(toolCall: ChatToolCall): ParsedArgs {
	const rawArgs = toolCall.function?.arguments;
	if (!rawArgs) return {};
	const { args } = parseToolArguments(rawArgs);
	return args ?? {};
}

function extractResultObject(result: unknown): ParsedArgs | null {
	if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
	return result as ParsedArgs;
}

function resolveEntityKind(toolName: string): string | null {
	if (toolName === 'move_onto_task') return 'task';
	if (toolName === 'move_document_in_tree' || toolName === 'create_task_document') {
		return 'document';
	}
	if (toolName.includes('calendar_event')) return 'event';
	if (toolName === 'set_project_calendar') return 'calendar';
	if (toolName === 'link_onto_entities' || toolName === 'unlink_onto_edge') {
		return 'relationship';
	}
	if (toolName === 'reorganize_onto_project_graph') return 'project';
	if (toolName === 'tag_onto_entity') return 'entity';
	const createMatch = toolName.match(/^create_onto_([a-z_]+)$/);
	if (createMatch?.[1]) return createMatch[1];
	const updateMatch = toolName.match(/^update_onto_([a-z_]+)$/);
	if (updateMatch?.[1]) return updateMatch[1];
	const deleteMatch = toolName.match(/^delete_onto_([a-z_]+)$/);
	if (deleteMatch?.[1]) return deleteMatch[1];
	return null;
}

function resolveAction(toolName: string): string | null {
	for (const action of [
		'create',
		'update',
		'delete',
		'move',
		'link',
		'unlink',
		'reorganize',
		'set',
		'assign',
		'complete',
		'archive',
		'restore',
		'tag'
	]) {
		if (toolName.startsWith(`${action}_`)) {
			return action === 'reorganize' ? 'organize' : action;
		}
	}
	return null;
}

const NON_EFFECT_ARGUMENTS = new Set([
	'project_id',
	'task_id',
	'document_id',
	'event_id',
	'goal_id',
	'plan_id',
	'milestone_id',
	'risk_id',
	'edge_id',
	'entity_id',
	'new_parent_id',
	'parent_id',
	'expected_source_project_id',
	'destination_project_id',
	'confirmation_token',
	'update_strategy',
	'merge_instructions',
	'confirm',
	'idempotency_key'
]);

function normalizeFieldName(value: string): string {
	const normalized = value
		.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`)
		.toLowerCase();
	if (normalized === 'new_parent_id') return 'parent_id';
	// A parent chosen by title is still a parent placement; the resolved id
	// comes back in the receipt.
	if (normalized === 'new_parent_title' || normalized === 'parent_title') return 'parent_id';
	if (normalized === 'new_position') return 'position';
	return normalized;
}

function moveSelectsParent(toolName: string, args: ParsedArgs): boolean {
	return (
		(toolName === 'move_document_in_tree' &&
			(Object.hasOwn(args, 'new_parent_id') || Object.hasOwn(args, 'new_parent_title'))) ||
		(toolName === 'create_onto_document' && Object.hasOwn(args, 'parent_id'))
	);
}

/** Canonical effect fields recorded for these tool arguments, excluding routing metadata. */
export function getWriteLedgerChangedFields(toolName: string, args: ParsedArgs): string[] {
	const fields = Object.entries(args)
		.filter(
			([key, value]) =>
				!NON_EFFECT_ARGUMENTS.has(normalizeFieldName(key)) && value !== undefined
		)
		.map(([key]) => normalizeFieldName(key));
	// A tree parent is an identity-like routing argument at the adapter boundary,
	// but changing or selecting it is the semantic effect of a document
	// organization. Preserve null root placement via property presence.
	if (moveSelectsParent(toolName, args)) {
		fields.push('parent_id');
	}
	return Array.from(new Set(fields)).sort();
}

function canonicalScalarEffectValue(value: unknown): string | undefined {
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
		return String(value);
	}
	return undefined;
}

/**
 * Preserve exact scalar postconditions as well as field presence. Turn
 * contracts can declare `priority=1`, for example; recording only `priority`
 * would let a successful write to priority 5 satisfy that contract.
 */
function extractChangedValues(
	toolName: string,
	args: ParsedArgs,
	result: ParsedArgs | null
): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [key, value] of Object.entries(args)) {
		const field = normalizeFieldName(key);
		if (NON_EFFECT_ARGUMENTS.has(field) || value === undefined) continue;
		const canonical = canonicalScalarEffectValue(value);
		if (canonical !== undefined) values[field] = canonical;
	}
	if (moveSelectsParent(toolName, args)) {
		// The receipt's resolved parent wins: a parent selected by title only
		// has an id after execution, and an exact-id move echoes the same id.
		const resolved =
			toolName === 'move_document_in_tree' && result
				? readString((result as Record<string, unknown>).parent_id)
				: undefined;
		const value =
			resolved ??
			(Object.hasOwn(args, 'new_parent_id') ? args.new_parent_id : args.parent_id);
		const canonical = canonicalScalarEffectValue(value);
		if (canonical !== undefined) values.parent_id = canonical;
	}
	return values;
}

function extractIdFromArgs(entityKind: string | null, args: ParsedArgs): string | undefined {
	if (entityKind) {
		const direct = readString(args[`${entityKind}_id`]);
		if (direct) return direct;
	}
	for (const key of [
		'document_id',
		'task_id',
		'project_id',
		'event_id',
		'goal_id',
		'plan_id',
		'milestone_id',
		'risk_id',
		'entity_id',
		'edge_id'
	]) {
		const id = readString(args[key]);
		if (id) return id;
	}
	return undefined;
}

function extractIdFromResult(
	entityKind: string | null,
	result: ParsedArgs | null
): string | undefined {
	if (!result || !entityKind) return undefined;
	const direct = readString((result as Record<string, unknown>)[`${entityKind}_id`]);
	if (direct) return direct;
	const nested = (result as Record<string, unknown>)[entityKind];
	if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
		const nestedId = readString((nested as Record<string, unknown>).id);
		if (nestedId) return nestedId;
	}
	const flatId = readString((result as Record<string, unknown>).id);
	return flatId;
}

function extractTitleFromResult(result: ParsedArgs | null): string | undefined {
	if (!result) return undefined;
	const directTitle =
		readString((result as Record<string, unknown>).title) ??
		readString((result as Record<string, unknown>).name);
	if (directTitle) return directTitle;
	for (const key of [
		'task',
		'project',
		'goal',
		'plan',
		'document',
		'milestone',
		'risk',
		'event'
	]) {
		const nested = (result as Record<string, unknown>)[key];
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			const nestedTitle =
				readString((nested as Record<string, unknown>).title) ??
				readString((nested as Record<string, unknown>).name);
			if (nestedTitle) return nestedTitle;
		}
	}
	return undefined;
}

function extractStateKey(result: ParsedArgs | null, args: ParsedArgs): string | undefined {
	if (result) {
		for (const key of ['task', 'project', 'goal', 'plan', 'document']) {
			const nested = (result as Record<string, unknown>)[key];
			if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
				const state = readString((nested as Record<string, unknown>).state_key);
				if (state) return state;
			}
		}
		const flat = readString((result as Record<string, unknown>).state_key);
		if (flat) return flat;
	}
	return readString(args.state_key);
}

function extractTypeKey(result: ParsedArgs | null): string | undefined {
	if (!result) return undefined;
	for (const key of ['task', 'project', 'goal', 'plan', 'document', 'milestone', 'risk']) {
		const nested = (result as Record<string, unknown>)[key];
		if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
			const typeKey = readString((nested as Record<string, unknown>).type_key);
			if (typeKey) return typeKey;
		}
	}
	return readString((result as Record<string, unknown>).type_key);
}

function extractParentIdFromMove(args: ParsedArgs, result: ParsedArgs | null): string | undefined {
	if (result) {
		const fromReceipt =
			readString((result as Record<string, unknown>).parent_id) ??
			readString((result as Record<string, unknown>).new_parent_id);
		if (fromReceipt) return fromReceipt;
	}
	return readString(args.new_parent_id) ?? readString(args.parent_id);
}

function buildEntryFromExecution(execution: FastToolExecution): WriteLedgerEntry | null {
	const toolName = execution.toolCall.function?.name?.trim() ?? '';
	if (!isWriteLedgerToolExecution(execution)) return null;

	const args = extractArgs(execution.toolCall);
	const result = extractResultObject(execution.result.result);
	const entityKind = resolveEntityKind(toolName);
	const action = resolveAction(toolName);

	const entry: WriteLedgerEntry = {
		toolName,
		op:
			typeof (execution.toolCall as unknown as { op?: string }).op === 'string'
				? ((execution.toolCall as unknown as { op?: string }).op ?? undefined)
				: undefined,
		status: execution.result.success ? 'success' : 'failure'
	};
	if (action) entry.action = action;
	if (entityKind) entry.entityKind = entityKind;
	if (execution.toolCall.id) entry.effectId = execution.toolCall.id;
	const changedFields = getWriteLedgerChangedFields(toolName, args);
	if (changedFields.length > 0) entry.changedFields = changedFields;
	const changedValues = extractChangedValues(
		toolName,
		args,
		execution.result.success ? result : null
	);
	if (Object.keys(changedValues).length > 0) entry.changedValues = changedValues;
	const entityId = extractIdFromResult(entityKind, result) ?? extractIdFromArgs(entityKind, args);
	if (entityId) entry.entityId = entityId;
	// Lifecycle semantics describe the attempted durable effect as well as a
	// successful one. Preserve the requested/result state on failures so a
	// failed archive/restore/complete call remains evidence for its declaration
	// instead of becoming an unrelated generic update obligation.
	const stateKey = extractStateKey(result, args);
	if (stateKey) entry.stateKey = stateKey;

	if (execution.result.success) {
		const title =
			extractTitleFromResult(result) ?? readString(args.title) ?? readString(args.name);
		if (title) entry.title = title;
		const typeKey = extractTypeKey(result) ?? readString(args.type_key);
		if (typeKey) entry.typeKey = typeKey;
		if (toolName === 'move_document_in_tree') {
			const parentId = extractParentIdFromMove(args, result);
			if (parentId) entry.parentId = parentId;
			const parentTitle =
				(result
					? readString((result as Record<string, unknown>).parent_title)
					: undefined) ?? readString(args.new_parent_title);
			if (parentTitle) entry.parentTitle = parentTitle;
			if (result && (result as Record<string, unknown>).parent_created === true) {
				entry.parentCreated = true;
			}
		}
		if (toolName === 'update_onto_document') {
			const strategy = readString(args.update_strategy as string);
			if (strategy) entry.strategy = strategy;
		}
	} else {
		const errorText = readString(execution.result.error);
		if (errorText) {
			entry.error = errorText.length > 180 ? `${errorText.slice(0, 177)}...` : errorText;
		}
	}

	return entry;
}

export function buildWriteLedger(toolExecutions: FastToolExecution[]): WriteLedgerEntry[] {
	const entries: WriteLedgerEntry[] = [];
	for (const execution of toolExecutions) {
		const entry = buildEntryFromExecution(execution);
		if (entry) entries.push(entry);
	}
	return entries;
}

function escapeYamlString(value: string): string {
	// YAML-like escaping. Wrap in quotes when the value contains characters
	// that would otherwise break single-line scalar parsing.
	if (!/["'\n:#|>*&!%@`]/.test(value) && !/^[\s-?]/.test(value)) {
		return value;
	}
	return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;
}

function describeEntryAsYaml(
	entry: WriteLedgerEntry,
	indexLabel: string,
	indent: string
): string[] {
	const lines: string[] = [];
	lines.push(`${indent}${indexLabel} tool: ${entry.toolName}`);
	const fieldIndent = `${indent}   `;
	if (entry.entityId) lines.push(`${fieldIndent}entity_id: ${entry.entityId}`);
	if (entry.title) lines.push(`${fieldIndent}title: ${escapeYamlString(entry.title)}`);
	if (entry.stateKey) lines.push(`${fieldIndent}state_key: ${entry.stateKey}`);
	if (entry.typeKey) lines.push(`${fieldIndent}type_key: ${entry.typeKey}`);
	if (entry.parentId) lines.push(`${fieldIndent}new_parent_id: ${entry.parentId}`);
	if (entry.strategy) lines.push(`${fieldIndent}update_strategy: ${entry.strategy}`);
	return lines;
}

function describeFailureAsYaml(
	entry: WriteLedgerEntry,
	indexLabel: string,
	indent: string
): string[] {
	const lines: string[] = [];
	lines.push(`${indent}${indexLabel} tool: ${entry.toolName}`);
	const fieldIndent = `${indent}   `;
	lines.push(`${fieldIndent}error: ${escapeYamlString(entry.error ?? 'rejected')}`);
	return lines;
}

/**
 * Formats a ledger entry list into the message body shown to the model.
 * Returns null when there is nothing meaningful to show (no writes and no
 * failures). The caller should skip injection in that case to avoid bloating
 * the prompt.
 *
 * Format design:
 * - Wrapped in `<write_ledger>` XML-style tags so the model treats the block
 *   as structured context to consume, not a rule list to paraphrase.
 * - Body uses YAML-style scalars (`tool:`, `entity_id:`, `title:`) instead of
 *   inline `key=value` pairs — machine-readable cues that reinforce "this is
 *   data, not instructions".
 * - Single prose instruction at the end, not a multi-bullet "Final-response
 *   rules" list. Earlier versions used a bulleted rules block with its own
 *   "Final-response rules:" heading; Grok-4.1-fast mirrored that heading
 *   verbatim into the user-visible final response. See the 2026-04-17
 *   consolidation replay for evidence.
 */
export function formatWriteLedgerMessage(entries: WriteLedgerEntry[]): string | null {
	const successes = entries.filter((entry) => entry.status === 'success');
	const failures = entries.filter((entry) => entry.status === 'failure');
	if (successes.length === 0 && failures.length === 0) return null;

	const lines: string[] = [];
	lines.push('<write_ledger>');
	lines.push(`successful_writes: # count=${successes.length}`);
	if (successes.length === 0) {
		lines.push('  []');
	} else {
		successes.forEach((entry, index) => {
			lines.push(...describeEntryAsYaml(entry, `${index + 1}.`, '  '));
		});
	}
	lines.push(`failed_writes: # count=${failures.length}`);
	if (failures.length === 0) {
		lines.push('  []');
	} else {
		failures.forEach((entry, index) => {
			lines.push(...describeFailureAsYaml(entry, `${index + 1}.`, '  '));
		});
	}
	lines.push('</write_ledger>');
	lines.push('');
	// Grounding instruction. The previous pass (2026-04-17) tried rubric-style
	// language ("MUST reference each of the N", "Missing a title makes the
	// response incomplete", "Do not batch ... ('created 5 tasks')") to force
	// enumeration. Replay `1aea16fb` showed Grok-4.1-fast treated that rubric
	// as grading criteria, entered evaluation mode, hallucinated a "previous
	// assistant response" to grade, and truncated mid-sentence. Keep the
	// numbered entries above (data), use a single declarative sentence here
	// (no grading verbs, no quoted counter-examples). Turn-level enumeration
	// completeness is an open harness-layer problem; do not force it through
	// prompt imperatives.
	lines.push(
		'Your next user-facing response names each listed successful write by title (or by what changed when no title exists) and discloses each listed failed write as not persisted. Do not claim any state_key, type_key, new_parent_id, update_strategy, or linking that does not appear in a ledger row.'
	);

	return lines.join('\n');
}

/**
 * Convenience wrapper that both builds and formats the ledger in one call.
 * Returns null when there are no writes or failures yet.
 */
export function buildWriteLedgerMessage(toolExecutions: FastToolExecution[]): string | null {
	return formatWriteLedgerMessage(buildWriteLedger(toolExecutions));
}
