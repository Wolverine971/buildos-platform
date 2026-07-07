// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-classification.ts
import type { ChatToolCall } from '@buildos/shared-types';
import { TOOL_METADATA } from '$lib/services/agentic-chat/tools/core/definitions/tool-metadata';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution } from './shared';

export type GatewayExecResultData = {
	op?: string;
	ok?: boolean;
	result?: unknown;
	meta?: unknown;
};

export type ToolExecutionClassification = 'write' | 'read_discovery' | 'other';

const DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set([
	'domain_search',
	'domain_load',
	'outcome_card_search',
	'outcome_card_load',
	'work_capability_search',
	'work_capability_load',
	'skill_search',
	'resource_search',
	'resource_load',
	'tool_search',
	'tool_schema',
	'skill_load',
	'skill_reference_load',
	'libri_overview',
	'libri_search_capabilities',
	'libri_get_capability_schema'
]);

const TRACE_DISCOVERY_TOOL_NAMES: ReadonlySet<string> = new Set([
	'skill_search',
	'domain_search',
	'skill_load',
	'tool_search',
	'tool_schema'
]);

const WRITE_TOOL_PREFIXES = [
	'create_',
	'update_',
	'delete_',
	'move_',
	'link_',
	'unlink_',
	'reorganize_',
	'set_',
	'assign_',
	'complete_',
	'archive_',
	'restore_',
	'tag_'
];

const WRITE_OP_SUFFIXES = [
	'.create',
	'.update',
	'.delete',
	'.move',
	'.link',
	'.unlink',
	'.reorganize',
	'.set',
	'.assign',
	'.complete',
	'.archive',
	'.restore',
	'.tag'
];

const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
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

const WRITE_LEDGER_TOOL_NAMES: ReadonlySet<string> = new Set([
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

const READ_TOOL_PREFIXES = ['get_', 'list_', 'search_', 'find_', 'read_'];
const READ_OP_SUFFIXES = ['.get', '.list', '.search', '.visit', '.read', '.find'];

export function extractCanonicalOp(toolCall: ChatToolCall): string | null {
	const { args } = parseToolArguments(toolCall.function?.arguments);
	for (const key of ['op', 'operation', 'help_path']) {
		const value = args[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return null;
}

export function resolveToolOperationName(toolName: string, canonicalOp?: string | null): string {
	const normalizedToolName = toolName.trim();
	if (!normalizedToolName) return canonicalOp?.trim() ?? '';
	const registryEntry = getToolRegistry().byToolName[normalizedToolName];
	return registryEntry?.op ?? canonicalOp?.trim() ?? normalizedToolName;
}

export function isDiscoveryToolName(name: string): boolean {
	return DISCOVERY_TOOL_NAMES.has(name.trim().toLowerCase());
}

export function isWriteLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		WRITE_TOOL_NAMES.has(normalized) ||
		WRITE_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
		WRITE_OP_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
	);
}

export function isReadLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized === 'web_visit' ||
		normalized.startsWith('x.search.') ||
		READ_TOOL_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
		READ_OP_SUFFIXES.some((suffix) => normalized.endsWith(suffix)) ||
		normalized.includes('search')
	);
}

export function isLikelyWriteToolName(toolName: string, canonicalOp?: string | null): boolean {
	const normalizedName = toolName.trim();
	if (!normalizedName) return false;
	const registryEntry = getToolRegistry().byToolName[normalizedName];
	if (registryEntry?.kind === 'write') return true;
	if (TOOL_METADATA[normalizedName]?.category === 'write') return true;
	if (isWriteLikeOperation(normalizedName)) return true;
	const operationName = resolveToolOperationName(normalizedName, canonicalOp);
	const normalizedOp = operationName ? normalizeGatewayOpName(operationName) : '';
	return Boolean(normalizedOp && isWriteLikeOperation(normalizedOp));
}

export function isLikelyReadToolName(toolName: string, canonicalOp?: string | null): boolean {
	const normalizedName = toolName.trim();
	if (!normalizedName) return false;
	if (isDiscoveryToolName(normalizedName)) return true;
	const registryEntry = getToolRegistry().byToolName[normalizedName];
	if (registryEntry?.kind === 'read') return true;
	const metadataCategory = TOOL_METADATA[normalizedName]?.category;
	if (metadataCategory === 'read' || metadataCategory === 'search') return true;
	if (isReadLikeOperation(normalizedName)) return true;
	const operationName = resolveToolOperationName(normalizedName, canonicalOp);
	const normalizedOp = operationName ? normalizeGatewayOpName(operationName) : '';
	return Boolean(normalizedOp && isReadLikeOperation(normalizedOp));
}

export function isPureReadToolName(toolName: string): boolean {
	const normalized = toolName.trim();
	if (!normalized) return false;
	if (isDiscoveryToolName(normalized)) return false;
	if (isLikelyWriteToolName(normalized)) return false;
	const category = TOOL_METADATA[normalized]?.category;
	return category === 'read' || category === 'search';
}

export function classifyToolExecution(execution: FastToolExecution): ToolExecutionClassification {
	const toolName = execution.toolCall.function.name;
	if (isDiscoveryToolName(toolName)) return 'read_discovery';
	const canonicalOp = extractCanonicalOp(execution.toolCall);
	if (isLikelyWriteToolName(toolName, canonicalOp)) return 'write';
	if (isLikelyReadToolName(toolName, canonicalOp)) return 'read_discovery';
	return 'other';
}

export function classifyToolTraceName(toolName: string): ToolExecutionClassification {
	const normalized = toolName.trim();
	if (!normalized) return 'other';
	if (TRACE_DISCOVERY_TOOL_NAMES.has(normalized)) return 'read_discovery';
	if (isLikelyWriteToolName(normalized)) return 'write';
	return 'other';
}

export function isWriteLedgerToolExecution(execution: FastToolExecution): boolean {
	if (isDuplicateWriteSkippedExecution(execution)) return false;
	const toolName = execution.toolCall.function?.name?.trim() ?? '';
	if (!toolName) return false;
	return (
		toolName.startsWith('create_onto_') ||
		toolName.startsWith('update_onto_') ||
		toolName.startsWith('delete_onto_') ||
		WRITE_LEDGER_TOOL_NAMES.has(toolName)
	);
}

export function didToolExecutionReachWriteExecutor(execution: FastToolExecution): boolean {
	if (classifyToolExecution(execution) !== 'write') return false;
	if (isDuplicateWriteSkippedExecution(execution)) return false;
	const error = execution.result.error;
	return !(typeof error === 'string' && error.startsWith('Tool validation failed:'));
}

export function extractGatewayExecResultData(payload: unknown): GatewayExecResultData | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;
	const hasGatewayShape =
		'op' in record || 'ok' in record || 'result' in record || 'meta' in record;
	if (!hasGatewayShape) return null;
	return {
		op: typeof record.op === 'string' ? record.op : undefined,
		ok: typeof record.ok === 'boolean' ? record.ok : undefined,
		result: record.result,
		meta: record.meta
	};
}

export function didGatewayExecSucceed(execution: FastToolExecution | null): boolean {
	if (!execution || execution.result.success !== true) {
		return false;
	}
	const payload = extractGatewayExecResultData(execution.result.result);
	if (payload && typeof payload.ok === 'boolean') {
		return payload.ok;
	}
	return true;
}

export function isDuplicateWriteSkippedExecution(execution: FastToolExecution | null): boolean {
	if (!execution || execution.result.success !== true) return false;
	const payload = execution.result.result;
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
	const record = payload as Record<string, unknown>;
	if (record.skipped_duplicate_write === true || record.status === 'duplicate_write_skipped') {
		return true;
	}
	const nested = record.result;
	if (!nested || typeof nested !== 'object' || Array.isArray(nested)) return false;
	const nestedRecord = nested as Record<string, unknown>;
	return (
		nestedRecord.skipped_duplicate_write === true ||
		nestedRecord.status === 'duplicate_write_skipped'
	);
}

export function getGatewayExecOp(execution: FastToolExecution): string | null {
	const toolName = execution.toolCall.function?.name?.trim();
	if (!toolName) return null;
	const registryEntry = getToolRegistry().byToolName[toolName];
	return registryEntry?.op ?? null;
}

export function didGatewayOpExecute(toolExecutions: FastToolExecution[], op: string): boolean {
	const normalizedTarget = normalizeGatewayOpName(op);
	return toolExecutions.some((execution) => getGatewayExecOp(execution) === normalizedTarget);
}

export function didSuccessfulGatewayOpExecute(
	toolExecutions: FastToolExecution[],
	op: string
): boolean {
	const normalizedTarget = normalizeGatewayOpName(op);
	return toolExecutions.some(
		(execution) =>
			getGatewayExecOp(execution) === normalizedTarget && didGatewayExecSucceed(execution)
	);
}
