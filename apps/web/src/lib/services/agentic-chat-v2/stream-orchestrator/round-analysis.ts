// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts
import type { ChatToolCall } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { parseToolArguments } from './tool-arguments';
import type { FastToolExecution, GatewayRequiredFieldFailure } from './shared';
import type { ToolValidationIssue } from './tool-validation';
import { parseRequiredParameterFailure } from './tool-failure';
import {
	getGatewayExecOp,
	isDiscoveryToolName,
	isLikelyReadToolName,
	isLikelyWriteToolName,
	resolveToolOperationName
} from './tool-classification';
export type { GatewayExecResultData } from './tool-classification';
export {
	didGatewayExecSucceed,
	didGatewayOpExecute,
	didSuccessfulGatewayOpExecute,
	extractGatewayExecResultData,
	getGatewayExecOp,
	isDuplicateWriteSkippedExecution,
	isReadLikeOperation,
	isWriteLikeOperation
} from './tool-classification';

export type RoundToolPattern = {
	readOps: string[];
	hasWriteOps: boolean;
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
		return issue.errors.some((error) => parseRequiredParameterFailure(error) === 'document_id');
	});
}

export function buildRoundToolPattern(toolCalls: ChatToolCall[]): RoundToolPattern {
	const readOps = new Set<string>();
	let hasWriteOps = false;

	for (const toolCall of toolCalls) {
		const toolName = toolCall.function?.name?.trim();
		if (!toolName) continue;

		const operationName = resolveToolOperationName(toolName);

		if (isLikelyWriteToolName(toolName)) {
			hasWriteOps = true;
			continue;
		}

		// Pure gateway-discovery tools (tool_search/tool_schema/skill_load)
		// do not gather user-facing evidence — they only resolve which tools
		// exist. Counting them as read rounds caused the read-loop escalation
		// to fire on legitimate gateway flows that spent 1-2 rounds resolving
		// the right tool before doing any real reads. Filter them here so the
		// read-loop guard only escalates on actual evidence-gathering rounds.
		if (isDiscoveryToolName(toolName) || isDiscoveryToolName(operationName)) {
			continue;
		}

		if (isLikelyReadToolName(toolName)) {
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

function addGatewayRequiredFieldFailure(
	failures: Map<string, GatewayRequiredFieldFailure>,
	op: unknown,
	errorMessage: unknown
): void {
	const opName = typeof op === 'string' && op.trim().length > 0 ? normalizeGatewayOpName(op) : '';
	const errorText = typeof errorMessage === 'string' ? errorMessage : '';
	if (!opName || !errorText) return;
	const field = parseRequiredParameterFailure(errorText);
	if (!field) return;
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
