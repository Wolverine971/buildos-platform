// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/digest.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import type { FastToolExecution } from '../stream-orchestrator/shared';

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
	if (!error) return null;
	const normalized = error.toLowerCase();
	if (normalized.includes('validation') || normalized.includes('required parameter')) {
		return 'validation';
	}
	if (normalized.includes('not found') || normalized.includes('missing')) {
		return 'not_found';
	}
	if (normalized.includes('permission') || normalized.includes('unauthorized')) {
		return 'permission';
	}
	if (normalized.includes('timeout') || normalized.includes('timed out')) {
		return 'timeout';
	}
	return 'execution';
}

export function buildToolPatternKey(
	tools: Array<{ toolName: string; canonicalOp?: string | null }>
): string {
	return tools.map((tool) => tool.canonicalOp ?? tool.toolName).join('|');
}
