// apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	extractToolNamesFromDefinitions,
	extractTools
} from '$lib/services/agentic-chat/tools/core/tools.config';
import {
	isLibriIntegrationEnabled,
	isLibriToolName,
	resolveDynamicLibriToolDefinition
} from '$lib/services/agentic-chat/tools/libri';
import { GATEWAY_TOOL_DEFINITIONS } from './definitions/gateway';

const GATEWAY_DISCOVERY_TOOL_NAMES = [
	'domain_search',
	'skill_search',
	'skill_load',
	'skill_reference_load',
	'libri_overview',
	'libri_search_capabilities',
	'libri_get_capability_schema',
	'tool_search',
	'tool_schema'
] as const;

// Lean launch discovery set (2026-06-14, Tier 2 item 4). When FASTCHAT_LEAN_DISCOVERY
// is on, only these two discovery entry points mount at turn start. The remaining
// discovery tools (skill_load, skill_reference_load, tool_search, tool_schema) — and
// any direct tool the model reaches for that was not preloaded — are materialized on
// demand by the orchestrator (on-miss + discover-then-load paths). This keeps the
// opening tool menu small without losing any capability.
const GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES = ['skill_search', 'domain_search'] as const;

const FASTCHAT_LEAN_DISCOVERY_ENV = 'FASTCHAT_LEAN_DISCOVERY';

function isLeanDiscoveryEnabled(): boolean {
	if (typeof process === 'undefined' || !process.env) return false;
	const raw = process.env[FASTCHAT_LEAN_DISCOVERY_ENV];
	if (!raw) return false;
	return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export const GATEWAY_SURFACE_PROFILE_NAMES = [
	'global_basic',
	'global_write',
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
	'list_corsair_mcp_tools',
	'call_corsair_mcp_tool',
	'search_onto_projects',
	'search_all_projects'
] as const;

// Cross-project action surface for contexts whose whole point is acting on
// items that live in many projects (daily brief). Task and calendar writes are
// direct so a "bump these tasks, create that meeting" turn never depends on a
// tool_search round the turn supervisor may cut short. Deletes stay behind
// discovery so they keep their confirm-first path.
const GLOBAL_WRITE_DIRECT_TOOL_NAMES = [
	...GLOBAL_BASIC_DIRECT_TOOL_NAMES,
	'get_onto_task_details',
	'create_onto_task',
	'update_onto_task',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event'
] as const;

const PROJECT_BASIC_DIRECT_TOOL_NAMES = [
	'change_chat_context',
	'get_project_overview',
	'get_onto_project_details',
	'list_corsair_mcp_tools',
	'call_corsair_mcp_tool',
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
	global_write: GLOBAL_WRITE_DIRECT_TOOL_NAMES,
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
	return (
		GATEWAY_TOOL_DEFINITION_MAP.get(name) ??
		extractTools([name])[0] ??
		resolveDynamicLibriToolDefinition(name)
	);
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
		// The daily brief is an action surface: "bump these tasks, reschedule
		// that, create a meeting" is the expected workload, and follow-up turns
		// ("ok did you finish?") carry no mutation keywords for intent routing
		// to catch. Keep writes available on every brief turn.
		case 'daily_brief':
			return 'global_write';
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
	const names = isLeanDiscoveryEnabled()
		? GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES
		: GATEWAY_DISCOVERY_TOOL_NAMES;
	return names
		.map((name) => GATEWAY_TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
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
