// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts
import type { ChatToolCall } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { getToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';

export type RoundToolPattern = {
	readOps: string[];
	hasWriteOps: boolean;
};

export type GatewayExecResultData = {
	op?: string;
	ok?: boolean;
	result?: unknown;
	meta?: unknown;
};

export function buildToolRoundFingerprint(roundExecutions: FastToolExecution[]): string {
	if (!Array.isArray(roundExecutions) || roundExecutions.length === 0) return '';
	const entries = roundExecutions.map(({ toolCall, result }) => {
		const parsed = parseToolArguments(toolCall.function?.arguments);
		return {
			tool: toolCall.function?.name ?? '',
			args: parsed.args,
			success: result.success === true,
			error: typeof result.error === 'string' ? result.error.trim() : null
		};
	});
	return stableStringify(entries);
}

export function extractGatewayRequiredFieldFailures(
	roundExecutions: FastToolExecution[]
): GatewayRequiredFieldFailure[] {
	const failures = new Map<string, GatewayRequiredFieldFailure>();
	const addFailure = (op: unknown, errorMessage: unknown): void => {
		addGatewayRequiredFieldFailure(failures, op, errorMessage);
	};

	for (const { toolCall, result } of roundExecutions) {
		addFailure(getGatewayExecOp({ toolCall, result }), result.error);
	}

	return Array.from(failures.values());
}

export function extractGatewayRequiredFieldFailuresFromValidationIssues(
	issues: ToolValidationIssue[]
): GatewayRequiredFieldFailure[] {
	const failures = new Map<string, GatewayRequiredFieldFailure>();

	for (const issue of issues) {
		if (!issue.op) continue;
		for (const error of issue.errors) {
			addGatewayRequiredFieldFailure(failures, issue.op, error);
		}
	}

	return Array.from(failures.values());
}

export function hasDocumentOrganizationValidationIssue(issues: ToolValidationIssue[]): boolean {
	return issues.some((issue) => {
		const op = issue.op ?? '';
		if (op !== 'onto.document.delete' && op !== 'onto.document.tree.move') return false;
		return issue.errors.some((error) =>
			error.includes('Missing required parameter: document_id')
		);
	});
}

export function buildRoundToolPattern(toolCalls: ChatToolCall[]): RoundToolPattern {
	const readOps = new Set<string>();
	let hasWriteOps = false;

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim();
		if (!toolName) continue;

		const registryOp = getToolRegistry().byToolName[toolName]?.op;
		const operationName = registryOp ?? toolName;

		if (isWriteLikeOperation(operationName)) {
			hasWriteOps = true;
			continue;
		}

		if (isReadLikeOperation(operationName)) {
			readOps.add(operationName.toLowerCase());
		}
	}

	return {
		readOps: Array.from(readOps).sort(),
		hasWriteOps
	};
}

export function hasDocumentOrganizationFailureSignal(
	failures: GatewayRequiredFieldFailure[]
): boolean {
	return failures.some((failure) => {
		const op = normalizeGatewayOpName(failure.op).toLowerCase();
		const field = failure.field.trim().toLowerCase();
		return op.startsWith('onto.document.') && field === 'document_id';
	});
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

export function getDocumentTreeRootCount(treeResult: unknown): number {
	if (!treeResult || typeof treeResult !== 'object') return 0;
	const structure =
		(treeResult as Record<string, unknown>).structure &&
		typeof (treeResult as Record<string, unknown>).structure === 'object'
			? ((treeResult as Record<string, unknown>).structure as Record<string, unknown>)
			: null;
	const root = structure && Array.isArray(structure.root) ? structure.root : [];
	return root.length;
}

export function extractUnlinkedDocumentIds(treeResult: unknown): string[] {
	if (!treeResult || typeof treeResult !== 'object') return [];
	const record = treeResult as Record<string, unknown>;
	const unlinkedRaw = Array.isArray(record.unlinked) ? record.unlinked : [];
	const unlinkedFromField = unlinkedRaw
		.map((entry) => {
			if (typeof entry === 'string') return entry.trim();
			if (entry && typeof entry === 'object') {
				const id = (entry as Record<string, unknown>).id;
				return typeof id === 'string' ? id.trim() : '';
			}
			return '';
		})
		.filter((value) => value.length > 0);
	if (unlinkedFromField.length > 0) {
		return Array.from(new Set(unlinkedFromField));
	}

	const documents =
		record.documents && typeof record.documents === 'object'
			? (record.documents as Record<string, unknown>)
			: null;
	if (!documents) {
		return [];
	}

	const linkedIds = new Set<string>();
	const structure =
		record.structure && typeof record.structure === 'object'
			? (record.structure as Record<string, unknown>)
			: null;
	const root = structure && Array.isArray(structure.root) ? structure.root : [];
	collectDocumentTreeNodeIds(root, linkedIds);

	return Object.keys(documents)
		.map((id) => id.trim())
		.filter((id) => id.length > 0 && !linkedIds.has(id));
}

export function isReadLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized === 'tool_search' ||
		normalized === 'tool_schema' ||
		normalized === 'skill_load' ||
		normalized.startsWith('get_') ||
		normalized.startsWith('list_') ||
		normalized.startsWith('search_') ||
		normalized.startsWith('find_') ||
		normalized.endsWith('.get') ||
		normalized.endsWith('.list') ||
		normalized.endsWith('.search')
	);
}

export function isWriteLikeOperation(name: string): boolean {
	const normalized = name.trim().toLowerCase();
	if (!normalized) return false;
	return (
		normalized.startsWith('create_') ||
		normalized.startsWith('update_') ||
		normalized.startsWith('delete_') ||
		normalized.startsWith('move_') ||
		normalized.startsWith('link_') ||
		normalized.startsWith('unlink_') ||
		normalized.startsWith('reorganize_') ||
		normalized.startsWith('set_') ||
		normalized.startsWith('assign_') ||
		normalized.startsWith('complete_') ||
		normalized.startsWith('archive_') ||
		normalized.startsWith('restore_') ||
		normalized.endsWith('.create') ||
		normalized.endsWith('.update') ||
		normalized.endsWith('.delete') ||
		normalized.endsWith('.move') ||
		normalized.endsWith('.link') ||
		normalized.endsWith('.unlink') ||
		normalized.endsWith('.reorganize') ||
		normalized.endsWith('.set') ||
		normalized.endsWith('.assign') ||
		normalized.endsWith('.complete') ||
		normalized.endsWith('.archive') ||
		normalized.endsWith('.restore')
	);
}

export function didGatewayExecSucceed(execution: FastToolExecution | null): boolean {
	if (!execution || execution.result.success !== true) {
		return false;
	}
	const payload = extractGatewayExecResultData(execution.result.result);
	if (!payload) {
		return true;
	}
	return payload.ok === true;
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

function addGatewayRequiredFieldFailure(
	failures: Map<string, GatewayRequiredFieldFailure>,
	op: unknown,
	errorMessage: unknown
): void {
	const requiredFieldPattern = /Missing required parameter:\s*([a-zA-Z0-9_.-]+)/i;
	const opName = typeof op === 'string' && op.trim().length > 0 ? normalizeGatewayOpName(op) : '';
	const errorText = typeof errorMessage === 'string' ? errorMessage : '';
	if (!opName || !errorText) return;
	const match = errorText.match(requiredFieldPattern);
	if (!match || !match[1]) return;
	const field = match[1];
	const key = `${opName}|${field}`;
	const existing = failures.get(key);
	if (existing) {
		existing.occurrences += 1;
		return;
	}
	failures.set(key, { op: opName, field, occurrences: 1 });
}

function collectDocumentTreeNodeIds(nodes: unknown, output: Set<string>): void {
	if (!Array.isArray(nodes)) return;
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue;
		const record = node as Record<string, unknown>;
		const id = record.id;
		if (typeof id === 'string' && id.trim().length > 0) {
			output.add(id.trim());
		}
		const children = record.children;
		if (Array.isArray(children)) {
			collectDocumentTreeNodeIds(children, output);
		}
	}
}

function stableStringify(value: unknown): string {
	const seen = new WeakSet<object>();

	const normalize = (input: unknown): unknown => {
		if (input === null || input === undefined) return input;
		if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
			return input;
		}
		if (Array.isArray(input)) {
			return input.map((item) => normalize(item));
		}
		if (typeof input === 'object') {
			if (seen.has(input as object)) return '[Circular]';
			seen.add(input as object);
			const output: Record<string, unknown> = {};
			for (const key of Object.keys(input as Record<string, unknown>).sort()) {
				output[key] = normalize((input as Record<string, unknown>)[key]);
			}
			return output;
		}
		return String(input);
	};

	return JSON.stringify(normalize(value));
}
