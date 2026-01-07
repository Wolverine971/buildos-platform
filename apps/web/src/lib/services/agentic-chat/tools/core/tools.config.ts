// apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts
/**
 * Chat Tool Registry & Context Configuration
 *
 * Provides helpers for selecting context-aware tool sets, estimating costs,
 * and generating concise tool summaries for LLM prompts.
 */

import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';

import {
	CHAT_TOOL_DEFINITIONS,
	ENTITY_FIELD_INFO,
	TOOL_METADATA,
	type ToolContextScope,
	type ToolMetadata
} from './tool-definitions';

export { ENTITY_FIELD_INFO } from './tool-definitions';
export { CHAT_TOOL_DEFINITIONS as CHAT_TOOLS } from './tool-definitions';
export type { FieldInfo, ToolMetadata, ToolContextScope } from './tool-definitions';

type PlannerContextType = Exclude<ChatContextType, 'general'>;

const TOOL_DEFINITION_MAP = new Map(
	CHAT_TOOL_DEFINITIONS.map((tool) => [tool.function.name, tool])
);

const TOOL_CONTEXT_SCOPES: ToolContextScope[] = [
	'base',
	'global',
	'project_create',
	'project',
	'project_audit',
	'project_forecast'
];

const TOOL_CONTEXT_SCOPE_SET = new Set<ToolContextScope>(TOOL_CONTEXT_SCOPES);

const TOOL_CONTEXT_ALIASES: Partial<Record<ChatContextType, ToolContextScope[]>> = {
	ontology: ['project'],
	calendar: ['global'],
	brain_dump: ['global'],
	daily_brief_update: ['base']
};

function resolveToolContexts(contextType: ChatContextType): ToolContextScope[] {
	const normalized = contextType === 'general' ? 'global' : contextType;
	const alias = TOOL_CONTEXT_ALIASES[normalized];
	if (alias?.length) {
		return Array.from(new Set(alias));
	}
	if (TOOL_CONTEXT_SCOPE_SET.has(normalized as ToolContextScope)) {
		return [normalized as ToolContextScope];
	}
	return ['global'];
}

export function getDefaultToolNamesForContextType(contextType: ChatContextType): string[] {
	const contexts = new Set<ToolContextScope>(['base', ...resolveToolContexts(contextType)]);
	const names = new Set<string>();

	for (const [toolName, metadata] of Object.entries(TOOL_METADATA)) {
		if (!metadata?.contexts?.length) continue;
		if (metadata.contexts.some((context) => contexts.has(context))) {
			names.add(toolName);
		}
	}

	return Array.from(names);
}

export function getDefaultToolsForContextType(contextType: ChatContextType): ChatToolDefinition[] {
	return extractTools(getDefaultToolNamesForContextType(contextType));
}

export const TOOL_CATEGORIES = {
	ontology: {
		tools: [
			'list_onto_tasks',
			'search_onto_tasks',
			'search_ontology',
			'list_onto_goals',
			'list_onto_plans',
			'list_onto_documents',
			'list_onto_outputs',
			'list_onto_milestones',
			'list_onto_risks',
			'list_onto_decisions',
			'list_onto_requirements',
			'list_onto_projects',
			'search_onto_projects',
			'search_onto_documents',
			'get_onto_project_details',
			'get_onto_task_details',
			'get_onto_goal_details',
			'get_onto_plan_details',
			'get_onto_document_details',
			'get_onto_output_details',
			'get_onto_milestone_details',
			'get_onto_risk_details',
			'get_onto_decision_details',
			'get_onto_requirement_details',
			'list_task_documents',
			'get_entity_relationships',
			'get_linked_entities'
		],
		averageTokens: 350,
		costTier: 'medium'
	},
	ontology_action: {
		tools: [
			'create_onto_project',
			'create_onto_task',
			'create_onto_goal',
			'create_onto_plan',
			'create_onto_document',
			'create_task_document',
			'link_onto_entities',
			'unlink_onto_edge',
			'update_onto_task',
			'update_onto_project',
			'update_onto_goal',
			'update_onto_plan',
			'update_onto_document',
			'update_onto_output',
			'update_onto_milestone',
			'update_onto_risk',
			'update_onto_decision',
			'update_onto_requirement',
			'delete_onto_task',
			'delete_onto_goal',
			'delete_onto_plan',
			'delete_onto_document'
		],
		averageTokens: 400,
		costTier: 'medium'
	},
	utility: {
		tools: ['get_field_info'],
		averageTokens: 80,
		costTier: 'low'
	},
	web_research: {
		tools: ['web_search', 'web_visit'],
		averageTokens: 700,
		costTier: 'medium'
	},
	buildos_docs: {
		tools: ['get_buildos_overview', 'get_buildos_usage_guide'],
		averageTokens: 900,
		costTier: 'medium'
	},
	calendar: {
		tools: [
			'list_calendar_events',
			'get_calendar_event_details',
			'create_calendar_event',
			'update_calendar_event',
			'delete_calendar_event',
			'get_project_calendar',
			'set_project_calendar'
		],
		averageTokens: 350,
		costTier: 'medium'
	}
};

/**
 * Base tool groups shared by multiple contexts.
 * project_audit & project_forecast intentionally mirror project tools for now.
 */
const TOOL_GROUPS: Record<ToolContextScope, string[]> = {
	base: [
		'get_field_info',
		'get_entity_relationships',
		'get_linked_entities',
		'web_search',
		'web_visit',
		'get_buildos_overview',
		'get_buildos_usage_guide'
	],
	global: [
		'list_onto_projects',
		'search_ontology',
		'search_onto_projects',
		'list_onto_tasks',
		'search_onto_tasks',
		'list_onto_goals',
		'list_onto_plans',
		'list_onto_documents',
		'list_onto_outputs',
		'list_onto_milestones',
		'list_onto_risks',
		'list_onto_decisions',
		'list_onto_requirements',
		'search_onto_documents',
		'list_calendar_events',
		'get_calendar_event_details',
		'create_calendar_event',
		'update_calendar_event',
		'delete_calendar_event'
	],
	project_create: ['create_onto_project'],
	project: [
		'list_onto_projects',
		'search_ontology',
		'search_onto_projects',
		'list_onto_tasks',
		'search_onto_tasks',
		'list_onto_plans',
		'list_onto_goals',
		'list_onto_documents',
		'list_onto_outputs',
		'list_onto_milestones',
		'list_onto_risks',
		'list_onto_decisions',
		'list_onto_requirements',
		'get_onto_project_details',
		'get_onto_task_details',
		'get_onto_goal_details',
		'get_onto_plan_details',
		'get_onto_document_details',
		'get_onto_output_details',
		'get_onto_milestone_details',
		'get_onto_risk_details',
		'get_onto_decision_details',
		'get_onto_requirement_details',
		'search_onto_documents',
		'list_task_documents',
		'create_onto_task',
		'create_onto_goal',
		'create_onto_plan',
		'create_onto_document',
		'create_task_document',
		'link_onto_entities',
		'unlink_onto_edge',
		'update_onto_task',
		'update_onto_project',
		'update_onto_goal',
		'update_onto_plan',
		'update_onto_document',
		'update_onto_output',
		'update_onto_milestone',
		'update_onto_risk',
		'update_onto_decision',
		'update_onto_requirement',
		'delete_onto_task',
		'delete_onto_goal',
		'delete_onto_plan',
		'delete_onto_document',
		'list_calendar_events',
		'get_calendar_event_details',
		'create_calendar_event',
		'update_calendar_event',
		'delete_calendar_event',
		'get_project_calendar',
		'set_project_calendar'
	],
	project_audit: [], // TODO: Add diagnostics/audit-specific tools
	project_forecast: [] // TODO: Add forecasting/simulation tools
};

const CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	global: ['base', 'global', 'project_create', 'project'],
	project_create: ['base', 'project_create'],
	project: ['base', 'project'],
	calendar: ['base', 'global'],
	project_audit: ['base', 'project', 'project_audit'],
	project_forecast: ['base', 'project', 'project_forecast'],
	daily_brief_update: ['base'],
	brain_dump: ['base', 'global'],
	ontology: ['base', 'project']
};

const DEFAULT_GROUPS: ToolContextScope[] = ['base', 'global'];

export interface GetToolsOptions {
	includeBase?: boolean;
	includeWriteTools?: boolean;
	additionalTools?: string[];
}

export function getToolsForContextType(
	contextType: PlannerContextType,
	options: GetToolsOptions = {}
): ChatToolDefinition[] {
	const toolNames = resolveToolNames(contextType, options);
	return toolNames
		.map((name) => TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
}

export function getToolsForContext(
	options: GetToolsOptions & { contextType?: PlannerContextType } = {}
): ChatToolDefinition[] {
	const { contextType = 'global', ...rest } = options;
	return getToolsForContextType(contextType, rest);
}

function resolveToolNames(contextType: PlannerContextType, options: GetToolsOptions): string[] {
	const groups = CONTEXT_TO_TOOL_GROUPS[contextType] ?? DEFAULT_GROUPS;
	const includeBase = options.includeBase ?? true;
	const includeWriteTools = options.includeWriteTools ?? true;
	const names = new Set<string>();

	for (const group of groups) {
		if (!includeBase && group === 'base') continue;
		const groupTools = TOOL_GROUPS[group] ?? [];
		for (const toolName of groupTools) {
			if (!includeWriteTools && isWriteToolName(toolName)) continue;
			names.add(toolName);
		}
	}

	options.additionalTools?.forEach((toolName) => names.add(toolName));

	return Array.from(names);
}

export function isWriteToolName(toolName: string): boolean {
	return TOOL_METADATA[toolName]?.category === 'write';
}

export function extractTools(names: string[]): ChatToolDefinition[] {
	return names
		.map((name) => TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
}

export const ONTOLOGY_TOOLS = extractTools([
	'list_onto_projects',
	'search_onto_projects',
	'search_ontology',
	'get_onto_project_details',
	'list_onto_tasks',
	'search_onto_tasks',
	'get_onto_task_details',
	'list_onto_plans',
	'list_onto_goals',
	'list_onto_documents',
	'list_onto_outputs',
	'list_onto_milestones',
	'list_onto_risks',
	'list_onto_decisions',
	'list_onto_requirements',
	'search_onto_documents',
	'list_task_documents',
	'get_onto_goal_details',
	'get_onto_plan_details',
	'get_onto_document_details',
	'get_onto_output_details',
	'get_onto_milestone_details',
	'get_onto_risk_details',
	'get_onto_decision_details',
	'get_onto_requirement_details',
	'get_entity_relationships',
	'create_onto_project',
	'create_onto_task',
	'create_onto_goal',
	'create_onto_plan',
	'create_onto_document',
	'create_task_document',
	'link_onto_entities',
	'unlink_onto_edge',
	'update_onto_task',
	'update_onto_project',
	'update_onto_goal',
	'update_onto_plan',
	'update_onto_document',
	'update_onto_output',
	'update_onto_milestone',
	'update_onto_risk',
	'update_onto_decision',
	'update_onto_requirement',
	'delete_onto_task',
	'delete_onto_goal',
	'delete_onto_plan',
	'delete_onto_document'
]);

export const UTILITY_TOOLS = extractTools([
	'get_field_info',
	'get_buildos_overview',
	'get_buildos_usage_guide'
]);

export const WEB_TOOLS = extractTools(['web_search', 'web_visit']);

export const DEFAULT_TOOLS = getToolsForContextType('global');

export const ALL_TOOLS = [...CHAT_TOOL_DEFINITIONS];

export function getToolCategory(toolName: string): keyof typeof TOOL_CATEGORIES | null {
	for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
		if (config.tools.includes(toolName)) {
			return category as keyof typeof TOOL_CATEGORIES;
		}
	}
	return null;
}

export function estimateToolTokens(toolName: string): number {
	const category = getToolCategory(toolName);
	if (!category) return 200;
	return TOOL_CATEGORIES[category].averageTokens;
}

export function getToolSummaryLines(tools: ChatToolDefinition[]): string[] {
	return tools.map((tool) => formatToolSummary(resolveToolName(tool)));
}

export function formatToolSummaries(tools: ChatToolDefinition[]): string {
	return getToolSummaryLines(tools)
		.map((line) => `- ${line}`)
		.join('\n');
}

/**
 * Canonical tool name extraction - use this everywhere instead of ad-hoc extraction.
 * Handles both `tool.function.name` and legacy `tool.name` formats.
 */
export function resolveToolName(tool: ChatToolDefinition | null | undefined): string {
	if (!tool) return 'unknown';
	const funcName = tool.function?.name;
	if (typeof funcName === 'string' && funcName.trim().length > 0) {
		return funcName.trim();
	}
	const directName = (tool as any)?.name;
	if (typeof directName === 'string' && directName.trim().length > 0) {
		return directName.trim();
	}
	return 'unknown';
}

/**
 * Extract tool names from an array of tool definitions.
 */
export function extractToolNamesFromDefinitions(tools: ChatToolDefinition[]): string[] {
	const names = new Set<string>();
	for (const tool of tools) {
		const name = resolveToolName(tool);
		if (name !== 'unknown') {
			names.add(name);
		}
	}
	return Array.from(names);
}

function formatToolSummary(toolName: string): string {
	const metadata: ToolMetadata | undefined = TOOL_METADATA[toolName];
	if (!metadata) {
		return `${toolName}: ${toolName.replace(/_/g, ' ')}`;
	}

	const capabilities = metadata.capabilities.length
		? ` | Capabilities: ${metadata.capabilities.join('; ')}`
		: '';
	return `${toolName}: ${metadata.summary}${capabilities}`;
}

/**
 * Format a brief tool catalog for LLM prompts - minimizes token usage.
 * Only includes tool name and truncated summary (no capabilities).
 * Use this instead of formatToolSummaries when listing ALL tools.
 */
export function formatBriefToolCatalog(tools: ChatToolDefinition[]): string {
	return tools
		.map((tool) => {
			const name = resolveToolName(tool);
			const metadata: ToolMetadata | undefined = TOOL_METADATA[name];
			const summary = metadata?.summary ?? name.replace(/_/g, ' ');
			// Truncate to ~60 chars to keep tokens low
			const truncated = summary.length > 60 ? summary.slice(0, 57) + '...' : summary;
			return `${name}: ${truncated}`;
		})
		.join('\n');
}

/**
 * Format tool names only (most compact format for token efficiency).
 */
export function formatToolNamesOnly(tools: ChatToolDefinition[]): string {
	return extractToolNamesFromDefinitions(tools).join(', ');
}

export function getToolDefinitionMap(): ReadonlyMap<string, ChatToolDefinition> {
	return TOOL_DEFINITION_MAP;
}
