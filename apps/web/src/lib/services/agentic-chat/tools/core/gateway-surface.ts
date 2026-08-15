// apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	extractToolNamesFromDefinitions,
	extractTools
} from '$lib/services/agentic-chat/tools/core/tools.config';
import {
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION,
	GATEWAY_TOOL_DEFINITIONS,
	TURN_CONTRACT_TOOL_DEFINITION
} from './definitions/gateway';
import { inferMaterializedToolsFromEntityResults } from './entity-result-materialization';

const GATEWAY_DISCOVERY_TOOL_NAMES = [
	'domain_search',
	'skill_search',
	'skill_load',
	'skill_reference_load',
	'tool_search',
	'tool_schema'
] as const;

// Lean launch discovery set (2026-06-14, Tier 2 item 4). Only these two discovery
// entry points mount at turn start by default. The remaining
// discovery tools (skill_load, skill_reference_load, tool_search, tool_schema) — and
// any direct tool the model reaches for that was not preloaded — are materialized on
// demand by the orchestrator (on-miss + discover-then-load paths). This keeps the
// opening tool menu small without losing any capability.
const GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES = ['skill_search', 'domain_search'] as const;

function isLeanDiscoveryEnabled(): boolean {
	return true;
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

// Rare bridge/orchestration tools (Corsair MCP, delegate_task, commit_change_set)
// are intentionally not mounted on every launch surface. They remain available
// through tool_search/tool_schema and the orchestrator's on-miss materialization.
const GLOBAL_BASIC_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'cancel_turn_contract',
	'change_chat_context',
	'get_workspace_overview',
	'get_project_overview',
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
	'declare_turn_contract',
	'cancel_turn_contract',
	'change_chat_context',
	'get_project_overview',
	'get_onto_project_details',
	'search_project',
	'list_onto_tasks',
	'list_onto_documents',
	// Document reading is ungated on every project turn (Project Knowledge Layer L2):
	// the scan→read flow ("does a marketing doc cover this? read that section") must
	// not depend on a document-write turn or a discovery round. These two are the lean
	// path; full-body get_onto_document_details materializes after document results
	// or direct on-miss rather than sitting in every launch surface.
	'get_document_outline',
	'read_document_section'
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
	'create_onto_document',
	'update_onto_document',
	'get_document_tree',
	'move_document_in_tree'
] as const;

const PROJECT_CALENDAR_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'cancel_turn_contract',
	'get_project_overview',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'get_project_calendar',
	'set_project_calendar'
] as const;

// A failed create can carry an implicit contract into the next project-create
// turn, so the otherwise-minimal surface still needs an explicit cancellation
// path when the user abandons that commission.
const PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES = [
	'cancel_turn_contract',
	'create_onto_project'
] as const;

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
	[
		TURN_CONTRACT_TOOL_DEFINITION,
		CANCEL_TURN_CONTRACT_TOOL_DEFINITION,
		...GATEWAY_TOOL_DEFINITIONS
	]
		.map((tool) => [tool.function?.name, tool])
		.filter((entry): entry is [string, ChatToolDefinition] => Boolean(entry[0] && entry[1]))
);

function normalizeGatewayToolName(name: string): string {
	if (name === 'work_capability_search') return 'outcome_card_search';
	if (name === 'work_capability_load') return 'outcome_card_load';
	return name;
}

function uniqueToolNames(names: string[]): string[] {
	return Array.from(new Set(names));
}

function resolveGatewayToolDefinition(name: string): ChatToolDefinition | undefined {
	const normalizedName = normalizeGatewayToolName(name);
	if (!isGatewayToolEnabled(normalizedName)) return undefined;
	return GATEWAY_TOOL_DEFINITION_MAP.get(normalizedName) ?? extractTools([normalizedName])[0];
}

function isGatewayToolEnabled(_name: string): boolean {
	return true;
}

export function resolveGatewaySurfaceProfileForContextType(
	contextType: ChatContextType
): GatewaySurfaceProfileName {
	switch (contextType) {
		case 'calendar':
			return 'project_calendar';
		case 'project':
		case 'ontology':
			// Common project reads and writes are a stable capability surface. The
			// existing model call chooses semantically whether to use them; routing no
			// longer guesses that choice from verb or noun strings.
			return 'project_write_document';
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

type GatewaySurfaceOptions = {
	leanDiscovery?: boolean;
};

function getGatewayDiscoveryTools(options: GatewaySurfaceOptions = {}): ChatToolDefinition[] {
	const leanDiscovery = options.leanDiscovery ?? isLeanDiscoveryEnabled();
	const names = leanDiscovery
		? GATEWAY_LAUNCH_DISCOVERY_TOOL_NAMES
		: GATEWAY_DISCOVERY_TOOL_NAMES;
	return names
		.map((name) => GATEWAY_TOOL_DEFINITION_MAP.get(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
}

export function getGatewaySurfaceForContextType(
	contextType: ChatContextType,
	options: GatewaySurfaceOptions = {}
): ChatToolDefinition[] {
	return getGatewaySurfaceForProfile(
		resolveGatewaySurfaceProfileForContextType(contextType),
		options
	);
}

export function getGatewaySurfaceForProfile(
	profileName: GatewaySurfaceProfileName,
	options: GatewaySurfaceOptions = {}
): ChatToolDefinition[] {
	if (profileName === 'project_create_minimal') {
		return materializeGatewayTools([], [...PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES]).tools;
	}

	const names = [
		...extractToolNamesFromDefinitions(getGatewayDiscoveryTools(options)),
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
				.map(normalizeGatewayToolName)
		: [];
	const inferredEntityTools =
		inferMaterializedToolsFromEntityResults(record).map(normalizeGatewayToolName);
	const combinedMaterializedTools = uniqueToolNames([
		...materializedTools,
		...inferredEntityTools
	]);
	if (combinedMaterializedTools.length > 0) {
		return combinedMaterializedTools;
	}

	const type = typeof record.type === 'string' ? record.type : '';
	if (type === 'tool_search_results') {
		const matches = Array.isArray(record.matches) ? record.matches : [];
		return uniqueToolNames(
			matches
				.map((match) =>
					match && typeof match === 'object'
						? (match as Record<string, unknown>).tool_name
						: undefined
				)
				.filter(
					(name): name is string => typeof name === 'string' && name.trim().length > 0
				)
				.map((name) => normalizeGatewayToolName(name.trim()))
		);
	}

	if (type === 'tool_schema' || type === 'op') {
		const toolName = record.tool_name;
		return typeof toolName === 'string' && toolName.trim().length > 0
			? [normalizeGatewayToolName(toolName.trim())]
			: [];
	}

	return [];
}

export function materializeGatewayTools(
	currentTools: ChatToolDefinition[],
	toolNames: string[]
): { tools: ChatToolDefinition[]; addedToolNames: string[] } {
	const currentNames = new Set(
		extractToolNamesFromDefinitions(currentTools).map(normalizeGatewayToolName)
	);
	const nextNames = toolNames
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.map(normalizeGatewayToolName)
		.filter(isGatewayToolEnabled)
		.filter((name) => !currentNames.has(name))
		.filter((name, index, names) => names.indexOf(name) === index);
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
