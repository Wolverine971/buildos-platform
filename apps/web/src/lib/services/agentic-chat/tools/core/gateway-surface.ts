// apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	extractToolNamesFromDefinitions,
	extractTools
} from '$lib/services/agentic-chat/tools/core/tools.config';
import { isLibriIntegrationEnabled, isLibriToolName } from '$lib/services/agentic-chat/tools/libri';
import { GATEWAY_TOOL_DEFINITIONS } from './definitions/gateway';

const GATEWAY_DISCOVERY_TOOL_NAMES = ['skill_load', 'tool_search', 'tool_schema'] as const;

export const GATEWAY_SURFACE_PROFILE_NAMES = [
	'global_basic',
	'project_basic',
	'project_write',
	'project_document',
	'project_write_document',
	'project_calendar',
	'project_create_minimal'
] as const;

export type GatewaySurfaceProfileName = (typeof GATEWAY_SURFACE_PROFILE_NAMES)[number];

const GLOBAL_BASIC_DIRECT_TOOL_NAMES = [
	'change_chat_context',
	'get_workspace_overview',
	'get_project_overview',
	'search_onto_projects',
	'search_all_projects'
] as const;

const PROJECT_BASIC_DIRECT_TOOL_NAMES = [
	'change_chat_context',
	'get_project_overview',
	'get_onto_project_details',
	'search_project',
	'list_onto_tasks',
	'list_onto_documents'
] as const;

const PROJECT_WRITE_DIRECT_TOOL_NAMES = [
	...PROJECT_BASIC_DIRECT_TOOL_NAMES,
	'create_onto_task',
	'update_onto_task',
	'create_onto_document',
	'update_onto_document'
] as const;

const PROJECT_DOCUMENT_DIRECT_TOOL_NAMES = [
	...PROJECT_BASIC_DIRECT_TOOL_NAMES,
	'get_onto_document_details',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
] as const;

// Union surface for turns that need both task writes and document workspace
// operations (e.g. "Chapter 2 is complete — draft chapter 3 and save progress
// notes"). Combines PROJECT_WRITE and PROJECT_DOCUMENT without duplicates.
const PROJECT_WRITE_DOCUMENT_DIRECT_TOOL_NAMES = [
	...PROJECT_BASIC_DIRECT_TOOL_NAMES,
	'create_onto_task',
	'update_onto_task',
	'get_onto_document_details',
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
] as const;

const PROJECT_CALENDAR_DIRECT_TOOL_NAMES = [
	'get_project_overview',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'get_project_calendar',
	'set_project_calendar'
] as const;

const PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES = ['create_onto_project'] as const;

const GATEWAY_SURFACE_DIRECT_TOOLS_BY_PROFILE: Record<
	GatewaySurfaceProfileName,
	readonly string[]
> = {
	global_basic: GLOBAL_BASIC_DIRECT_TOOL_NAMES,
	project_basic: PROJECT_BASIC_DIRECT_TOOL_NAMES,
	project_write: PROJECT_WRITE_DIRECT_TOOL_NAMES,
	project_document: PROJECT_DOCUMENT_DIRECT_TOOL_NAMES,
	project_write_document: PROJECT_WRITE_DOCUMENT_DIRECT_TOOL_NAMES,
	project_calendar: PROJECT_CALENDAR_DIRECT_TOOL_NAMES,
	project_create_minimal: PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES
};

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

export function resolveGatewaySurfaceProfileForContextType(
	contextType: ChatContextType
): GatewaySurfaceProfileName {
	switch (contextType) {
		case 'calendar':
			return 'project_calendar';
		case 'project':
		case 'ontology':
			return 'project_basic';
		case 'project_create':
			return 'project_create_minimal';
		case 'daily_brief':
		case 'global':
		case 'general':
		default:
			return 'global_basic';
	}
}

function resolveGatewayDirectToolNamesForProfile(
	profileName: GatewaySurfaceProfileName
): readonly string[] {
	return GATEWAY_SURFACE_DIRECT_TOOLS_BY_PROFILE[profileName];
}

export function getGatewayDirectToolNamesForProfile(
	profileName: GatewaySurfaceProfileName
): string[] {
	return [...resolveGatewayDirectToolNamesForProfile(profileName)];
}

export function getGatewayDirectToolNamesForContextType(contextType: ChatContextType): string[] {
	return getGatewayDirectToolNamesForProfile(
		resolveGatewaySurfaceProfileForContextType(contextType)
	);
}

function getGatewayDiscoveryTools(): ChatToolDefinition[] {
	return GATEWAY_DISCOVERY_TOOL_NAMES.map((name) => GATEWAY_TOOL_DEFINITION_MAP.get(name)).filter(
		(tool): tool is ChatToolDefinition => Boolean(tool)
	);
}

export function getGatewaySurfaceForContextType(
	contextType: ChatContextType
): ChatToolDefinition[] {
	return getGatewaySurfaceForProfile(resolveGatewaySurfaceProfileForContextType(contextType));
}

export function getGatewaySurfaceForProfile(
	profileName: GatewaySurfaceProfileName
): ChatToolDefinition[] {
	if (profileName === 'project_create_minimal') {
		return materializeGatewayTools([], [...PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES]).tools;
	}

	const names = [
		...extractToolNamesFromDefinitions(getGatewayDiscoveryTools()),
		...resolveGatewayDirectToolNamesForProfile(profileName)
	].filter(isGatewayToolEnabled);
	return materializeGatewayTools([], names).tools;
}

export function extractGatewayMaterializedToolNames(payload: unknown): string[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return [];
	}

	const record = payload as Record<string, unknown>;
	const materializedTools = Array.isArray(record.materialized_tools)
		? record.materialized_tools
				.map((name) => (typeof name === 'string' ? name.trim() : ''))
				.filter((name): name is string => name.length > 0)
		: [];
	if (materializedTools.length > 0) {
		return materializedTools;
	}

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
