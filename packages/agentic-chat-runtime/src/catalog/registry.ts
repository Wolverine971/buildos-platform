// packages/agentic-chat-runtime/src/catalog/registry.ts
/**
 * Tool Registry Builder
 *
 * Generates a stable op-to-tool mapping and metadata index used by discovery and direct tools.
 */

import type { ChatToolDefinition, RegistryOp } from '@buildos/shared-types';
import { CHAT_TOOL_DEFINITIONS } from './definitions';
import { TOOL_METADATA } from './metadata';
import type { ToolMetadata } from './types';

export type { RegistryOp } from '@buildos/shared-types';

export type ToolRegistry = {
	version: string;
	ops: Record<string, RegistryOp>;
	byToolName: Record<string, RegistryOp>;
};

/**
 * One tool name space: the single table binding every catalog tool name to its
 * gateway op and its execution kind.
 *
 * This replaces four scattered maps (`OP_EXCEPTIONS`, `UTIL_OPS`,
 * `CALENDAR_OPS`, `EMAIL_OPS`), a name-prefix regex, an entity-alias map, and a
 * write-prefix list that between them decided op names in five different
 * places. A derived name space silently invents an op for any new tool whose
 * name happens to match the prefix rule (which is how `get_document_outline`
 * acquired `onto.document_outline.get`) and silently drops one that does not
 * (`read_document_section` and `tag_onto_entity` fell through to `x.misc.*`).
 * Op names here are the EXTERNAL contract for MCP and agent-call, so they are
 * frozen: `registry.test.ts` asserts this table against the mapping that was in
 * production on 2026-09-04, entry for entry.
 *
 * Adding a tool means adding a row. There is no fallback: a catalog tool with
 * no row fails registry construction by name.
 */
export type ToolOperationKind = 'read' | 'write' | 'control' | 'discovery';

export type ToolOperation = {
	op: string;
	kind: ToolOperationKind;
};

/**
 * Direct tools only. Discovery meta-tools (`skill_search`, `tool_schema`, ...)
 * and the turn controls (`declare_turn_contract`, ...) are deliberately absent:
 * they carry no gateway op, and inventing one for them would widen the external
 * op contract. `kind` carries their vocabulary so they can join the table the
 * day they get ops without a type change.
 */
export const TOOL_OPERATIONS: Readonly<Record<string, ToolOperation>> = Object.freeze({
	// --- Ontology reads ---
	list_onto_tasks: { op: 'onto.task.list', kind: 'read' },
	list_onto_goals: { op: 'onto.goal.list', kind: 'read' },
	list_onto_documents: { op: 'onto.document.list', kind: 'read' },
	list_onto_milestones: { op: 'onto.milestone.list', kind: 'read' },
	list_onto_risks: { op: 'onto.risk.list', kind: 'read' },
	list_onto_plans: { op: 'onto.plan.list', kind: 'read' },
	list_onto_projects: { op: 'onto.project.list', kind: 'read' },
	list_task_documents: { op: 'onto.task.docs.list', kind: 'read' },
	search_all_projects: { op: 'x.search.all_projects', kind: 'read' },
	search_project: { op: 'x.search.project', kind: 'read' },
	explore_project: { op: 'x.search.explore', kind: 'read' },
	search_onto_tasks: { op: 'onto.task.search', kind: 'read' },
	search_onto_projects: { op: 'onto.project.search', kind: 'read' },
	search_onto_documents: { op: 'onto.document.search', kind: 'read' },
	search_onto_goals: { op: 'onto.goal.search', kind: 'read' },
	search_onto_plans: { op: 'onto.plan.search', kind: 'read' },
	search_onto_milestones: { op: 'onto.milestone.search', kind: 'read' },
	search_onto_risks: { op: 'onto.risk.search', kind: 'read' },
	search_ontology: { op: 'onto.search', kind: 'read' },
	get_onto_project_details: { op: 'onto.project.get', kind: 'read' },
	get_onto_project_graph: { op: 'onto.project.graph.get', kind: 'read' },
	get_onto_task_details: { op: 'onto.task.get', kind: 'read' },
	get_onto_goal_details: { op: 'onto.goal.get', kind: 'read' },
	get_onto_plan_details: { op: 'onto.plan.get', kind: 'read' },
	get_onto_document_details: { op: 'onto.document.get', kind: 'read' },
	get_onto_milestone_details: { op: 'onto.milestone.get', kind: 'read' },
	get_onto_risk_details: { op: 'onto.risk.get', kind: 'read' },
	get_document_tree: { op: 'onto.document.tree.get', kind: 'read' },
	get_document_path: { op: 'onto.document.path.get', kind: 'read' },
	get_document_outline: { op: 'onto.document_outline.get', kind: 'read' },
	read_document_section: { op: 'x.misc.read_document_section', kind: 'read' },
	get_entity_relationships: { op: 'onto.entity.relationships.get', kind: 'read' },
	get_linked_entities: { op: 'onto.entity.links.get', kind: 'read' },
	// --- Ontology writes ---
	create_onto_task: { op: 'onto.task.create', kind: 'write' },
	create_onto_goal: { op: 'onto.goal.create', kind: 'write' },
	create_onto_plan: { op: 'onto.plan.create', kind: 'write' },
	create_onto_document: { op: 'onto.document.create', kind: 'write' },
	create_onto_milestone: { op: 'onto.milestone.create', kind: 'write' },
	create_onto_risk: { op: 'onto.risk.create', kind: 'write' },
	move_document_in_tree: { op: 'onto.document.tree.move', kind: 'write' },
	create_task_document: { op: 'onto.task.docs.create_or_attach', kind: 'write' },
	link_onto_entities: { op: 'onto.edge.link', kind: 'write' },
	unlink_onto_edge: { op: 'onto.edge.unlink', kind: 'write' },
	reorganize_onto_project_graph: { op: 'onto.project.graph.reorganize', kind: 'write' },
	create_onto_project: { op: 'onto.project.create', kind: 'write' },
	update_onto_task: { op: 'onto.task.update', kind: 'write' },
	move_onto_task: { op: 'onto.task.move', kind: 'write' },
	update_onto_project: { op: 'onto.project.update', kind: 'write' },
	update_onto_goal: { op: 'onto.goal.update', kind: 'write' },
	update_onto_plan: { op: 'onto.plan.update', kind: 'write' },
	update_onto_document: { op: 'onto.document.update', kind: 'write' },
	tag_onto_entity: { op: 'x.misc.tag_onto_entity', kind: 'write' },
	update_onto_milestone: { op: 'onto.milestone.update', kind: 'write' },
	update_onto_risk: { op: 'onto.risk.update', kind: 'write' },
	delete_onto_project: { op: 'onto.project.delete', kind: 'write' },
	delete_onto_task: { op: 'onto.task.delete', kind: 'write' },
	delete_onto_document: { op: 'onto.document.delete', kind: 'write' },
	delete_onto_milestone: { op: 'onto.milestone.delete', kind: 'write' },
	delete_onto_risk: { op: 'onto.risk.delete', kind: 'write' },
	delete_onto_goal: { op: 'onto.goal.delete', kind: 'write' },
	delete_onto_plan: { op: 'onto.plan.delete', kind: 'write' },
	// --- Utility ---
	get_field_info: { op: 'util.schema.field_info', kind: 'read' },
	get_user_profile_overview: { op: 'util.profile.overview', kind: 'read' },
	get_workspace_overview: { op: 'util.workspace.overview', kind: 'read' },
	get_project_overview: { op: 'util.project.overview', kind: 'read' },
	search_user_contacts: { op: 'util.contact.search', kind: 'read' },
	upsert_user_contact: { op: 'util.contact.upsert', kind: 'write' },
	list_user_contact_candidates: { op: 'util.contact.candidates.list', kind: 'read' },
	resolve_user_contact_candidate: { op: 'util.contact.candidate.resolve', kind: 'write' },
	link_user_contact: { op: 'util.contact.link', kind: 'write' },
	list_corsair_mcp_tools: { op: 'util.corsair_mcp.tools.list', kind: 'read' },
	call_corsair_mcp_tool: { op: 'util.corsair_mcp.tool.call', kind: 'write' },
	web_search: { op: 'util.web.search', kind: 'read' },
	web_visit: { op: 'util.web.visit', kind: 'read' },
	get_buildos_overview: { op: 'util.buildos.overview', kind: 'read' },
	get_buildos_usage_guide: { op: 'util.buildos.usage_guide', kind: 'read' },
	delegate_task: { op: 'util.agent.delegate', kind: 'write' },
	commit_change_set: { op: 'util.agent.commit_changes', kind: 'write' },
	// --- Calendar ---
	list_calendar_events: { op: 'cal.event.list', kind: 'read' },
	get_calendar_event_details: { op: 'cal.event.get', kind: 'read' },
	create_calendar_event: { op: 'cal.event.create', kind: 'write' },
	update_calendar_event: { op: 'cal.event.update', kind: 'write' },
	delete_calendar_event: { op: 'cal.event.delete', kind: 'write' },
	get_project_calendar: { op: 'cal.project.get', kind: 'read' },
	set_project_calendar: { op: 'cal.project.set', kind: 'write' },
	// --- Email ---
	get_external_account_status: { op: 'email.accounts.status', kind: 'read' },
	request_email_account_connection: { op: 'email.accounts.connect', kind: 'write' },
	list_email_accounts: { op: 'email.accounts.list', kind: 'read' },
	search_email_messages: { op: 'email.messages.search', kind: 'read' },
	get_email_message: { op: 'email.messages.get', kind: 'read' }
});

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

/**
 * Version the discovery-visibility policy independently from the stable registry
 * schema version. Keeping these hashes separate preserves retained registry
 * observability while making hidden/visible policy changes detectable.
 */
export function getToolDiscoveryPolicyVersion(
	tools: ChatToolDefinition[] = CHAT_TOOL_DEFINITIONS,
	metadata: Record<string, ToolMetadata> = TOOL_METADATA
): string {
	const input = JSON.stringify(
		tools.map((tool) => {
			const name = tool.function?.name ?? '';
			return { name, chat_discoverable: metadata[name]?.chatDiscovery !== 'hidden' };
		})
	);
	return `tool-discovery-policy/${fnv1a(input)}`;
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

		const operation = TOOL_OPERATIONS[toolName];
		if (!operation) {
			throw new Error(
				`Unknown tool name "${toolName}": every catalog tool needs one TOOL_OPERATIONS row naming its gateway op and kind.`
			);
		}
		const op = operation.op;
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
			kind: assertRegistryKind(toolName, operation.kind),
			entity,
			action,
			contexts: toolMeta?.contexts,
			chat_discoverable: toolMeta?.chatDiscovery !== 'hidden'
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

function resolveGroup(op: string): RegistryOp['group'] {
	if (op.startsWith('email.')) return 'email';
	if (op.startsWith('x.search.') || op === 'onto.search') return 'search';
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
	if (group === 'email') {
		if (parts[1] === 'accounts') return 'account';
		if (parts[1] === 'messages') return 'message';
	}
	return undefined;
}

/**
 * The single guard between the four-kind table vocabulary and the two-kind
 * `RegistryOp`. A control or discovery row would need an op the external
 * contract does not define, so it is rejected by name rather than coerced.
 */
function assertRegistryKind(toolName: string, kind: ToolOperationKind): RegistryOp['kind'] {
	if (kind === 'read' || kind === 'write') return kind;
	throw new Error(
		`Tool "${toolName}" is registered as ${kind}, which carries no gateway op and cannot enter the op registry.`
	);
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

	const metaPayload = Object.entries(metadata)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, meta]) => ({ key, meta: metadataForRegistryVersion(meta) }));

	const taxonomyPayload = Object.keys(opMap)
		.sort((a, b) => a.localeCompare(b))
		.map((op) => {
			const group = resolveGroup(op);
			return { op, group, entity: resolveEntity(op, group) };
		});

	const input = JSON.stringify({
		tools: toolPayload,
		metadata: metaPayload,
		opMap,
		taxonomy: taxonomyPayload
	});
	return `tool-registry/${fnv1a(input)}`;
}

function metadataForRegistryVersion(meta: ToolMetadata): Omit<ToolMetadata, 'chatDiscovery'> {
	const versioned: Omit<ToolMetadata, 'chatDiscovery'> = {
		summary: meta.summary,
		capabilities: meta.capabilities,
		contexts: meta.contexts,
		category: meta.category
	};

	if (meta.timeoutMs !== undefined) {
		versioned.timeoutMs = meta.timeoutMs;
	}

	return versioned;
}

function fnv1a(input: string): string {
	let hash = 2166136261;
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16);
}
