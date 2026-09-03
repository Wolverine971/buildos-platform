// packages/agentic-chat-runtime/src/catalog/surfaces.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import {
	CANCEL_TURN_CONTRACT_TOOL_DEFINITION,
	DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
	GATEWAY_TOOL_DEFINITIONS,
	REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
	TURN_CONTRACT_TOOL_DEFINITION
} from './definitions';
import { inferMaterializedToolsFromEntityResults } from './entity-result-materialization';
import { extractToolNamesFromDefinitions, extractTools } from './indexes';

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
	'project_create_compound',
	'project_create_minimal'
] as const;

export type GatewaySurfaceProfileName = (typeof GATEWAY_SURFACE_PROFILE_NAMES)[number];
export type ProjectCreateExecutionWorkflow = 'web_compound' | 'reviewed_shell';

export type GatewayToolMaterializationSource =
	| 'default'
	| 'skill_bundle'
	| 'search'
	| 'schema'
	| 'contract'
	| 'entity_result'
	| 'discovery'
	| 'direct_request'
	| 'recovery';

export type GatewayToolMaterialization = {
	source: GatewayToolMaterializationSource;
	toolNames: string[];
};

// Rare bridge/orchestration tools (Corsair MCP, delegate_task, commit_change_set)
// are intentionally not mounted on every launch surface. They remain available
// through tool_search/tool_schema and the orchestrator's on-miss materialization.
//
// Document reads are mounted here as well (turn-executor audit 2026-09-02,
// Decision 2): a global "read those docs" turn has no zoom-into-project move any
// more (change_chat_context was retired with zero measured calls), and the worker
// surface is immutable for the turn, so the scan→read pair must already be on
// the surface when a search result names a document.
const GLOBAL_BASIC_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	'get_workspace_overview',
	'get_project_overview',
	'search_onto_projects',
	'search_all_projects',
	'explore_project',
	'get_document_outline',
	'read_document_section'
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
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	'get_project_overview',
	'get_onto_project_details',
	'search_project',
	'explore_project',
	'list_onto_tasks',
	'list_onto_documents',
	// Document reading is ungated on every project turn (Project Knowledge Layer L2):
	// the scan→read flow ("does a marketing doc cover this? read that section") must
	// not depend on a document-write turn or a discovery round. These two are the lean
	// path. Full-body get_onto_document_details is not on any launch surface; on the
	// web path it materializes on demand, on the worker path the surface never grows
	// mid-turn, so no mounted description or tool result may advertise it
	// (surfaces.test.ts pins that).
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
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	'get_project_overview',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'get_project_calendar',
	'set_project_calendar'
] as const;

// Project creation is a bounded contract-first hot path. The project adapter
// creates only the shell, so independently reviewed goal/task calls complete
// fully specified creation requests after the shell returns its project id.
// Relationship and unrelated tools remain outside this immutable surface.
const PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	'create_onto_project',
	'create_onto_goal',
	'create_onto_task'
] as const;

// The web executor persists the complete ProjectSpec atomically, so child and
// semantic-control tools add provider payload without adding capability.
const PROJECT_CREATE_COMPOUND_DIRECT_TOOL_NAMES = ['create_onto_project'] as const;

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
	project_create_compound: PROJECT_CREATE_COMPOUND_DIRECT_TOOL_NAMES,
	project_create_minimal: PROJECT_CREATE_MINIMAL_DIRECT_TOOL_NAMES
};

const GATEWAY_TOOL_DEFINITION_MAP = new Map(
	[
		TURN_CONTRACT_TOOL_DEFINITION,
		DECLARE_READ_ONLY_TURN_TOOL_DEFINITION,
		REQUEST_TURN_CLARIFICATION_TOOL_DEFINITION,
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
			return 'project_create_compound';
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

type GatewaySurfaceOptions = {
	leanDiscovery?: boolean;
};

export type GatewayToolMaterializationOptions = {
	/**
	 * Optional execution-boundary policy. Catalog discovery may suggest a tool,
	 * but the caller still decides whether that capability belongs in the
	 * current turn's authorized surface.
	 */
	allowToolName?: (toolName: string) => boolean;
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
	if (profileName === 'project_create_minimal' || profileName === 'project_create_compound') {
		return materializeGatewayTools(
			[],
			[...resolveGatewayDirectToolNamesForProfile(profileName)]
		).tools;
	}

	const names = [
		...extractToolNamesFromDefinitions(getGatewayDiscoveryTools(options)),
		...resolveGatewayDirectToolNamesForProfile(profileName)
	].filter(isGatewayToolEnabled);
	return materializeGatewayTools([], names).tools;
}

export function extractGatewayMaterializedToolNames(payload: unknown): string[] {
	return uniqueToolNames(
		extractGatewayToolMaterializations(payload).flatMap((entry) => entry.toolNames)
	);
}

export function extractGatewayToolMaterializations(payload: unknown): GatewayToolMaterialization[] {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return [];
	}

	const record = payload as Record<string, unknown>;
	const type = typeof record.type === 'string' ? record.type : '';
	const materializedTools = Array.isArray(record.materialized_tools)
		? record.materialized_tools
				.map((name) => (typeof name === 'string' ? name.trim() : ''))
				.filter((name): name is string => name.length > 0)
				.map(normalizeGatewayToolName)
		: [];
	const inferredEntityTools =
		inferMaterializedToolsFromEntityResults(record).map(normalizeGatewayToolName);
	const materializations: GatewayToolMaterialization[] = [];
	if (materializedTools.length > 0) {
		const source: GatewayToolMaterializationSource =
			type === 'skill'
				? 'skill_bundle'
				: type === 'tool_schema' || type === 'op'
					? 'schema'
					: type.endsWith('_search_results')
						? 'search'
						: 'discovery';
		materializations.push({ source, toolNames: uniqueToolNames(materializedTools) });
	}
	if (inferredEntityTools.length > 0) {
		materializations.push({
			source: 'entity_result',
			toolNames: uniqueToolNames(inferredEntityTools)
		});
	}
	if (materializations.length > 0) {
		return materializations;
	}

	if (type === 'tool_search_results') {
		const matches = Array.isArray(record.matches) ? record.matches : [];
		const toolNames = uniqueToolNames(
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
		return toolNames.length > 0 ? [{ source: 'search', toolNames }] : [];
	}

	if (type === 'tool_schema' || type === 'op') {
		const toolName = record.tool_name;
		return typeof toolName === 'string' && toolName.trim().length > 0
			? [{ source: 'schema', toolNames: [normalizeGatewayToolName(toolName.trim())] }]
			: [];
	}

	return [];
}

export function materializeGatewayTools(
	currentTools: ChatToolDefinition[],
	toolNames: string[],
	options: GatewayToolMaterializationOptions = {}
): { tools: ChatToolDefinition[]; addedToolNames: string[]; blockedToolNames: string[] } {
	const currentNames = new Set(
		extractToolNamesFromDefinitions(currentTools).map(normalizeGatewayToolName)
	);
	const requestedNames = toolNames
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.map(normalizeGatewayToolName)
		.filter(isGatewayToolEnabled)
		.filter((name) => !currentNames.has(name))
		.filter((name, index, names) => names.indexOf(name) === index);
	const blockedToolNames = options.allowToolName
		? requestedNames.filter((name) => !options.allowToolName!(name))
		: [];
	const blockedToolNameSet = new Set(blockedToolNames);
	const nextNames = requestedNames.filter((name) => !blockedToolNameSet.has(name));
	if (nextNames.length === 0) {
		return { tools: currentTools, addedToolNames: [], blockedToolNames };
	}

	const addedTools = nextNames
		.map((name) => resolveGatewayToolDefinition(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
	const addedToolNames = extractToolNamesFromDefinitions(addedTools);
	if (addedToolNames.length === 0) {
		return { tools: currentTools, addedToolNames: [], blockedToolNames };
	}

	return {
		tools: [...currentTools, ...addedTools],
		addedToolNames,
		blockedToolNames
	};
}
