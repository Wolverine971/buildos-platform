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
	list_onto_outputs: {
		summary: 'List project outputs and deliverables with status.',
		capabilities: ['Filter by project/state', 'Highlights deliverable state'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_milestones: {
		summary: 'List project milestones with due dates and status.',
		capabilities: ['Filter by project/state', 'Highlights upcoming checkpoints'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_risks: {
		summary: 'List project risks with impact and state.',
		capabilities: ['Filter by project/state/impact', 'Highlights risk posture'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_decisions: {
		summary: 'List project decisions with decision dates.',
		capabilities: ['Filter by project', 'Good for decision audits'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'search'
	},
	list_onto_requirements: {
		summary: 'List project requirements with priority.',
		capabilities: ['Filter by project/type', 'Highlights constraints'],
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
		timeoutMs: 45000,
		category: 'search'
	},
	get_onto_project_details: {
		summary: 'Load the complete ontology project graph and metadata.',
		capabilities: ['Returns nested entities', 'Use after identifying a project'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		timeoutMs: 45000,
		category: 'read'
	},
	get_onto_project_graph: {
		summary: 'Load the full project graph payload (all entities + edges).',
		capabilities: ['Returns full graph data', 'Use before reorganizing structure'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		timeoutMs: 45000,
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
	get_onto_output_details: {
		summary: 'Load full output details including description and metadata.',
		capabilities: ['Validates ownership', 'Use before edits'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_milestone_details: {
		summary: 'Load full milestone details including due dates and state.',
		capabilities: ['Validates ownership', 'Use before edits'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_risk_details: {
		summary: 'Load full risk details including impact and mitigation info.',
		capabilities: ['Validates ownership', 'Use before edits'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_decision_details: {
		summary: 'Load full decision details including rationale and decision date.',
		capabilities: ['Validates ownership', 'Use before edits'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_onto_requirement_details: {
		summary: 'Load full requirement details including priority and type.',
		capabilities: ['Validates ownership', 'Use before edits'],
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
		timeoutMs: 45000,
		category: 'read'
	},
	list_task_documents: {
		summary: 'List documents linked to a task via task_has_document edges.',
		capabilities: ['Returns documents plus edge metadata', 'Highlights scratch vs deliverable'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'search'
	},

	// ============================================
	// CALENDAR TOOLS
	// ============================================

	list_calendar_events: {
		summary: 'List calendar events across Google Calendar and ontology events.',
		capabilities: ['Supports time range filters', 'Merges Google + ontology events'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	get_calendar_event_details: {
		summary: 'Fetch detailed info for a specific calendar event.',
		capabilities: ['Supports ontology or Google event ids'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	create_calendar_event: {
		summary: 'Create a calendar event and optionally sync to Google.',
		capabilities: ['Supports project or user scope', 'Optionally links to tasks'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_calendar_event: {
		summary: 'Update a calendar event (ontology or Google).',
		capabilities: ['Updates titles, times, and descriptions', 'Syncs to Google when linked'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	delete_calendar_event: {
		summary: 'Delete a calendar event (ontology or Google).',
		capabilities: ['Deletes ontology events and mirrors to Google if linked'],
		contexts: ['global', 'project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	get_project_calendar: {
		summary: 'Fetch the project calendar mapping and settings.',
		capabilities: ['Returns calendar id, color, and sync state'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'read'
	},
	set_project_calendar: {
		summary: 'Create or update the project calendar configuration.',
		capabilities: ['Creates calendars after connect', 'Updates name/color/sync'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
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
	link_onto_entities: {
		summary: 'Create a relationship edge between two ontology entities.',
		capabilities: [
			'Normalizes edge direction',
			'Validates ownership and project scope',
			'Use for plans/goals/milestones/tasks/docs/risks/decisions'
		],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	unlink_onto_edge: {
		summary: 'Remove a relationship edge by ID.',
		capabilities: ['Deletes a single edge', 'Validates ownership before removal'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	reorganize_onto_project_graph: {
		summary: 'Reorganize a subset of a project graph from a node-centric structure.',
		capabilities: [
			'Reparents containment edges',
			'Rebuilds auto-managed semantics',
			'Supports dry-run previews'
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
	update_onto_output: {
		summary: 'Modify output name, state, or metadata.',
		capabilities: ['Supports partial updates', 'Validates ownership'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_milestone: {
		summary: 'Modify milestone title, due date, state, or metadata.',
		capabilities: ['Supports partial updates', 'Validates ownership'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_risk: {
		summary: 'Modify risk status, impact, probability, or mitigation info.',
		capabilities: ['Supports partial updates', 'Validates ownership'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_decision: {
		summary: 'Modify decision title, date, rationale, or metadata.',
		capabilities: ['Supports partial updates', 'Validates ownership'],
		contexts: ['project', 'project_audit', 'project_forecast'],
		category: 'write'
	},
	update_onto_requirement: {
		summary: 'Modify requirement text, priority, or metadata.',
		capabilities: ['Supports partial updates', 'Validates ownership'],
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
		timeoutMs: 60000,
		category: 'search'
	},
	web_visit: {
		summary: 'Fetch and summarize a specific URL with lightweight extraction.',
		capabilities: [
			'Best for reading known pages',
			'Optional link list for related sources',
			'Pairs with web_search for discovery'
		],
		contexts: [
			'base',
			'global',
			'project_create',
			'project',
			'project_audit',
			'project_forecast'
		],
		timeoutMs: 20000,
		category: 'read'
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
