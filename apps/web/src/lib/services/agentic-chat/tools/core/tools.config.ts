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

export const TOOL_CATEGORIES = {
	ontology: {
		tools: [
			'list_onto_tasks',
			'search_onto_tasks',
			'list_onto_goals',
			'list_onto_plans',
			'list_onto_documents',
			'list_onto_projects',
			'search_onto_projects',
			'search_onto_documents',
			'list_onto_templates',
			'get_onto_project_details',
			'get_onto_task_details',
			'get_onto_goal_details',
			'get_onto_plan_details',
			'get_onto_document_details',
			'list_task_documents',
			'get_entity_relationships'
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
			'update_onto_task',
			'update_onto_project',
			'update_onto_goal',
			'update_onto_plan',
			'update_onto_document',
			'delete_onto_task',
			'delete_onto_goal',
			'delete_onto_plan',
			'delete_onto_document',
			'request_template_creation'
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
		tools: ['web_search'],
		averageTokens: 700,
		costTier: 'medium'
	},
	buildos_docs: {
		tools: ['get_buildos_overview', 'get_buildos_usage_guide'],
		averageTokens: 900,
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
		'web_search',
		'get_buildos_overview',
		'get_buildos_usage_guide'
	],
	global: [
		'list_onto_projects',
		'search_onto_projects',
		'list_onto_tasks',
		'search_onto_tasks',
		'list_onto_goals',
		'list_onto_plans',
		'list_onto_documents',
		'list_onto_templates',
		'search_onto_documents'
	],
	project_create: ['list_onto_templates', 'request_template_creation', 'create_onto_project'],
	project: [
		'list_onto_projects',
		'search_onto_projects',
		'list_onto_tasks',
		'search_onto_tasks',
		'list_onto_plans',
		'list_onto_goals',
		'list_onto_documents',
		'list_onto_templates',
		'get_onto_project_details',
		'get_onto_task_details',
		'get_onto_goal_details',
		'get_onto_plan_details',
		'get_onto_document_details',
		'search_onto_documents',
		'request_template_creation',
		'list_task_documents',
		'create_onto_task',
		'create_onto_goal',
		'create_onto_plan',
		'create_onto_document',
		'create_task_document',
		'update_onto_task',
		'update_onto_project',
		'update_onto_goal',
		'update_onto_plan',
		'update_onto_document',
		'delete_onto_task',
		'delete_onto_goal',
		'delete_onto_plan',
		'delete_onto_document'
	],
	project_audit: [], // TODO: Add diagnostics/audit-specific tools
	project_forecast: [] // TODO: Add forecasting/simulation tools
};

const CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	global: ['base', 'global'],
	project_create: ['base', 'project_create'],
	project: ['base', 'project'],
	task: ['base', 'project'],
	calendar: ['base', 'global'],
	project_audit: ['base', 'project', 'project_audit'],
	project_forecast: ['base', 'project', 'project_forecast'],
	task_update: ['base', 'project'],
	daily_brief_update: ['base']
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
			if (!includeWriteTools && isWriteTool(toolName)) continue;
			names.add(toolName);
		}
	}

	options.additionalTools?.forEach((toolName) => names.add(toolName));

	return Array.from(names);
}

function isWriteTool(toolName: string): boolean {
	return TOOL_METADATA[toolName]?.category === 'write';
}

export function extractTools(names: string[]): ChatToolDefinition[] {
	return names
		.map((name) => TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
}

export const ONTOLOGY_TOOLS = extractTools([
	'list_onto_templates',
	'list_onto_projects',
	'search_onto_projects',
	'get_onto_project_details',
	'list_onto_tasks',
	'search_onto_tasks',
	'get_onto_task_details',
	'list_onto_plans',
	'list_onto_goals',
	'list_onto_documents',
	'search_onto_documents',
	'list_task_documents',
	'get_onto_goal_details',
	'get_onto_plan_details',
	'get_onto_document_details',
	'get_entity_relationships',
	'create_onto_project',
	'create_onto_task',
	'create_onto_goal',
	'create_onto_plan',
	'create_onto_document',
	'create_task_document',
	'update_onto_task',
	'update_onto_project',
	'update_onto_goal',
	'update_onto_plan',
	'update_onto_document',
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

export const WEB_TOOLS = extractTools(['web_search']);

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
	return tools.map((tool) => formatToolSummary(tool.function.name));
}

export function formatToolSummaries(tools: ChatToolDefinition[]): string {
	return getToolSummaryLines(tools)
		.map((line) => `- ${line}`)
		.join('\n');
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

export function getToolDefinitionMap(): ReadonlyMap<string, ChatToolDefinition> {
	return TOOL_DEFINITION_MAP;
}
