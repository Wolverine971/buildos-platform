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

// Three stable surfaces (2026-09-04, one-engine stage S6). A turn's tool
// surface is now a function of its chat context alone. The nine profiles this
// replaces were selected partly by regex over the user's message, which is the
// mechanism that leaked turns onto the legacy engine: a lexical hit
// materialized a tool the worker could not execute, admission renegotiated,
// and the turn ran on a different write gate than the one it was budgeted for.
export const GATEWAY_SURFACE_PROFILE_NAMES = ['global', 'project', 'project_create'] as const;

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

/**
 * The global surface: everything a turn can do when no project is in focus.
 *
 * Membership rule (2026-09-04): a tool is mounted when a turn in this context
 * can plausibly need it and the worker can execute it. Nothing here is chosen
 * from the message text. The worker surface is immutable for the turn, so a
 * capability that is not mounted at launch cannot be recovered mid-turn; the
 * cost of carrying a schema is paid in tokens, the cost of omitting one is a
 * dead turn.
 *
 * Deliberately absent: deletes (`delete_onto_*`) and the contacts tools, which
 * have no worker execution adapter yet, and every relationship/graph tool.
 * Those stay discovery-only. The Gmail group is appended per turn by worker
 * admission when the user actually has a connected mailbox (A8) — mounting
 * ~3.3 KB of email schema for users with no mailbox buys nothing.
 */
const GLOBAL_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	// Overview + cross-project search: the entry points for "what is going on".
	'get_workspace_overview',
	'get_project_overview',
	'search_onto_projects',
	'search_all_projects',
	'explore_project',
	// Document scan→read pair. A global "read those docs" turn has no
	// zoom-into-project move any more (change_chat_context was retired), so the
	// pair must already be mounted when a search result names a document.
	'get_document_outline',
	'read_document_section',
	// Task reads and writes. list_onto_tasks takes an OPTIONAL project_id, so it
	// scans every visible project on a global turn; get_onto_task_details and
	// move_onto_task complete the scan→read→act chain across projects.
	'list_onto_tasks',
	'get_onto_task_details',
	'create_onto_task',
	'update_onto_task',
	'move_onto_task',
	// Background handoff and live web research.
	'delegate_task',
	'web_search',
	'web_visit',
	// Calendar reads and writes execute on the worker as of 2026-09-04.
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'delete_calendar_event'
] as const;

/**
 * The project surface: the global surface narrowed to one project and widened
 * with the document workspace and this project's calendar binding. The two
 * cross-project searches drop out because `search_project` is the in-scope
 * equivalent and a focused turn that wanted another project would change
 * context, not widen its search.
 */
const PROJECT_DIRECT_TOOL_NAMES = [
	...GLOBAL_DIRECT_TOOL_NAMES.filter(
		(name) => name !== 'search_onto_projects' && name !== 'search_all_projects'
	),
	'get_onto_project_details',
	'search_project',
	'list_onto_documents',
	'get_document_tree',
	'create_onto_document',
	'update_onto_document',
	'move_document_in_tree',
	'get_project_calendar',
	'set_project_calendar'
] as const;

/**
 * Project creation stays a bounded contract-first hot path. The project adapter
 * creates a shell only (goals: 0, tasks: 0), so the independently reviewed
 * goal and task creates are what complete a fully specified creation request
 * after the shell returns its project id. Relationship, document and unrelated
 * tools remain outside this immutable surface.
 */
const PROJECT_CREATE_DIRECT_TOOL_NAMES = [
	'declare_turn_contract',
	'declare_read_only_turn',
	'request_turn_clarification',
	'cancel_turn_contract',
	'create_onto_project',
	'create_onto_goal',
	'create_onto_task'
] as const;

/**
 * Gmail read group. Not a static surface member: worker admission appends it
 * for users with an active `user_email_connections` row (A8, 2026-09-04).
 */
export const GATEWAY_EMAIL_SURFACE_TOOL_NAMES = [
	'get_external_account_status',
	'list_email_accounts',
	'search_email_messages',
	'get_email_message',
	'request_email_account_connection'
] as const;

const GATEWAY_SURFACE_DIRECT_TOOLS_BY_PROFILE: Record<
	GatewaySurfaceProfileName,
	readonly string[]
> = {
	global: GLOBAL_DIRECT_TOOL_NAMES,
	project: PROJECT_DIRECT_TOOL_NAMES,
	project_create: PROJECT_CREATE_DIRECT_TOOL_NAMES
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

function uniqueToolNames(names: string[]): string[] {
	return Array.from(new Set(names));
}

/**
 * The single guard on the tool name space (2026-09-04, one-engine stage S9).
 * There is exactly one name per capability now: the `work_capability_*` aliases
 * and the alias-folding normalizer that sat in front of every call site are
 * gone, so a name either resolves to a definition here or it is unknown, and
 * `materializeGatewayTools` reports it by name instead of dropping it silently.
 */
function resolveGatewayToolDefinition(name: string): ChatToolDefinition | undefined {
	if (!isGatewayToolEnabled(name)) return undefined;
	return GATEWAY_TOOL_DEFINITION_MAP.get(name) ?? extractTools([name])[0];
}

function isGatewayToolEnabled(_name: string): boolean {
	return true;
}

/**
 * The whole routing decision. Every context that is not focused on one project
 * — global, general, calendar, daily_brief, daily_brief_update — is a
 * cross-project turn and gets the global surface, which already carries the
 * calendar and task capabilities those contexts used to get from their own
 * profile. The model's tool call is the semantic decision; nothing here reads
 * the user's message.
 */
export function resolveGatewaySurfaceProfileForContextType(
	contextType: ChatContextType
): GatewaySurfaceProfileName {
	switch (contextType) {
		case 'project':
		case 'ontology':
			return 'project';
		case 'project_create':
			return 'project_create';
		default:
			return 'global';
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
	if (profileName === 'project_create') {
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
		: [];
	const inferredEntityTools = inferMaterializedToolsFromEntityResults(record);
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
				.map((name) => name.trim())
		);
		return toolNames.length > 0 ? [{ source: 'search', toolNames }] : [];
	}

	if (type === 'tool_schema' || type === 'op') {
		const toolName = record.tool_name;
		return typeof toolName === 'string' && toolName.trim().length > 0
			? [{ source: 'schema', toolNames: [toolName.trim()] }]
			: [];
	}

	return [];
}

export function materializeGatewayTools(
	currentTools: ChatToolDefinition[],
	toolNames: string[],
	options: GatewayToolMaterializationOptions = {}
): {
	tools: ChatToolDefinition[];
	addedToolNames: string[];
	blockedToolNames: string[];
	/** Requested names that exist in no catalog. Named, not silently discarded. */
	unknownToolNames: string[];
} {
	const currentNames = new Set(extractToolNamesFromDefinitions(currentTools));
	const requestedNames = toolNames
		.map((name) => name.trim())
		.filter((name) => name.length > 0)
		.filter(isGatewayToolEnabled)
		.filter((name) => !currentNames.has(name))
		.filter((name, index, names) => names.indexOf(name) === index);
	const blockedToolNames = options.allowToolName
		? requestedNames.filter((name) => !options.allowToolName!(name))
		: [];
	const blockedToolNameSet = new Set(blockedToolNames);
	const nextNames = requestedNames.filter((name) => !blockedToolNameSet.has(name));
	if (nextNames.length === 0) {
		return { tools: currentTools, addedToolNames: [], blockedToolNames, unknownToolNames: [] };
	}

	const addedTools = nextNames
		.map((name) => resolveGatewayToolDefinition(name))
		.filter((tool): tool is ChatToolDefinition => Boolean(tool));
	const addedToolNames = extractToolNamesFromDefinitions(addedTools);
	const addedToolNameSet = new Set(addedToolNames);
	const unknownToolNames = nextNames.filter((name) => !addedToolNameSet.has(name));
	if (addedToolNames.length === 0) {
		return { tools: currentTools, addedToolNames: [], blockedToolNames, unknownToolNames };
	}

	return {
		tools: [...currentTools, ...addedTools],
		addedToolNames,
		blockedToolNames,
		unknownToolNames
	};
}
