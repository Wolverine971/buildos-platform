// packages/agentic-chat-runtime/src/catalog/taxonomy.ts
/** Host-neutral context defaults and semantic execution categories. */

import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { extractTools } from './indexes';
import { TOOL_METADATA } from './metadata';
import type { ToolContextScope } from './types';

const TOOL_CONTEXT_SCOPES: ToolContextScope[] = ['base', 'global', 'project_create', 'project'];
const TOOL_CONTEXT_SCOPE_SET = new Set<ToolContextScope>(TOOL_CONTEXT_SCOPES);

const TOOL_CONTEXT_ALIASES: Partial<Record<ChatContextType, ToolContextScope[]>> = {
	ontology: ['project'],
	calendar: ['global'],
	daily_brief: ['global'],
	daily_brief_update: ['base']
};

function resolveToolContexts(contextType: ChatContextType): ToolContextScope[] {
	const normalized = contextType === 'general' ? 'global' : contextType;
	const alias = TOOL_CONTEXT_ALIASES[normalized];
	if (alias?.length) return Array.from(new Set(alias));
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
		if (metadata.contexts.some((context) => contexts.has(context))) names.add(toolName);
	}

	return Array.from(names);
}

export function getDefaultToolsForContextType(contextType: ChatContextType): ChatToolDefinition[] {
	return extractTools(getDefaultToolNamesForContextType(contextType));
}

export const TOOL_CATEGORIES = {
	ontology: {
		tools: [
			'search_all_projects',
			'search_project',
			'search_buildos',
			'search_ontology',
			'list_onto_tasks',
			'search_onto_tasks',
			'search_onto_goals',
			'search_onto_plans',
			'search_onto_milestones',
			'search_onto_risks',
			'list_onto_goals',
			'list_onto_plans',
			'list_onto_documents',
			'list_onto_milestones',
			'list_onto_risks',
			'list_onto_projects',
			'search_onto_projects',
			'search_onto_documents',
			'get_onto_project_details',
			'get_onto_project_graph',
			'get_onto_task_details',
			'get_onto_goal_details',
			'get_onto_plan_details',
			'get_onto_document_details',
			'get_onto_milestone_details',
			'get_onto_risk_details',
			'list_task_documents',
			'get_entity_relationships',
			'get_linked_entities',
			'get_document_tree',
			'get_document_path',
			'get_document_outline',
			'read_document_section'
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
			'create_onto_milestone',
			'create_onto_risk',
			'move_document_in_tree',
			'create_task_document',
			'link_onto_entities',
			'unlink_onto_edge',
			'reorganize_onto_project_graph',
			'update_onto_task',
			'move_onto_task',
			'update_onto_project',
			'update_onto_goal',
			'update_onto_plan',
			'update_onto_document',
			'tag_onto_entity',
			'update_onto_milestone',
			'update_onto_risk',
			'delete_onto_task',
			'delete_onto_goal',
			'delete_onto_plan',
			'delete_onto_document',
			'delete_onto_milestone',
			'delete_onto_risk',
			'delete_onto_project'
		],
		averageTokens: 400,
		costTier: 'medium'
	},
	utility: {
		tools: [
			'get_field_info',
			'get_user_profile_overview',
			'get_workspace_overview',
			'get_project_overview',
			'search_user_contacts',
			'upsert_user_contact',
			'list_user_contact_candidates',
			'resolve_user_contact_candidate',
			'link_user_contact',
			'delegate_task',
			'commit_change_set'
		],
		averageTokens: 80,
		costTier: 'low'
	},
	external_knowledge: {
		tools: ['list_corsair_mcp_tools', 'call_corsair_mcp_tool'],
		averageTokens: 250,
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
	},
	email: {
		tools: [
			'get_external_account_status',
			'request_email_account_connection',
			'list_email_accounts',
			'search_email_messages',
			'get_email_message'
		],
		averageTokens: 400,
		costTier: 'low'
	}
};

export function isWriteToolName(toolName: string): boolean {
	return TOOL_METADATA[toolName]?.category === 'write';
}

export function getToolCategory(toolName: string): keyof typeof TOOL_CATEGORIES | null {
	for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
		if (config.tools.includes(toolName)) return category as keyof typeof TOOL_CATEGORIES;
	}
	return null;
}

export function getToolExecutionCategory(
	toolName: string
): keyof typeof TOOL_CATEGORIES | 'read' | 'search' | null {
	const semanticCategory = TOOL_METADATA[toolName]?.category;
	return semanticCategory === 'read' || semanticCategory === 'search'
		? semanticCategory
		: getToolCategory(toolName);
}
