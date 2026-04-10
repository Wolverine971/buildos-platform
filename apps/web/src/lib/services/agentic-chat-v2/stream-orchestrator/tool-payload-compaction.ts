// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import {
	isGatewayExecToolName,
	readGatewayExecInput
} from '$lib/services/agentic-chat/tools/core/gateway-exec-utils';

type ToolArgumentParser = (rawArgs: unknown) => { args: Record<string, any>; error?: string };

const MAX_MODEL_TOOL_PAYLOAD_CHARS = 6000;
const MAX_TOOL_LIST_ITEMS = 20;

export function buildToolPayloadForModel(
	toolCall: ChatToolCall,
	result: ChatToolResult,
	parseToolArguments: ToolArgumentParser
): unknown {
	const basePayload = result.result ?? (result.error ? { error: result.error } : null);
	if (basePayload === null || basePayload === undefined) {
		return null;
	}

	const toolName = toolCall.function?.name?.trim();
	if (toolName === 'tool_help' || toolName === 'tool_schema' || toolName === 'skill_load') {
		return compactToolHelpPayload(basePayload);
	}

	if (isGatewayExecToolName(toolName ?? '')) {
		const parsed = parseToolArguments(toolCall.function?.arguments);
		const op = typeof parsed.args.op === 'string' ? parsed.args.op.trim() : '';
		return compactGatewayExecPayload(op, basePayload);
	}

	if (toolName === 'tool_batch') {
		return compactGatewayBatchPayload(basePayload);
	}

	return applyToolPayloadSizeGuard(basePayload);
}

function compactExampleExecuteOp(payload: unknown): Record<string, any> | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}

	const record = payload as Record<string, any>;
	const compacted: Record<string, any> = { ...record };
	const input = readGatewayExecInput(record);

	delete compacted.args;

	if (Object.keys(input).length > 0) {
		compacted.input = input;
	}

	return compacted;
}

function compactExampleToolCall(payload: unknown): Record<string, any> | undefined {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return undefined;
	}

	const record = payload as Record<string, any>;
	const args =
		record.arguments && typeof record.arguments === 'object' && !Array.isArray(record.arguments)
			? (record.arguments as Record<string, any>)
			: {};

	return {
		name: record.name,
		arguments: args
	};
}

function compactToolHelpPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}

	const record = payload as Record<string, any>;
	const type = typeof record.type === 'string' ? record.type : '';
	if (!type) {
		return applyToolPayloadSizeGuard(payload);
	}

	if (type === 'op' || type === 'tool_schema') {
		const args = Array.isArray(record.args)
			? record.args.slice(0, 24).map((arg: Record<string, any>) => ({
					name: arg?.name,
					type: arg?.type,
					required: arg?.required,
					description:
						typeof arg?.description === 'string'
							? toTextPreview(arg.description, 160)
							: undefined
				}))
			: [];
		return applyToolPayloadSizeGuard({
			type,
			op: record.op,
			tool_name: record.tool_name,
			summary: record.summary,
			usage: record.usage,
			required_args: Array.isArray(record.required_args) ? record.required_args : [],
			id_args: Array.isArray(record.id_args) ? record.id_args : [],
			args,
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 12) : [],
			policy:
				record.policy && typeof record.policy === 'object'
					? {
							do: Array.isArray(record.policy.do) ? record.policy.do.slice(0, 6) : [],
							dont: Array.isArray(record.policy.dont)
								? record.policy.dont.slice(0, 6)
								: [],
							edge_cases: Array.isArray(record.policy.edge_cases)
								? record.policy.edge_cases.slice(0, 4)
								: []
						}
					: undefined,
			example_tool_call: compactExampleToolCall(record.example_tool_call),
			example_execute_op: compactExampleExecuteOp(
				record.example_execute_op ?? record.example_buildos_call ?? record.example_tool_exec
			),
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	if (type === 'skill') {
		return applyToolPayloadSizeGuard({
			type,
			id: record.id ?? record.path,
			name: record.name,
			description: record.description ?? record.summary,
			summary: record.summary,
			when_to_use: Array.isArray(record.when_to_use) ? record.when_to_use.slice(0, 8) : [],
			workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 10) : [],
			related_ops: Array.isArray(record.related_ops) ? record.related_ops.slice(0, 12) : [],
			guardrails: Array.isArray(record.guardrails) ? record.guardrails.slice(0, 8) : [],
			markdown:
				typeof record.markdown === 'string'
					? toTextPreview(record.markdown, 1200)
					: undefined,
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
		});
	}

	if (type === 'capability') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			name: record.name,
			status: record.status,
			summary: record.summary,
			what_you_can_do: Array.isArray(record.what_you_can_do)
				? record.what_you_can_do.slice(0, 8)
				: [],
			skill_entrypoints: Array.isArray(record.skill_entrypoints)
				? record.skill_entrypoints.slice(0, 8)
				: [],
			direct_paths: Array.isArray(record.direct_paths)
				? record.direct_paths.slice(0, 12)
				: [],
			notes: Array.isArray(record.notes) ? record.notes.slice(0, 6) : []
		});
	}

	if (type === 'directory') {
		return applyToolPayloadSizeGuard({
			type,
			path: record.path,
			groups: Array.isArray(record.groups) ? record.groups : undefined,
			items: Array.isArray(record.items) ? record.items.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			capabilities: Array.isArray(record.capabilities)
				? record.capabilities.slice(0, MAX_TOOL_LIST_ITEMS)
				: [],
			skills: Array.isArray(record.skills) ? record.skills.slice(0, MAX_TOOL_LIST_ITEMS) : [],
			workflow: Array.isArray(record.workflow) ? record.workflow.slice(0, 8) : [],
			next_step: record.next_step,
			command_contract:
				record.command_contract && typeof record.command_contract === 'object'
					? record.command_contract
					: undefined,
			examples: Array.isArray(record.examples) ? record.examples.slice(0, 4) : []
		});
	}

	return applyToolPayloadSizeGuard(payload);
}

function compactGatewayExecPayload(op: string, payload: unknown): unknown {
	const normalizedOp = normalizeGatewayOpName(op).toLowerCase();
	if (normalizedOp === 'onto.document.tree.get') {
		return compactDocumentTreeGatewayPayload(payload);
	}
	if (normalizedOp === 'onto.document.list' || normalizedOp === 'onto.document.search') {
		return compactDocumentCollectionGatewayPayload(payload);
	}
	return applyToolPayloadSizeGuard(payload);
}

function compactGatewayBatchPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const results = Array.isArray(record.results) ? record.results : [];
	const compactResults = results.slice(0, MAX_TOOL_LIST_ITEMS).map((entry) => {
		if (!entry || typeof entry !== 'object') {
			return entry;
		}
		const op =
			typeof (entry as Record<string, any>).op === 'string'
				? (entry as Record<string, any>).op
				: undefined;
		const compact: Record<string, unknown> = {
			type:
				typeof (entry as Record<string, any>).type === 'string'
					? (entry as Record<string, any>).type
					: undefined,
			path:
				typeof (entry as Record<string, any>).path === 'string'
					? (entry as Record<string, any>).path
					: undefined,
			op,
			ok: (entry as Record<string, any>).ok
		};
		if (typeof (entry as Record<string, any>).error === 'string') {
			compact.error = (entry as Record<string, any>).error;
		}
		if ((entry as Record<string, any>).result !== undefined) {
			compact.result = op
				? compactGatewayExecPayload(op, (entry as Record<string, any>).result)
				: applyToolPayloadSizeGuard((entry as Record<string, any>).result);
		}
		return compact;
	});

	const output: Record<string, unknown> = {
		ok: record.ok,
		summary: record.summary,
		results: compactResults
	};
	if (results.length > compactResults.length) {
		output.results_truncated = results.length - compactResults.length;
	}
	return applyToolPayloadSizeGuard(output);
}

function compactDocumentTreeGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const treeResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!treeResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const structure =
		treeResult.structure && typeof treeResult.structure === 'object'
			? treeResult.structure
			: {};
	const root = Array.isArray((structure as Record<string, any>).root)
		? ((structure as Record<string, any>).root as Array<Record<string, any>>)
		: [];
	const documents =
		treeResult.documents && typeof treeResult.documents === 'object'
			? (treeResult.documents as Record<string, any>)
			: {};
	const unlinkedRaw = Array.isArray(treeResult.unlinked) ? treeResult.unlinked : [];

	const rootSummary = root.slice(0, MAX_TOOL_LIST_ITEMS).map((node) => ({
		id: typeof node?.id === 'string' ? node.id : null,
		title: typeof node?.title === 'string' ? node.title : null,
		children_count: Array.isArray(node?.children) ? node.children.length : 0
	}));

	const unlinkedSummary = unlinkedRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((item: any) => {
		if (typeof item === 'string') {
			const doc = documents[item];
			return {
				id: item,
				title: typeof doc?.title === 'string' ? doc.title : null
			};
		}
		if (item && typeof item === 'object') {
			return {
				id: typeof item.id === 'string' ? item.id : null,
				title: typeof item.title === 'string' ? item.title : null
			};
		}
		return { id: null, title: null };
	});

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof treeResult.message === 'string' ? treeResult.message : null,
			counts: {
				root_count: root.length,
				document_count: Object.keys(documents).length,
				unlinked_count: unlinkedRaw.length
			},
			root: rootSummary,
			unlinked: unlinkedSummary
		},
		meta: record.meta
	};
	if (root.length > rootSummary.length) {
		(compactPayload.result as Record<string, unknown>).root_truncated =
			root.length - rootSummary.length;
	}
	if (unlinkedRaw.length > unlinkedSummary.length) {
		(compactPayload.result as Record<string, unknown>).unlinked_truncated =
			unlinkedRaw.length - unlinkedSummary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function compactDocumentCollectionGatewayPayload(payload: unknown): unknown {
	if (!payload || typeof payload !== 'object') {
		return payload;
	}
	const record = payload as Record<string, any>;
	const listResult = record.result && typeof record.result === 'object' ? record.result : null;
	if (!listResult) {
		return applyToolPayloadSizeGuard(payload);
	}

	const documentsRaw = Array.isArray(listResult.documents) ? listResult.documents : [];
	const summary = documentsRaw.slice(0, MAX_TOOL_LIST_ITEMS).map((doc: any) => ({
		id: typeof doc?.id === 'string' ? doc.id : null,
		title: typeof doc?.title === 'string' ? doc.title : null,
		type_key: typeof doc?.type_key === 'string' ? doc.type_key : null,
		state_key: typeof doc?.state_key === 'string' ? doc.state_key : null,
		updated_at: typeof doc?.updated_at === 'string' ? doc.updated_at : null,
		content_length:
			typeof doc?.content_length === 'number'
				? doc.content_length
				: typeof doc?.content === 'string'
					? doc.content.length
					: 0,
		description_preview: toTextPreview(doc?.description, 180),
		markdown_outline: compactMarkdownOutline(doc?.markdown_outline)
	}));
	const total =
		typeof listResult.total === 'number' ? listResult.total : Math.max(documentsRaw.length, 0);

	const compactPayload: Record<string, unknown> = {
		op: record.op,
		ok: record.ok,
		result: {
			message: typeof listResult.message === 'string' ? listResult.message : null,
			total,
			documents: summary
		},
		meta: record.meta
	};
	if (documentsRaw.length > summary.length) {
		(compactPayload.result as Record<string, unknown>).documents_truncated =
			documentsRaw.length - summary.length;
	}

	return applyToolPayloadSizeGuard(compactPayload);
}

function toTextPreview(value: unknown, maxLength: number): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length <= maxLength) return trimmed;
	return `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`;
}

function compactMarkdownOutline(outline: unknown): unknown {
	if (!outline || typeof outline !== 'object') return null;
	const record = outline as Record<string, any>;
	const counts =
		record.counts && typeof record.counts === 'object'
			? {
					total:
						typeof (record.counts as Record<string, any>).total === 'number'
							? (record.counts as Record<string, any>).total
							: 0,
					h1:
						typeof (record.counts as Record<string, any>).h1 === 'number'
							? (record.counts as Record<string, any>).h1
							: 0,
					h2:
						typeof (record.counts as Record<string, any>).h2 === 'number'
							? (record.counts as Record<string, any>).h2
							: 0,
					h3:
						typeof (record.counts as Record<string, any>).h3 === 'number'
							? (record.counts as Record<string, any>).h3
							: 0
				}
			: { total: 0, h1: 0, h2: 0, h3: 0 };
	const headings = Array.isArray(record.headings) ? record.headings : [];
	return {
		counts,
		headings: headings.slice(0, 24),
		truncated: Boolean(record.truncated) || headings.length > 24
	};
}

function applyToolPayloadSizeGuard(payload: unknown): unknown {
	try {
		const serialized = JSON.stringify(payload);
		if (serialized.length <= MAX_MODEL_TOOL_PAYLOAD_CHARS) {
			return payload;
		}
		return {
			truncated: true,
			original_length: serialized.length,
			preview: `${serialized.slice(0, MAX_MODEL_TOOL_PAYLOAD_CHARS)}...`
		};
	} catch {
		return payload;
	}
}
