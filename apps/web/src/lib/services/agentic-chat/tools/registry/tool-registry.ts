// apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts
/**
 * Tool Registry Builder
 *
 * Generates a stable op-to-tool mapping and metadata index used by tool_help/tool_exec.
 */

import type { ChatToolDefinition } from '@buildos/shared-types';
import type { ToolMetadata, ToolContextScope } from '../core/definitions/types';
import { CHAT_TOOL_DEFINITIONS, TOOL_METADATA } from '../core/definitions';

export type RegistryOp = {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: Record<string, any>;
	group: 'onto' | 'util' | 'cal' | 'x';
	kind: 'read' | 'write';
	entity?: string;
	action?: string;
	contexts?: ToolContextScope[];
};

export type ToolRegistry = {
	version: string;
	ops: Record<string, RegistryOp>;
	byToolName: Record<string, RegistryOp>;
};

const OP_EXCEPTIONS: Record<string, string> = {
	search_ontology: 'onto.search',
	get_document_tree: 'onto.document.tree.get',
	move_document_in_tree: 'onto.document.tree.move',
	get_document_path: 'onto.document.path.get',
	get_entity_relationships: 'onto.entity.relationships.get',
	get_linked_entities: 'onto.entity.links.get',
	list_task_documents: 'onto.task.docs.list',
	create_task_document: 'onto.task.docs.create_or_attach',
	link_onto_entities: 'onto.edge.link',
	unlink_onto_edge: 'onto.edge.unlink',
	reorganize_onto_project_graph: 'onto.project.graph.reorganize',
	get_onto_project_graph: 'onto.project.graph.get'
};

const UTIL_OPS: Record<string, string> = {
	get_field_info: 'util.schema.field_info',
	web_search: 'util.web.search',
	web_visit: 'util.web.visit',
	get_buildos_overview: 'util.buildos.overview',
	get_buildos_usage_guide: 'util.buildos.usage_guide'
};

const CALENDAR_OPS: Record<string, string> = {
	list_calendar_events: 'cal.event.list',
	get_calendar_event_details: 'cal.event.get',
	create_calendar_event: 'cal.event.create',
	update_calendar_event: 'cal.event.update',
	delete_calendar_event: 'cal.event.delete',
	get_project_calendar: 'cal.project.get',
	set_project_calendar: 'cal.project.set'
};

const ENTITY_ALIASES: Record<string, string> = {
	project: 'project',
	projects: 'project',
	task: 'task',
	tasks: 'task',
	goal: 'goal',
	goals: 'goal',
	plan: 'plan',
	plans: 'plan',
	document: 'document',
	documents: 'document',
	milestone: 'milestone',
	milestones: 'milestone',
	risk: 'risk',
	risks: 'risk'
};

const WRITE_PREFIXES = [
	'create_',
	'update_',
	'delete_',
	'link_',
	'unlink_',
	'move_',
	'set_',
	'reorganize_'
];

let cachedRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
	if (!cachedRegistry) {
		cachedRegistry = buildToolRegistry(CHAT_TOOL_DEFINITIONS, TOOL_METADATA);
	}
	return cachedRegistry;
}

export function resetToolRegistryCache(): void {
	cachedRegistry = null;
}

export function buildToolRegistry(
	tools: ChatToolDefinition[],
	metadata: Record<string, ToolMetadata>
): ToolRegistry {
	const ops: Record<string, RegistryOp> = {};
	const byToolName: Record<string, RegistryOp> = {};
	const opMap: Record<string, string> = {};

	for (const tool of tools) {
		const toolName = tool.function?.name;
		if (!toolName) continue;

		const op = deriveOpFromToolName(toolName) ?? `x.misc.${toolName}`;
		opMap[op] = toolName;

		const description = tool.function?.description ?? '';
		const parametersSchema = tool.function?.parameters ?? { type: 'object', properties: {} };
		const toolMeta = metadata[toolName];

		const group = resolveGroup(op);
		const action = resolveAction(op);
		const entity = resolveEntity(op, group);

		const registryOp: RegistryOp = {
			op,
			tool_name: toolName,
			description,
			parameters_schema: parametersSchema,
			group,
			kind: inferKind(toolName, toolMeta),
			entity,
			action,
			contexts: toolMeta?.contexts
		};

		ops[op] = registryOp;
		byToolName[toolName] = registryOp;
	}

	return {
		version: computeRegistryVersion(tools, metadata, opMap),
		ops,
		byToolName
	};
}

function deriveOpFromToolName(toolName: string): string | null {
	if (OP_EXCEPTIONS[toolName]) return OP_EXCEPTIONS[toolName];
	if (UTIL_OPS[toolName]) return UTIL_OPS[toolName];
	if (CALENDAR_OPS[toolName]) return CALENDAR_OPS[toolName];

	const match = toolName.match(/^(list|search|get|create|update|delete)_(onto_)?(.+)$/);
	if (!match) return null;

	const action = match[1];
	let remainder = match[3] ?? '';
	remainder = remainder.replace(/_details$/, '');
	const entityKey = ENTITY_ALIASES[remainder] ?? remainder;
	if (!entityKey) return null;

	return `onto.${entityKey}.${action}`;
}

function resolveGroup(op: string): RegistryOp['group'] {
	if (op.startsWith('onto.')) return 'onto';
	if (op.startsWith('util.')) return 'util';
	if (op.startsWith('cal.')) return 'cal';
	return 'x';
}

function resolveAction(op: string): string | undefined {
	const parts = op.split('.');
	if (parts.length === 0) return undefined;
	return parts[parts.length - 1];
}

function resolveEntity(op: string, group: RegistryOp['group']): string | undefined {
	const parts = op.split('.');
	if (group === 'onto') {
		if (parts.length < 3) return undefined;
		return parts[1];
	}
	if (group === 'cal') {
		if (parts.length < 3) return undefined;
		return parts[1];
	}
	return undefined;
}

function inferKind(toolName: string, meta?: ToolMetadata): 'read' | 'write' {
	if (meta?.category === 'write') return 'write';
	if (WRITE_PREFIXES.some((prefix) => toolName.startsWith(prefix))) return 'write';
	return 'read';
}

function computeRegistryVersion(
	tools: ChatToolDefinition[],
	metadata: Record<string, ToolMetadata>,
	opMap: Record<string, string>
): string {
	const toolPayload = tools.map((tool) => ({
		name: tool.function?.name ?? '',
		description: tool.function?.description ?? '',
		parameters: tool.function?.parameters ?? {}
	}));

	const metaPayload = Object.keys(metadata)
		.sort()
		.map((key) => ({ key, meta: metadata[key] }));

	const input = JSON.stringify({ tools: toolPayload, metadata: metaPayload, opMap });
	return `tool-registry/${fnv1a(input)}`;
}

function fnv1a(input: string): string {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}
