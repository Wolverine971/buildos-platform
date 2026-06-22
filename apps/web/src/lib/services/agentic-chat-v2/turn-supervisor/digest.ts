// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/digest.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from '../stream-orchestrator/shared';
import { classifyToolFailure, isValidationFailure } from '../stream-orchestrator/tool-failure';

const DISCOVERY_TOOL_NAMES = new Set(['skill_load', 'tool_search', 'tool_schema']);

const WRITE_TOOL_PREFIXES = ['create_', 'update_', 'delete_', 'move_', 'link_', 'unlink_', 'tag_'];

const WRITE_TOOL_NAMES = new Set([
	'change_chat_context',
	'create_calendar_event',
	'create_task_document',
	'delete_calendar_event',
	'link_onto_entities',
	'move_document_in_tree',
	'reorganize_onto_project_graph',
	'set_project_calendar',
	'tag_onto_entity',
	'unlink_onto_edge',
	'update_calendar_event'
]);

export function parseToolArguments(toolCall: ChatToolCall): Record<string, unknown> {
	try {
		const parsed = JSON.parse(toolCall.function.arguments || '{}');
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function extractCanonicalOp(toolCall: ChatToolCall): string | null {
	const args = parseToolArguments(toolCall);
	for (const key of ['op', 'operation', 'help_path']) {
		const value = args[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

export function summarizeToolArguments(args: unknown): {
	fingerprint: string | null;
	idArgs: Record<string, string>;
} {
	const record =
		args && typeof args === 'object' && !Array.isArray(args)
			? (args as Record<string, unknown>)
			: {};
	const fingerprintSource = stableStringify(record);
	return {
		fingerprint: fingerprintSource ? hashString(fingerprintSource) : null,
		idArgs: extractIdArgs(record)
	};
}

export function isLikelyWriteToolName(toolName: string, canonicalOp?: string | null): boolean {
	const normalizedName = toolName.trim();
	const normalizedOp = canonicalOp?.trim() ?? '';
	if (normalizedOp && /\.(create|update|delete|move|link|unlink|tag|set)$/i.test(normalizedOp)) {
		return true;
	}
	if (WRITE_TOOL_NAMES.has(normalizedName)) return true;
	return WRITE_TOOL_PREFIXES.some((prefix) => normalizedName.startsWith(prefix));
}

export function isLikelyReadToolName(toolName: string, canonicalOp?: string | null): boolean {
	const normalizedName = toolName.trim();
	if (DISCOVERY_TOOL_NAMES.has(normalizedName)) return true;
	if (normalizedName.startsWith('get_') || normalizedName.startsWith('list_')) return true;
	if (normalizedName.includes('search') || normalizedName.includes('read')) return true;
	const normalizedOp = canonicalOp?.trim() ?? '';
	return /\.(get|list|search|read|find)$/i.test(normalizedOp);
}

export function classifyToolExecution(
	execution: FastToolExecution
): 'write' | 'read_discovery' | 'other' {
	const canonicalOp = extractCanonicalOp(execution.toolCall);
	const toolName = execution.toolCall.function.name;
	if (isLikelyWriteToolName(toolName, canonicalOp)) return 'write';
	if (isLikelyReadToolName(toolName, canonicalOp)) return 'read_discovery';
	return 'other';
}

export function summarizeToolResult(result: ChatToolResult, maxChars = 220): string | null {
	const source = result.error ?? result.result;
	if (source === undefined || source === null) return null;
	let text: string;
	if (typeof source === 'string') {
		text = source;
	} else {
		try {
			text = JSON.stringify(source);
		} catch {
			text = String(source);
		}
	}
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

export function classifyToolError(error: string | null | undefined): string | null {
	const failure = classifyToolFailure(error);
	if (!failure) return null;
	return isValidationFailure(failure) ? 'validation' : failure.kind;
}

export function buildToolPatternKey(
	tools: Array<{ toolName: string; canonicalOp?: string | null }>
): string {
	return tools.map((tool) => tool.canonicalOp ?? tool.toolName).join('|');
}

function extractIdArgs(args: Record<string, unknown>): Record<string, string> {
	const idArgs: Record<string, string> = {};
	for (const [key, value] of Object.entries(args)) {
		if (!isIdArgKey(key) || typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (!looksLikeUuid(trimmed)) continue;
		idArgs[key] = trimmed;
	}
	return idArgs;
}

function isIdArgKey(key: string): boolean {
	return key === 'id' || key.endsWith('_id') || key.endsWith('Id');
}

function looksLikeUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableStringify(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}
	const record = value as Record<string, unknown>;
	const keys = Object.keys(record).sort();
	return `{${keys
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(',')}}`;
}

function hashString(input: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, '0');
}
