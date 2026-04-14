// apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	extractToolNamesFromDefinitions,
	extractTools
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { isLibriIntegrationEnabled, isLibriToolName } from '$lib/services/agentic-chat/tools/libri';
import { GATEWAY_TOOL_DEFINITIONS } from './definitions/gateway';

const GATEWAY_DISCOVERY_TOOL_NAMES = ['skill_load', 'tool_search', 'tool_schema'] as const;

const GLOBAL_DIRECT_TOOL_NAMES = [
	'resolve_libri_resource',
	'query_libri_library',
	'get_workspace_overview',
	'get_project_overview',
	'list_onto_projects',
	'search_onto_projects',
	'search_buildos',
	'list_onto_tasks',
	'search_onto_tasks',
	'list_onto_documents',
	'list_calendar_events',
	'create_calendar_event',
	'update_calendar_event'
] as const;

const PROJECT_DIRECT_TOOL_NAMES = [
	'resolve_libri_resource',
	'query_libri_library',
	'get_project_overview',
	'get_onto_project_details',
	'get_onto_project_graph',
	'list_onto_tasks',
	'search_onto_tasks',
	'get_onto_task_details',
	'create_onto_task',
	'update_onto_task',
	'list_onto_documents',
	'get_onto_document_details',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree',
	'get_project_calendar',
	'set_project_calendar'
] as const;

const PROJECT_CREATE_DIRECT_TOOL_NAMES = [
	'create_onto_project',
	'create_onto_goal',
	'create_onto_plan',
	'create_onto_task',
	'create_onto_document'
] as const;

const PROJECT_AUDIT_DIRECT_TOOL_NAMES = [
	...PROJECT_DIRECT_TOOL_NAMES,
	'list_onto_milestones',
	'list_onto_risks',
	'get_onto_milestone_details',
	'get_onto_risk_details'
] as const;

const CALENDAR_DIRECT_TOOL_NAMES = [
	'get_project_overview',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'get_project_calendar',
	'set_project_calendar'
] as const;

const GATEWAY_TOOL_DEFINITION_MAP = new Map(
	GATEWAY_TOOL_DEFINITIONS.map((tool) => [tool.function?.name, tool]).filter(
		(entry): entry is [string, ChatToolDefinition] => Boolean(entry[0] && entry[1])
	)
);

function resolveGatewayToolDefinition(name: string): ChatToolDefinition | undefined {
	if (!isGatewayToolEnabled(name)) return undefined;
	return GATEWAY_TOOL_DEFINITION_MAP.get(name) ?? extractTools([name])[0];
}

function isGatewayToolEnabled(name: string): boolean {
	return !isLibriToolName(name) || isLibriIntegrationEnabled();
}

function resolveGatewayDirectToolNames(contextType: ChatContextType): readonly string[] {
	switch (contextType) {
		case 'project':
		case 'ontology':
			return PROJECT_DIRECT_TOOL_NAMES;
		case 'project_create':
			return PROJECT_CREATE_DIRECT_TOOL_NAMES;
		case 'project_audit':
		case 'project_forecast':
			return PROJECT_AUDIT_DIRECT_TOOL_NAMES;
		case 'calendar':
			return CALENDAR_DIRECT_TOOL_NAMES;
		case 'daily_brief':
		case 'brain_dump':
		case 'global':
		case 'general':
		default:
			return GLOBAL_DIRECT_TOOL_NAMES;
	}
}

function getGatewayDiscoveryTools(): ChatToolDefinition[] {
	return GATEWAY_DISCOVERY_TOOL_NAMES.map((name) => GATEWAY_TOOL_DEFINITION_MAP.get(name)).filter(
		(tool): tool is ChatToolDefinition => Boolean(tool)
	);
}

export function getGatewaySurfaceForContextType(
	contextType: ChatContextType
): ChatToolDefinition[] {
	const names = [
		...extractToolNamesFromDefinitions(getGatewayDiscoveryTools()),
		...resolveGatewayDirectToolNames(contextType)
	].filter(isGatewayToolEnabled);
	return materializeGatewayTools([], names).tools;
}

export function extractGatewayMaterializedToolNames(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return [];
	}

	const record = payload as Record<string, unknown>;
	const type = typeof record.type === 'string' ? record.type : '';
	if (type === 'tool_search_results') {
		const matches = Array.isArray(record.matches) ? record.matches : [];
		return matches
			.map((match) =>
				match && typeof match === 'object'
					? (match as Record<string, unknown>).tool_name
					: undefined
			)
			.filter((name): name is string => typeof name === 'string' && name.trim().length > 0);
	}

	if (type === 'tool_schema' || type === 'op') {
		const toolName = record.tool_name;
		return typeof toolName === 'string' && toolName.trim().length > 0 ? [toolName] : [];
	}

	return [];
}

export function materializeGatewayTools(
	currentTools: ChatToolDefinition[],
	toolNames: string[]
): { tools: ChatToolDefinition[]; addedToolNames: string[] } {
	const currentNames = new Set(extractToolNamesFromDefinitions(currentTools));
	const nextNames = toolNames
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.filter(isGatewayToolEnabled)
		.filter((name) => !currentNames.has(name));
	if (nextNames.length === 0) {
		return { tools: currentTools, addedToolNames: [] };
	}

	const addedTools = nextNames
		.map((name) => resolveGatewayToolDefinition(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
	const addedToolNames = extractToolNamesFromDefinitions(addedTools);
	if (addedToolNames.length === 0) {
		return { tools: currentTools, addedToolNames: [] };
	}

	return {
		tools: [...currentTools, ...addedTools],
		addedToolNames
	};
}
