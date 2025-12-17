// apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts
/**
 * Tool Metadata
 *
 * Metadata describing tool capabilities, contexts, and categories.
 * Used for progressive disclosure and tool summaries.
 */

import type { ToolMetadata } from './types';

export const TOOL_METADATA: Record<string, ToolMetadata> = {
	// ============================================
	// ONTOLOGY READ TOOLS
	// ============================================

	list_onto_tasks: {
		summary: 'Browse recent ontology tasks with status and owning project context.',
		capabilities: [
			'Filter by project or state',
			'Returns abbreviated summaries for fast scans'
		],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_tasks: {
		summary: 'Keyword search for tasks when the exact project is unknown.',
		capabilities: ['Matches task titles', 'Optional project/state filters'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_goals: {
		summary: 'List project goals with brief descriptions.',
		capabilities: ['Filter by project', 'Highlights strategic objectives'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_plans: {
		summary: 'Show plans that organize related tasks.',
		capabilities: ['Filter by project', 'Provides plan state/type context'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_documents: {
		summary: 'List project documents (briefs, specs, context, research).',
		capabilities: ['Filter by project/type/state', 'Returns concise summaries'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_projects: {
		summary: 'List ontology projects grouped by recent activity.',
		capabilities: ['Filter by type or state', 'Highlights facet metadata'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_projects: {
		summary: 'Keyword search across project names/descriptions.',
		capabilities: ['Focus on discovery', 'Supports state/type filters'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_onto_documents: {
		summary: 'Keyword search for documents by title.',
		capabilities: ['Supports project/type/state filters', 'Fast doc discovery'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	search_ontology: {
		summary: 'Fuzzy search across all ontology entities with snippets.',
		capabilities: [
			'Scans tasks/plans/goals/milestones/documents/outputs/requirements',
			'Accepts project scope and type filters'
		],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	get_onto_project_details: {
		summary: 'Load the complete ontology project graph and metadata.',
		capabilities: ['Returns nested entities', 'Use after identifying a project'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_task_details: {
		summary: 'Load full task details including props and relationships.',
		capabilities: ['Validates ownership', 'Great for deep task updates'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_goal_details: {
		summary: 'Load full goal details including props.',
		capabilities: ['Validates ownership', 'Great before editing KPIs'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_plan_details: {
		summary: 'Load full plan details including props.',
		capabilities: ['Validates ownership', 'Great before editing timelines'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_document_details: {
		summary: 'Load full document details including body markdown/props.',
		capabilities: ['Validates ownership', 'Use before edits or linking'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_entity_relationships: {
		summary: 'Graph traversal helper for edges between ontology entities.',
		capabilities: ['Supports direction filters', 'Useful before multi-entity analysis'],
		contexts: ['base', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_linked_entities: {
		summary: 'Get detailed linked entities with names, states, and descriptions.',
		capabilities: [
			'Returns full entity details',
			'Supports filtering by entity type',
			'Use when abbreviated context needs expansion'
		],
		contexts: ['base', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	list_task_documents: {
		summary: 'List documents linked to a task via task_has_document edges.',
		capabilities: ['Returns documents plus edge metadata', 'Highlights scratch vs deliverable'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'search'
	},

	// ============================================
	// ONTOLOGY WRITE TOOLS
	// ============================================

	create_onto_project: {
		summary:
			'End-to-end project creation with classified type_key, inferred props, and nested entities.',
		capabilities: ['Supports goals/plans/tasks scaffolding', 'Captures clarifications'],
		contexts: ['project_create', 'project'],
		category: 'write'
	},
	create_onto_task: {
		summary: 'Add a new task within a project/plan.',
		capabilities: ['Sets priority/state/plan links', 'Accepts metadata props'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_goal: {
		summary: 'Record a new goal aligned to the current project.',
		capabilities: ['Supports type classification', 'Stores KPI metadata'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_plan: {
		summary: 'Add execution plans that group related tasks.',
		capabilities: ['Assigns type/state', 'Accepts props for richer context'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_onto_document: {
		summary: 'Create a document linked to a project (brief/spec/context).',
		capabilities: ['Validates ownership', 'Stores body markdown/props'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	create_task_document: {
		summary: 'Create or attach a document to a specific task workspace.',
		capabilities: [
			'Creates task_has_document edge',
			'Can attach existing docs',
			'Keeps project has_document for discovery'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_task: {
		summary: 'Modify task status, assignment, or metadata.',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_project: {
		summary: 'Update project headline details and facets.',
		capabilities: ['Change states/facets', 'Accepts partial updates'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_goal: {
		summary: 'Modify goal details (priority, target date, KPIs).',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_plan: {
		summary: 'Modify plan details (state, dates, metadata).',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge description updates safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_document: {
		summary: 'Modify document title/type/state/body/metadata.',
		capabilities: [
			'Supports partial updates',
			'Validates ownership',
			'Append or LLM-merge body content safely'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_task: {
		summary: 'Remove a task and associated edges.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_document: {
		summary: 'Remove a document and associated edges.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_goal: {
		summary: 'Remove a goal from the project graph.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_onto_plan: {
		summary: 'Delete a plan container while leaving tasks untouched.',
		capabilities: ['Validates ownership', 'Irreversible delete'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},

	// ============================================
	// UTILITY TOOLS
	// ============================================

	get_field_info: {
		summary: 'Schema helper that explains entity fields, enums, and valid values.',
		capabilities: ['Provides enum values & examples', 'Great for structured updates'],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	},
	web_search: {
		summary: 'Live web research via Tavily with synthesized answer and cited sources.',
		capabilities: [
			'Searches current web content',
			'Optional domain allow/deny lists',
			'Returns ranked sources plus Tavily short answer'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'search'
	},
	get_buildos_overview: {
		summary:
			'High-level BuildOS overview covering mission, architecture, and documentation map.',
		capabilities: [
			'Explains platform pillars',
			'Lists doc entry points',
			'Clarifies architecture responsibilities'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	},
	get_buildos_usage_guide: {
		summary: 'Step-by-step BuildOS usage playbook for onboarding, planning, and automation.',
		capabilities: [
			'Describes workflows (brain dumps → ontology → scheduling)',
			'Highlights prop inference + calendar actions',
			'Suggests follow-up tool calls'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		category: 'utility'
	}
};
