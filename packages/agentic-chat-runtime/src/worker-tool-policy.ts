// packages/agentic-chat-runtime/src/worker-tool-policy.ts
import {
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1,
	DECLARE_READ_ONLY_TURN_TOOL_NAME
} from './catalog/definitions/controls';
import { TOOL_METADATA } from './catalog/metadata';
import { AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1 } from './tools';

/**
 * Mutation names with a reviewed provider projection and execution adapter in
 * the dedicated worker. Keep this literal independent of the worker package:
 * the worker drift test compares it with its executable mutation catalog.
 */
export const AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1 = Object.freeze([
	'create_onto_document',
	'update_onto_document',
	'move_document_in_tree',
	'create_task_document',
	'link_onto_entities',
	'unlink_onto_edge',
	'create_onto_task',
	'update_onto_task',
	'move_onto_task',
	'tag_onto_entity',
	'create_onto_goal',
	'update_onto_goal',
	'create_onto_plan',
	'update_onto_plan',
	'create_onto_milestone',
	'update_onto_milestone',
	'create_onto_risk',
	'update_onto_risk',
	'create_onto_project',
	'update_onto_project',
	'delegate_task'
] as const);

/**
 * Every signed public tool that is deliberately unavailable in the worker.
 * This is intentionally explicit: adding or removing TOOL_METADATA without a
 * capability decision throws during package initialization and in tests.
 */
export const AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1 = Object.freeze([
	'get_entity_relationships',
	'get_linked_entities',
	'list_calendar_events',
	'get_calendar_event_details',
	'create_calendar_event',
	'update_calendar_event',
	'delete_calendar_event',
	'get_project_calendar',
	'set_project_calendar',
	'get_external_account_status',
	'request_email_account_connection',
	'list_email_accounts',
	'search_email_messages',
	'get_email_message',
	'reorganize_onto_project_graph',
	'delete_onto_project',
	'delete_onto_task',
	'delete_onto_document',
	'delete_onto_milestone',
	'delete_onto_risk',
	'delete_onto_goal',
	'delete_onto_plan',
	'get_user_profile_overview',
	'search_user_contacts',
	'upsert_user_contact',
	'list_user_contact_candidates',
	'resolve_user_contact_candidate',
	'link_user_contact',
	'resolve_libri_resource',
	'query_libri_library',
	'list_corsair_mcp_tools',
	'call_corsair_mcp_tool',
	'get_buildos_overview',
	'get_buildos_usage_guide',
	'commit_change_set'
] as const);

/**
 * Tools intentionally removed before the acting worker artifact is signed.
 * Dynamic skill discovery is omitted only after the trusted preload gate has
 * resolved; the retired read-only disposition control is never mounted on the
 * acting provider. Explicit classification prevents either case from becoming
 * a generic unknown-tool escape.
 */
export const AGENTIC_CHAT_WORKER_OMITTED_TOOL_NAMES_V1 = Object.freeze([
	DECLARE_READ_ONLY_TURN_TOOL_NAME,
	'domain_search',
	'skill_search',
	'skill_load'
] as const);

const AGENTIC_CHAT_WORKER_ACTING_CONTROL_TOOL_NAMES_V1 =
	AGENTIC_CHAT_STANDARD_CONTROL_TOOL_NAMES_V1.filter(
		(name) => name !== DECLARE_READ_ONLY_TURN_TOOL_NAME
	);

export const AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1 = Object.freeze([
	...AGENTIC_CHAT_WORKER_ACTING_CONTROL_TOOL_NAMES_V1,
	...AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	'change_chat_context',
	'web_search',
	'web_visit',
	...AGENTIC_CHAT_WORKER_EXECUTABLE_MUTATION_TOOL_NAMES_V1
] as const);

const EXECUTABLE_TOOL_NAMES = new Set<string>(AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1);

export function isAgenticChatWorkerExecutableToolNameV1(value: unknown): value is string {
	return typeof value === 'string' && EXECUTABLE_TOOL_NAMES.has(value);
}

export function findAgenticChatWorkerUnavailableToolNamesV1(
	toolNames: readonly string[]
): string[] {
	return [...new Set(toolNames.filter((name) => !EXECUTABLE_TOOL_NAMES.has(name)))].sort();
}

export function auditAgenticChatWorkerToolPolicyV1(): void {
	const executableMetadataNames = AGENTIC_CHAT_WORKER_EXECUTABLE_TOOL_NAMES_V1.filter((name) =>
		Object.hasOwn(TOOL_METADATA, name)
	);
	const unavailableNames = [...AGENTIC_CHAT_WORKER_UNAVAILABLE_TOOL_NAMES_V1];
	const overlap = executableMetadataNames.filter((name) =>
		unavailableNames.includes(name as never)
	);
	const declared = new Set<string>([...executableMetadataNames, ...unavailableNames]);
	const metadataNames = Object.keys(TOOL_METADATA).sort();
	const missingPolicy = metadataNames.filter((name) => !declared.has(name));
	const stalePolicy = [...declared].filter((name) => !Object.hasOwn(TOOL_METADATA, name)).sort();

	if (overlap.length > 0 || missingPolicy.length > 0 || stalePolicy.length > 0) {
		throw new Error(
			`Agentic Chat worker tool policy drift: overlap=${overlap.join(',') || 'none'}; missing_policy=${missingPolicy.join(',') || 'none'}; stale_policy=${stalePolicy.join(',') || 'none'}`
		);
	}
}

auditAgenticChatWorkerToolPolicyV1();
