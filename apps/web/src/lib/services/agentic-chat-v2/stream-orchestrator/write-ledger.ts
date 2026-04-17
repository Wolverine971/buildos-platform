// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/write-ledger.ts
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

export type WriteLedgerEntry = {
	toolName: string;
	op?: string;
	status: 'success' | 'failure';
	entityId?: string;
	title?: string;
	stateKey?: string;
	typeKey?: string;
	parentId?: string;
	strategy?: string;
	error?: string;
};

type WriteLedgerClassification = 'write' | 'skip';

type ParsedArgs = Record<string, unknown>;

function classifyToolForLedger(toolName: string): WriteLedgerClassification {
	if (!toolName) return 'skip';
	if (
		toolName.startsWith('create_onto_') ||
		toolName.startsWith('update_onto_') ||
		toolName.startsWith('delete_onto_') ||
		toolName === 'move_document_in_tree' ||
		toolName === 'create_task_document' ||
		toolName === 'link_onto_entities' ||
		toolName === 'unlink_onto_edge' ||
		toolName === 'tag_onto_entity' ||
		toolName === 'reorganize_onto_project_graph' ||
		toolName === 'create_calendar_event' ||
		toolName === 'update_calendar_event' ||
		toolName === 'delete_calendar_event' ||
		toolName === 'set_project_calendar'
	) {
		return 'write';
	}
	return 'skip';
}

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
	const createMatch = toolName.match(/^create_onto_([a-z_]+)$/);
	if (createMatch?.[1]) return createMatch[1];
	const updateMatch = toolName.match(/^update_onto_([a-z_]+)$/);
	if (updateMatch?.[1]) return updateMatch[1];
	const deleteMatch = toolName.match(/^delete_onto_([a-z_]+)$/);
	if (deleteMatch?.[1]) return deleteMatch[1];
	return null;
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
	const fromArgs = readString(args.new_parent_id) ?? readString(args.parent_id);
	if (fromArgs) return fromArgs;
	if (!result) return undefined;
	return readString((result as Record<string, unknown>).new_parent_id);
}

function buildEntryFromExecution(execution: FastToolExecution): WriteLedgerEntry | null {
	const toolName = execution.toolCall.function?.name?.trim() ?? '';
	if (classifyToolForLedger(toolName) === 'skip') return null;

	const args = extractArgs(execution.toolCall);
	const result = extractResultObject(execution.result.result);
	const entityKind = resolveEntityKind(toolName);

	const entry: WriteLedgerEntry = {
		toolName,
		op:
			typeof (execution.toolCall as unknown as { op?: string }).op === 'string'
				? ((execution.toolCall as unknown as { op?: string }).op ?? undefined)
				: undefined,
		status: execution.result.success ? 'success' : 'failure'
	};

	if (execution.result.success) {
		const id = extractIdFromResult(entityKind, result);
		if (id) entry.entityId = id;
		const title =
			extractTitleFromResult(result) ?? readString(args.title) ?? readString(args.name);
		if (title) entry.title = title;
		const stateKey = extractStateKey(result, args);
		if (stateKey) entry.stateKey = stateKey;
		const typeKey = extractTypeKey(result) ?? readString(args.type_key);
		if (typeKey) entry.typeKey = typeKey;
		if (toolName === 'move_document_in_tree') {
			const parentId = extractParentIdFromMove(args, result);
			if (parentId) entry.parentId = parentId;
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
