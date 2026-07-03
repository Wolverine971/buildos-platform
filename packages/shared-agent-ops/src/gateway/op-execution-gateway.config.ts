// packages/shared-agent-ops/src/gateway/op-execution-gateway.config.ts
//
// Static gateway catalogs, table mappings, and schema fragments shared by the
// execution core, worker adapter, and staging adapter.
import type { BuildosAgentAllowedOp } from '@buildos/shared-types';
import { DOCUMENT_STATES } from '../ontology/onto';
import type { RegistryOp } from './op-execution-gateway.types';

export type ExternalEntityKind =
	| 'project'
	| 'task'
	| 'document'
	| 'goal'
	| 'plan'
	| 'milestone'
	| 'risk';

export type ExternalLinkEntityKind =
	| ExternalEntityKind
	| 'event'
	| 'requirement'
	| 'metric'
	| 'source';

export type CoreEntityConfig = {
	table: string;
	idArg: string;
	resultKey: string;
	displayField: 'name' | 'title';
	select: string;
};

export const ONTO_PROJECT_SELECT =
	'id, name, description, type_key, state_key, props, start_at, end_at, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_TASK_SELECT =
	'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at, deleted_at';
export const ONTO_DOCUMENT_SELECT =
	'id, project_id, title, description, type_key, state_key, content, props, children, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_GOAL_SELECT =
	'id, project_id, name, goal, description, type_key, state_key, target_date, completed_at, props, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_PLAN_SELECT =
	'id, project_id, name, description, plan, type_key, state_key, props, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_MILESTONE_SELECT =
	'id, project_id, title, milestone, description, type_key, state_key, due_at, completed_at, props, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_RISK_SELECT =
	'id, project_id, title, impact, probability, state_key, content, type_key, props, mitigated_at, created_by, created_at, updated_at, archived_at, deleted_at';
export const ONTO_EDGE_SELECT =
	'id, project_id, src_kind, src_id, dst_kind, dst_id, rel, props, created_at';
export const ONTO_EVENT_SELECT =
	'id, project_id, owner_entity_type, owner_entity_id, title, description, type_key, state_key, start_at, end_at, all_day, timezone, location, external_link, props, recurrence, sync_status, sync_error, last_synced_at, created_by, created_at, updated_at, deleted_at';
export const ONTO_REQUIREMENT_SELECT =
	'id, project_id, text, type_key, priority, props, created_by, created_at, updated_at, deleted_at';
export const ONTO_METRIC_SELECT =
	'id, project_id, name, definition, unit, type_key, props, created_by, created_at';
export const ONTO_SOURCE_SELECT =
	'id, project_id, uri, snapshot_uri, captured_at, props, created_by, created_at';
export const AGENT_CALL_TOOL_EXECUTION_SELECT =
	'id, agent_call_session_id, external_agent_caller_id, user_id, op, idempotency_key, status, args, response_payload, error_payload, entity_kind, entity_id, started_at, completed_at, created_at, updated_at';
export const AGENT_RUN_CHANGE_SET_SELECT =
	'id, user_id, project_id, context_type, status, allowed_ops, change_set, result, commit_started_at';

export const EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS = 2000;
export const EXTERNAL_ASSET_SUMMARY_MAX_CHARS = 700;
export const EXTERNAL_ASSET_SELECT =
	'id, project_id, kind, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, alt_text, caption, ocr_status, extraction_summary, extracted_text, created_at, updated_at, deleted_at';
export const EXTERNAL_ASSET_OCR_STATUSES = new Set([
	'pending',
	'processing',
	'complete',
	'failed',
	'skipped'
]);

export const EXTERNAL_CUSTOM_OPS: Partial<Record<BuildosAgentAllowedOp, RegistryOp>> = {
	'onto.project.status.get': {
		op: 'onto.project.status.get',
		tool_name: 'get_onto_project_status',
		description:
			'Get a compact project status packet for external agents: the START HERE orientation excerpt (purpose, non-goals, decisions, current state — read it first), short project description, task/document/plan/goal/collaborator counts, active collaborators, most recent changes, overdue and due-soon tasks, and upcoming project events.',
		parameters_schema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				project_id: {
					type: 'string',
					description:
						'Project UUID. If omitted and exactly one project is visible in scope, that project is used.'
				},
				query: {
					type: 'string',
					description:
						'Optional project name query when project_id is not known. Returns an ambiguity error with candidates if multiple projects match.'
				},
				recent_limit: {
					type: 'number',
					minimum: 1,
					maximum: 20,
					description: 'Maximum recent changes to return. Defaults to 8.'
				},
				task_limit: {
					type: 'number',
					minimum: 1,
					maximum: 20,
					description:
						'Maximum overdue tasks and due-soon tasks to return per section. Defaults to 8.'
				},
				event_limit: {
					type: 'number',
					minimum: 1,
					maximum: 20,
					description: 'Maximum upcoming events to return. Defaults to 8.'
				},
				collaborator_limit: {
					type: 'number',
					minimum: 1,
					maximum: 50,
					description: 'Maximum active collaborators to return. Defaults to 20.'
				},
				due_soon_days: {
					type: 'number',
					minimum: 1,
					maximum: 60,
					description: 'How far ahead to look for due-soon tasks. Defaults to 7 days.'
				},
				upcoming_days: {
					type: 'number',
					minimum: 1,
					maximum: 90,
					description: 'How far ahead to look for upcoming events. Defaults to 14 days.'
				}
			}
		},
		group: 'onto',
		kind: 'read',
		entity: 'project',
		action: 'status.get'
	},
	'onto.asset.search': {
		op: 'onto.asset.search',
		tool_name: 'search_onto_assets',
		description:
			'Search existing project image assets by filename, OCR text, extraction summary, caption, and alt text. This is read-only and never uploads media, returns storage paths, or creates signed URLs.',
		parameters_schema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				query: {
					type: 'string',
					description:
						'Optional search query for filename, caption, alt text, OCR summary, or OCR text. Omit to list recent image assets.'
				},
				project_id: {
					type: 'string',
					description: 'Optional project UUID. Must be inside the granted call scope.'
				},
				ocr_status: {
					type: 'string',
					enum: ['pending', 'processing', 'complete', 'failed', 'skipped'],
					description: 'Optional OCR status filter.'
				},
				include_text_preview: {
					type: 'boolean',
					description:
						'When true, include a bounded OCR text preview. Defaults to false for search results.'
				},
				limit: {
					type: 'number',
					minimum: 1,
					maximum: 50,
					description: 'Maximum number of assets to return. Defaults to 12.'
				},
				offset: {
					type: 'number',
					minimum: 0,
					description: 'Pagination offset. Defaults to 0.'
				}
			}
		},
		group: 'onto',
		kind: 'read',
		entity: 'asset',
		action: 'search'
	},
	'onto.asset.get': {
		op: 'onto.asset.get',
		tool_name: 'get_onto_asset',
		description:
			'Get read-only metadata and bounded OCR context for an existing project image asset. This never returns storage paths or signed media URLs.',
		parameters_schema: {
			type: 'object',
			additionalProperties: false,
			required: ['asset_id'],
			properties: {
				asset_id: {
					type: 'string',
					description: 'Image asset UUID.'
				},
				include_text_preview: {
					type: 'boolean',
					description:
						'When true, include a bounded OCR text preview. Defaults to true for get.'
				}
			}
		},
		group: 'onto',
		kind: 'read',
		entity: 'asset',
		action: 'get'
	}
};

export const CORE_ENTITY_CONFIG: Record<ExternalEntityKind, CoreEntityConfig> = {
	project: {
		table: 'onto_projects',
		idArg: 'project_id',
		resultKey: 'project',
		displayField: 'name',
		select: ONTO_PROJECT_SELECT
	},
	task: {
		table: 'onto_tasks',
		idArg: 'task_id',
		resultKey: 'task',
		displayField: 'title',
		select: ONTO_TASK_SELECT
	},
	document: {
		table: 'onto_documents',
		idArg: 'document_id',
		resultKey: 'document',
		displayField: 'title',
		select: ONTO_DOCUMENT_SELECT
	},
	goal: {
		table: 'onto_goals',
		idArg: 'goal_id',
		resultKey: 'goal',
		displayField: 'name',
		select: ONTO_GOAL_SELECT
	},
	plan: {
		table: 'onto_plans',
		idArg: 'plan_id',
		resultKey: 'plan',
		displayField: 'name',
		select: ONTO_PLAN_SELECT
	},
	milestone: {
		table: 'onto_milestones',
		idArg: 'milestone_id',
		resultKey: 'milestone',
		displayField: 'title',
		select: ONTO_MILESTONE_SELECT
	},
	risk: {
		table: 'onto_risks',
		idArg: 'risk_id',
		resultKey: 'risk',
		displayField: 'title',
		select: ONTO_RISK_SELECT
	}
};

export const LINK_ENTITY_TABLES: Record<ExternalLinkEntityKind, string> = {
	project: 'onto_projects',
	task: 'onto_tasks',
	document: 'onto_documents',
	goal: 'onto_goals',
	plan: 'onto_plans',
	milestone: 'onto_milestones',
	risk: 'onto_risks',
	event: 'onto_events',
	requirement: 'onto_requirements',
	metric: 'onto_metrics',
	source: 'onto_sources'
};

export const LINK_ENTITY_SELECTS: Record<ExternalLinkEntityKind, string> = {
	project: ONTO_PROJECT_SELECT,
	task: ONTO_TASK_SELECT,
	document: ONTO_DOCUMENT_SELECT,
	goal: ONTO_GOAL_SELECT,
	plan: ONTO_PLAN_SELECT,
	milestone: ONTO_MILESTONE_SELECT,
	risk: ONTO_RISK_SELECT,
	event: ONTO_EVENT_SELECT,
	requirement: ONTO_REQUIREMENT_SELECT,
	metric: ONTO_METRIC_SELECT,
	source: ONTO_SOURCE_SELECT
};

export const ARCHIVABLE_ENTITY_KINDS = new Set<ExternalLinkEntityKind>([
	'project',
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk'
]);

export const EXTERNAL_WRITE_OP_SCHEMAS: Partial<
	Record<BuildosAgentAllowedOp, Record<string, unknown>>
> = {
	'onto.task.create': {
		type: 'object',
		additionalProperties: false,
		properties: {
			project_id: {
				type: 'string',
				description: 'Project UUID for the new task.'
			},
			title: {
				type: 'string',
				description: 'Task title.'
			},
			description: {
				type: 'string',
				description: 'Optional task description.'
			},
			type_key: {
				type: 'string',
				description: 'Optional task type key. Defaults to task.default.'
			},
			state_key: {
				type: 'string',
				description: 'Initial task state: todo, in_progress, blocked, or done.'
			},
			priority: {
				type: 'number',
				description: 'Optional priority from 1-5.'
			},
			start_at: {
				type: ['string', 'null'],
				description: 'Optional ISO start date.'
			},
			due_at: {
				type: ['string', 'null'],
				description: 'Optional ISO due date.'
			},
			props: {
				type: 'object',
				description: 'Optional JSON props merged onto the task.'
			}
		},
		required: ['project_id', 'title']
	},
	'onto.document.create': {
		type: 'object',
		additionalProperties: false,
		properties: {
			project_id: {
				type: 'string',
				description: 'Project UUID the document belongs to.'
			},
			title: {
				type: 'string',
				description: 'Document title.'
			},
			content: {
				type: 'string',
				description: 'Markdown body, stored as-is (up to 200 KB).'
			},
			description: {
				type: ['string', 'null'],
				description: 'Optional short description.'
			},
			type_key: {
				type: 'string',
				description:
					'Optional document type key (e.g. document.knowledge.research, document.context.project). Falls back to document.default when not recognized.'
			},
			state_key: {
				type: 'string',
				description: `Optional document state. Valid: ${DOCUMENT_STATES.join(', ')}. Defaults to draft.`
			},
			parent_document_id: {
				type: ['string', 'null'],
				description: 'Optional parent document UUID for tree placement.'
			},
			position: {
				type: 'integer',
				description: 'Optional position among siblings (0-indexed). Omit to place at end.'
			},
			props: {
				type: 'object',
				description: 'Optional JSON props merged onto the document.'
			}
		},
		required: ['project_id', 'title']
	},
	'onto.document.update': {
		type: 'object',
		additionalProperties: false,
		properties: {
			document_id: {
				type: 'string',
				description: 'Document UUID.'
			},
			title: {
				type: 'string',
				description: 'Optional replacement title.'
			},
			content: {
				type: 'string',
				description: 'Optional replacement or appended markdown body.'
			},
			description: {
				type: ['string', 'null'],
				description: 'Optional replacement description. Use null to clear.'
			},
			type_key: {
				type: 'string',
				description: 'Optional replacement document type key.'
			},
			state_key: {
				type: 'string',
				description: `Optional state update. Valid: ${DOCUMENT_STATES.join(', ')}.`
			},
			archived: {
				type: 'boolean',
				description:
					'Archive or restore the document. true sets archived_at; false clears archived_at.'
			},
			update_strategy: {
				type: 'string',
				enum: ['replace', 'append', 'merge_llm'],
				description:
					'How to apply content: replace (default), append, or merge_llm. External merge_llm falls back to append if no merge worker is available.'
			},
			merge_instructions: {
				type: 'string',
				description:
					'Optional guidance for merge_llm. Ignored for replace and append strategies.'
			},
			props: {
				type: 'object',
				description: 'Optional JSON props merged onto the document.'
			}
		},
		required: ['document_id']
	},
	'onto.task.update': {
		type: 'object',
		additionalProperties: false,
		properties: {
			task_id: {
				type: 'string',
				description: 'Task UUID.'
			},
			title: {
				type: 'string',
				description: 'Optional replacement title.'
			},
			description: {
				type: ['string', 'null'],
				description: 'Optional replacement description. Use null to clear.'
			},
			type_key: {
				type: 'string',
				description: 'Optional replacement type key.'
			},
			state_key: {
				type: 'string',
				description: 'Optional state update: todo, in_progress, blocked, or done.'
			},
			archived: {
				type: 'boolean',
				description:
					'Archive or restore the task. true sets archived_at; false clears archived_at.'
			},
			priority: {
				type: ['number', 'null'],
				description: 'Optional priority from 1-5. Use null to clear.'
			},
			start_at: {
				type: ['string', 'null'],
				description: 'Optional ISO start date. Use null to clear.'
			},
			due_at: {
				type: ['string', 'null'],
				description: 'Optional ISO due date. Use null to clear.'
			},
			props: {
				type: 'object',
				description: 'Optional JSON props merged onto the task.'
			}
		},
		required: ['task_id']
	}
};

const EXTERNAL_ARCHIVABLE_UPDATE_OPS = new Set<BuildosAgentAllowedOp>([
	'onto.project.update',
	'onto.goal.update',
	'onto.plan.update',
	'onto.milestone.update',
	'onto.risk.update'
]);

const EXTERNAL_ARCHIVABLE_READ_OPS = new Set<BuildosAgentAllowedOp>([
	'onto.task.list',
	'onto.task.search',
	'onto.task.get',
	'onto.document.list',
	'onto.document.search',
	'onto.document.get',
	'onto.goal.list',
	'onto.goal.search',
	'onto.goal.get',
	'onto.plan.list',
	'onto.plan.search',
	'onto.plan.get',
	'onto.milestone.list',
	'onto.milestone.search',
	'onto.milestone.get',
	'onto.risk.list',
	'onto.risk.search',
	'onto.risk.get',
	'onto.search'
]);

export function withExternalArchiveUpdateParameter(
	op: BuildosAgentAllowedOp,
	schema: Record<string, unknown>
): Record<string, unknown> {
	if (!EXTERNAL_ARCHIVABLE_UPDATE_OPS.has(op) && !EXTERNAL_ARCHIVABLE_READ_OPS.has(op)) {
		return schema;
	}
	const properties =
		schema.properties &&
		typeof schema.properties === 'object' &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, unknown>)
			: {};
	return {
		...schema,
		properties: {
			...properties,
			archived: {
				type: 'boolean',
				description: EXTERNAL_ARCHIVABLE_UPDATE_OPS.has(op)
					? 'Archive or restore the entity. true sets archived_at; false clears archived_at.'
					: 'When true, return archived records only. Omitted or false returns active records only.'
			}
		}
	};
}
