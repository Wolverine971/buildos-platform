// packages/shared-agent-ops/src/gateway/op-execution-gateway.ts
//
// Op-execution core for the BuildOS agent-call gateway. This module was carved
// out of apps/web's external-tool-gateway.ts so a Node worker (no SvelteKit /
// $lib / $env) can execute BuildOS write+read ops. Web-only concerns (discovery
// tools, the concrete CalendarExecutor / TaskEventSyncService, and the tool
// registry) are dependency-inverted via ports and explicit params.
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallScope,
	BuildosAgentAllowedOp,
	BuildosAgentScopeMode,
	ProposedChange,
	ProposedChangeAction
} from '@buildos/shared-types';
import { buildSearchFilter } from '../utils/search-filter';
import {
	logCreateAsync,
	logUpdateAsync,
	type ActivityLogActorContext
} from '../ops/async-activity-logger';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '../ontology/ontology-projects.service';
import { normalizeGatewayOpName } from '../ops/gateway-op-aliases';
import {
	defaultAllowedOpsForMode,
	isReadOp,
	isSupportedOp,
	isWriteOp,
	requiredScopeModeForOp
} from '../policy';
import {
	AgentCallWritePendingError,
	AgentCallWriteReplayError,
	recordToolExecutionFailure,
	recordToolExecutionSuccess,
	recordWriteExecutionFailure,
	recordWriteExecutionSuccess,
	reserveWriteExecution
} from './write-audit.service';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '../ops/entity-mention-notification.service';
import { normalizeTaskStateInput } from '../ontology/task-state';
import { normalizeDocumentStateInput } from '../ontology/document-state';
import { normalizeMarkdownInput } from '../utils/markdown-normalization';
import { createOrMergeDocumentVersion, toDocumentSnapshot } from '../ontology/versioning.service';
import {
	addDocumentToTree,
	getDocTree,
	getNodePath,
	moveDocument
} from '../ontology/doc-structure.service';
import {
	DOCUMENT_STATES,
	GOAL_STATES,
	MILESTONE_STATES,
	PLAN_STATES,
	PROJECT_STATES,
	TASK_STATES,
	RISK_STATES,
	isValidTypeKey
} from '../ontology/onto';
import { logSecurityEvent, type SecurityEventLogOptions } from '../ops/security-event-logger';
import {
	getDocumentUpdateContentCandidate,
	isAppendOrMergeUpdateStrategy
} from '../ops/update-value-validation';
import { loadProjectGraphData } from '../ontology/project-graph-loader';
import {
	instantiateProject,
	OntologyInstantiationError,
	validateProjectSpec
} from '../ontology/instantiation.service';
import { normalizeEdgeDirection, VALID_RELS, type EntityKind } from '../ontology/edge-direction';
import { resolveEdgeRelationship } from '../ontology/edge-relationship-resolver';

/**
 * Structural mirror of the web tool registry's RegistryOp. The package must not
 * depend on `$lib/services/agentic-chat/tools/registry/tool-registry`, so this
 * carries exactly the fields op-execution + registry building read.
 */
export type RegistryOp = {
	op: string;
	tool_name: string;
	description: string;
	parameters_schema: Record<string, any>;
	group: 'onto' | 'util' | 'cal' | 'x';
	kind: 'read' | 'write';
	entity?: string;
	action?: string;
	contexts?: unknown[];
	chat_discoverable?: boolean;
};

/**
 * Port for calendar operations. The concrete implementation (CalendarExecutor)
 * lives in apps/web; the worker can supply its own. Methods mirror the executor
 * methods the calendar op handlers invoke.
 */
export interface CalendarPort {
	listCalendarEvents(args: any): Promise<unknown>;
	getCalendarEventDetails(args: any): Promise<unknown>;
	createCalendarEvent(args: any): Promise<unknown>;
	updateCalendarEvent(args: any): Promise<unknown>;
	deleteCalendarEvent(args: any): Promise<unknown>;
	getProjectCalendar(args: any): Promise<unknown>;
	setProjectCalendar(args: any): Promise<unknown>;
}

/**
 * Port for task<->calendar event side-effect syncing. The concrete
 * implementation (TaskEventSyncService) lives in apps/web. When absent, task
 * side-effect syncing is skipped (other side-effects still run).
 */
export interface TaskSyncPort {
	syncTaskEvents(
		userId: string,
		actorId: string,
		task: any,
		options?: {
			activityLog?: {
				changeSource?: string;
				actorContext?: ActivityLogActorContext | undefined;
			};
		}
	): Promise<unknown>;
}

const MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024;
const TASK_DOCUMENT_REL = 'task_has_document';

export type ToolExecutionContext = {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
};

type VisibleProjectContext = {
	projects: OntologyProjectSummary[];
	projectMap: Map<string, OntologyProjectSummary>;
};

type ExternalEntityKind = 'project' | 'task' | 'document' | 'goal' | 'plan' | 'milestone' | 'risk';

type ExternalLinkEntityKind = ExternalEntityKind | 'event' | 'requirement' | 'metric' | 'source';

type EntityAccessResult = {
	kind: ExternalLinkEntityKind;
	entity: Record<string, unknown>;
	project: OntologyProjectSummary;
	projectId: string;
};

export type ExternalGatewayRegistryEntry = RegistryOp & {
	required_scope_mode: BuildosAgentScopeMode;
	handler: (
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>;
};

export type ExternalGatewayRegistry = {
	version: string;
	ops: Record<string, ExternalGatewayRegistryEntry>;
};

const EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS = 2000;
const EXTERNAL_ASSET_SUMMARY_MAX_CHARS = 700;
const EXTERNAL_ASSET_SELECT =
	'id, project_id, kind, original_filename, content_type, file_size_bytes, width, height, checksum_sha256, alt_text, caption, ocr_status, extraction_summary, extracted_text, created_at, updated_at, deleted_at';
const EXTERNAL_ASSET_OCR_STATUSES = new Set([
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
			'Get a compact project status packet for external agents: short project description, task/document/plan/goal/collaborator counts, active collaborators, most recent changes, overdue and due-soon tasks, and upcoming project events.',
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

const CORE_ENTITY_CONFIG: Record<
	ExternalEntityKind,
	{
		table: string;
		idArg: string;
		resultKey: string;
		displayField: 'name' | 'title';
		select: string;
	}
> = {
	project: {
		table: 'onto_projects',
		idArg: 'project_id',
		resultKey: 'project',
		displayField: 'name',
		select: 'id, name, description, type_key, state_key, props, start_at, end_at, created_by, created_at, updated_at, archived_at, deleted_at'
	},
	task: {
		table: 'onto_tasks',
		idArg: 'task_id',
		resultKey: 'task',
		displayField: 'title',
		select: 'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	document: {
		table: 'onto_documents',
		idArg: 'document_id',
		resultKey: 'document',
		displayField: 'title',
		select: 'id, project_id, title, description, type_key, state_key, content, props, children, created_at, updated_at, archived_at, deleted_at'
	},
	goal: {
		table: 'onto_goals',
		idArg: 'goal_id',
		resultKey: 'goal',
		displayField: 'name',
		select: 'id, project_id, name, goal, description, type_key, state_key, target_date, completed_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	plan: {
		table: 'onto_plans',
		idArg: 'plan_id',
		resultKey: 'plan',
		displayField: 'name',
		select: 'id, project_id, name, description, plan, type_key, state_key, props, created_at, updated_at, archived_at, deleted_at'
	},
	milestone: {
		table: 'onto_milestones',
		idArg: 'milestone_id',
		resultKey: 'milestone',
		displayField: 'title',
		select: 'id, project_id, title, milestone, description, type_key, state_key, due_at, props, created_at, updated_at, archived_at, deleted_at'
	},
	risk: {
		table: 'onto_risks',
		idArg: 'risk_id',
		resultKey: 'risk',
		displayField: 'title',
		select: 'id, project_id, title, impact, probability, state_key, content, type_key, props, mitigated_at, created_at, updated_at, archived_at, deleted_at'
	}
};

const LINK_ENTITY_TABLES: Record<ExternalLinkEntityKind, string> = {
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

const ARCHIVABLE_ENTITY_KINDS = new Set<ExternalLinkEntityKind>([
	'project',
	'task',
	'document',
	'goal',
	'plan',
	'milestone',
	'risk'
]);

export class ExternalToolGatewayError extends Error {
	constructor(
		public readonly code:
			| 'NOT_FOUND'
			| 'VALIDATION_ERROR'
			| 'FORBIDDEN'
			| 'CONFLICT'
			| 'INTERNAL',
		message: string,
		public readonly details?: Record<string, unknown>
	) {
		super(message);
		this.name = 'ExternalToolGatewayError';
	}
}

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
				description:
					'Markdown body, stored as-is (up to 200 KB). Use content or body_markdown.'
			},
			body_markdown: {
				type: 'string',
				description:
					'Legacy alias for content. Accepted for compatibility with internal document tools.'
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
			parent_id: {
				type: ['string', 'null'],
				description:
					'Legacy alias for parent_document_id. Accepted for compatibility with create_onto_document tool naming.'
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
				description:
					'Optional replacement or appended markdown body. Use content or body_markdown.'
			},
			body_markdown: {
				type: 'string',
				description:
					'Legacy alias for content. Accepted for compatibility with internal document tools.'
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

const EXTERNAL_OP_HANDLERS: Record<
	BuildosAgentAllowedOp,
	(
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>
> = {
	'onto.project.list': listProjects,
	'onto.project.search': searchProjects,
	'onto.project.get': getProject,
	'onto.project.status.get': getProjectStatus,
	'onto.project.graph.get': getProjectGraph,
	'onto.task.list': listTasks,
	'onto.task.search': searchTasks,
	'onto.task.get': getTask,
	'onto.task.create': createTask,
	'onto.task.update': updateTask,
	'onto.task.docs.list': listTaskDocuments,
	'onto.task.docs.create_or_attach': createTaskDocument,
	'onto.document.list': listDocuments,
	'onto.document.search': searchDocuments,
	'onto.document.get': getDocument,
	'onto.document.create': createDocument,
	'onto.document.update': updateDocument,
	'onto.document.tree.get': getDocumentTree,
	'onto.document.tree.move': moveDocumentInTree,
	'onto.document.path.get': getDocumentPath,
	'onto.goal.list': listGoals,
	'onto.goal.search': searchGoals,
	'onto.goal.get': getGoal,
	'onto.plan.list': listPlans,
	'onto.plan.search': searchPlans,
	'onto.plan.get': getPlan,
	'onto.milestone.list': listMilestones,
	'onto.milestone.search': searchMilestones,
	'onto.milestone.get': getMilestone,
	'onto.risk.list': listRisks,
	'onto.risk.search': searchRisks,
	'onto.risk.get': getRisk,
	'onto.asset.search': searchAssets,
	'onto.asset.get': getAsset,
	'onto.entity.relationships.get': getEntityRelationships,
	'onto.entity.links.get': getLinkedEntities,
	'onto.search': searchOntology,
	'cal.event.list': listCalendarEvents,
	'cal.event.get': getCalendarEventDetails,
	'cal.event.create': createCalendarEvent,
	'cal.event.update': updateCalendarEvent,
	'cal.event.delete': deleteCalendarEvent,
	'cal.project.get': getProjectCalendar,
	'cal.project.set': setProjectCalendar,
	'onto.project.create': createProject,
	'onto.project.update': updateProject,
	'onto.goal.create': createGoal,
	'onto.goal.update': updateGoal,
	'onto.plan.create': createPlan,
	'onto.plan.update': updatePlan,
	'onto.milestone.create': createMilestone,
	'onto.milestone.update': updateMilestone,
	'onto.risk.create': createRisk,
	'onto.risk.update': updateRisk,
	'onto.edge.link': linkOntoEntities,
	'onto.edge.unlink': unlinkOntoEdge
};

export function clampLimit(value: unknown, fallback: number, min = 1, max = 50): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeOffset(value: unknown, fallback = 0): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(5000, Math.max(0, Math.floor(value)));
}

function buildPaginationForRows(
	offset: number,
	limit: number,
	totalAvailable: number,
	returned: number
) {
	const nextOffset = offset + limit < totalAvailable ? offset + limit : null;
	return {
		offset,
		limit,
		returned,
		total_available: totalAvailable,
		has_more: nextOffset !== null,
		next_offset: nextOffset
	};
}

function normalizeDocumentChildren(value: unknown): Array<Record<string, unknown>> {
	if (Array.isArray(value)) {
		return value.filter(
			(child): child is Record<string, unknown> =>
				Boolean(child) && typeof child === 'object' && !Array.isArray(child)
		);
	}

	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const children = (value as Record<string, unknown>).children;
		return normalizeDocumentChildren(children);
	}

	return [];
}

function stripInternalEntityFields(row: Record<string, unknown>): Record<string, unknown> {
	const { search_vector: _searchVector, ...rest } = row;
	return rest;
}

function serializeExternalEntity(
	kind: ExternalLinkEntityKind,
	row: Record<string, unknown>,
	projectName?: string | null
): Record<string, unknown> {
	const serialized = stripInternalEntityFields(row);
	if (kind === 'document' && Object.prototype.hasOwnProperty.call(serialized, 'children')) {
		serialized.children = normalizeDocumentChildren(serialized.children);
	}
	if (projectName !== undefined) {
		serialized.project_name = projectName;
	}
	return serialized;
}

function serializeDocumentMap(
	documents: Record<string, unknown>
): Record<string, Record<string, unknown>> {
	return Object.fromEntries(
		Object.entries(documents).map(([id, document]) => [
			id,
			document && typeof document === 'object' && !Array.isArray(document)
				? serializeExternalEntity('document', document as Record<string, unknown>)
				: document
		])
	) as Record<string, Record<string, unknown>>;
}

function serializeDocumentTree(tree: Record<string, unknown>): Record<string, unknown> {
	const documents =
		tree.documents && typeof tree.documents === 'object' && !Array.isArray(tree.documents)
			? serializeDocumentMap(tree.documents as Record<string, unknown>)
			: {};
	const serializeDocumentArray = (value: unknown) =>
		Array.isArray(value)
			? value
					.filter(
						(document): document is Record<string, unknown> =>
							Boolean(document) &&
							typeof document === 'object' &&
							!Array.isArray(document)
					)
					.map((document) => serializeExternalEntity('document', document))
			: [];

	return {
		...tree,
		documents,
		unlinked: serializeDocumentArray(tree.unlinked),
		archived: serializeDocumentArray(tree.archived)
	};
}

function serializeProjectGraphData(graph: Record<string, unknown>): Record<string, unknown> {
	const arrayKinds: Record<string, ExternalLinkEntityKind> = {
		plans: 'plan',
		tasks: 'task',
		goals: 'goal',
		milestones: 'milestone',
		documents: 'document',
		risks: 'risk',
		requirements: 'requirement',
		metrics: 'metric',
		sources: 'source'
	};
	const serialized: Record<string, unknown> = { ...graph };
	if (graph.project && typeof graph.project === 'object' && !Array.isArray(graph.project)) {
		serialized.project = serializeExternalEntity(
			'project',
			graph.project as Record<string, unknown>
		);
	}

	for (const [key, kind] of Object.entries(arrayKinds)) {
		const value = graph[key];
		if (!Array.isArray(value)) continue;
		serialized[key] = value
			.filter(
				(row): row is Record<string, unknown> =>
					Boolean(row) && typeof row === 'object' && !Array.isArray(row)
			)
			.map((row) => serializeExternalEntity(kind, row));
	}

	return serialized;
}

function normalizeMaxChars(value: unknown, fallback = 20000): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(50000, Math.max(500, Math.floor(value)));
}

export function summarizeDescription(description: string): string {
	const trimmed = description.trim();
	if (!trimmed) return '';
	const sentenceEnd = trimmed.indexOf('.');
	return sentenceEnd === -1 ? trimmed : trimmed.slice(0, sentenceEnd + 1);
}

function truncateText(content: string | null | undefined, maxChars: number) {
	const safeContent = content ?? '';
	if (safeContent.length <= maxChars) {
		return { content: safeContent, truncated: false };
	}

	return {
		content: safeContent.slice(0, maxChars),
		truncated: true
	};
}

function normalizeAssetText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return null;
	if (normalized.length <= maxChars) return normalized;
	return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeOptionalAssetOcrStatus(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'ocr_status must be a string');
	}
	const normalized = value.trim().toLowerCase();
	if (!EXTERNAL_ASSET_OCR_STATUSES.has(normalized)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'ocr_status must be one of: pending, processing, complete, failed, skipped'
		);
	}
	return normalized;
}

function readNullableString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNullableNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim()) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

function checksumSuffix(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(normalized)) return null;
	return normalized.slice(-12);
}

function serializeExternalAsset(
	row: Record<string, unknown>,
	projectMap: Map<string, OntologyProjectSummary>,
	options: { includeTextPreview?: boolean } = {}
): Record<string, unknown> {
	const projectId = typeof row.project_id === 'string' ? row.project_id : '';
	const extractedText = typeof row.extracted_text === 'string' ? row.extracted_text : '';
	return {
		id: readNullableString(row.id),
		project_id: projectId || null,
		project_name: projectMap.get(projectId)?.name ?? null,
		kind: readNullableString(row.kind) ?? 'image',
		file_name: readNullableString(row.original_filename),
		content_type: readNullableString(row.content_type),
		file_size_bytes: readNullableNumber(row.file_size_bytes),
		width: readNullableNumber(row.width),
		height: readNullableNumber(row.height),
		checksum_sha256_suffix: checksumSuffix(row.checksum_sha256),
		ocr_status: readNullableString(row.ocr_status),
		caption: normalizeAssetText(row.caption, EXTERNAL_ASSET_SUMMARY_MAX_CHARS),
		alt_text: normalizeAssetText(row.alt_text, EXTERNAL_ASSET_SUMMARY_MAX_CHARS),
		extraction_summary: normalizeAssetText(
			row.extraction_summary,
			EXTERNAL_ASSET_SUMMARY_MAX_CHARS
		),
		has_extracted_text: extractedText.trim().length > 0,
		...(options.includeTextPreview
			? {
					extracted_text_preview: normalizeAssetText(
						extractedText,
						EXTERNAL_ASSET_TEXT_PREVIEW_MAX_CHARS
					)
				}
			: {}),
		created_at: readNullableString(row.created_at),
		updated_at: readNullableString(row.updated_at),
		media_access:
			'metadata_and_bounded_ocr_only; storage paths and signed media URLs are intentionally not exposed through external agent tools'
	};
}

function buildAllowedProjectSet(
	scope: AgentCallScope,
	projects: OntologyProjectSummary[]
): Map<string, OntologyProjectSummary> {
	const requestedIds = Array.isArray(scope.project_ids) ? new Set(scope.project_ids) : null;
	const filtered = requestedIds
		? projects.filter((project) => requestedIds.has(project.id))
		: projects;
	return new Map(filtered.map((project) => [project.id, project]));
}

function assertAccessibleProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: unknown
): OntologyProjectSummary {
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'project_id must be a valid UUID');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Project is outside the allowed call scope'
		);
	}

	return project;
}

function assertVisibleEntityProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: unknown
): OntologyProjectSummary {
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('INTERNAL', 'Entity project_id is invalid');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new ExternalToolGatewayError('FORBIDDEN', 'Entity is outside the allowed call scope');
	}

	return project;
}

async function resolveArchivedProjectAccessContext(
	context: ToolExecutionContext,
	entity: Record<string, unknown>
): Promise<OntologyProjectSummary | null> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const createdBy = typeof entity.created_by === 'string' ? entity.created_by : null;
	let accessRole: OntologyProjectSummary['access_role'] = createdBy === actorId ? 'owner' : null;
	let accessLevel: OntologyProjectSummary['access_level'] =
		createdBy === actorId ? 'admin' : null;

	if (!accessLevel) {
		const { data: member, error } = await context.admin
			.from('onto_project_members')
			.select('role_key, access')
			.eq('project_id', String(entity.id))
			.eq('actor_id', actorId)
			.is('removed_at', null)
			.maybeSingle();
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to load project membership'
			);
		}
		if (!member) return null;
		accessRole =
			member.role_key === 'owner' ||
			member.role_key === 'editor' ||
			member.role_key === 'viewer'
				? member.role_key
				: null;
		accessLevel =
			member.access === 'read' || member.access === 'write' || member.access === 'admin'
				? member.access
				: null;
	}

	return {
		id: String(entity.id),
		name: typeof entity.name === 'string' ? entity.name : 'Archived project',
		description: typeof entity.description === 'string' ? entity.description : null,
		icon_svg: null,
		icon_concept: null,
		icon_generated_at: null,
		icon_generation_source: null,
		icon_generation_prompt: null,
		type_key: typeof entity.type_key === 'string' ? entity.type_key : 'project.default',
		state_key: entity.state_key as OntologyProjectSummary['state_key'],
		props:
			entity.props && typeof entity.props === 'object' && !Array.isArray(entity.props)
				? (entity.props as OntologyProjectSummary['props'])
				: {},
		facet_context: null,
		facet_scale: null,
		facet_stage: null,
		created_at: typeof entity.created_at === 'string' ? entity.created_at : '',
		updated_at: typeof entity.updated_at === 'string' ? entity.updated_at : '',
		task_count: 0,
		goal_count: 0,
		plan_count: 0,
		document_count: 0,
		owner_actor_id: createdBy ?? actorId,
		access_role: accessRole,
		access_level: accessLevel,
		is_shared: createdBy !== actorId,
		next_step_short: null,
		next_step_long: null,
		next_step_source: null,
		next_step_updated_at: null
	};
}

export function buildRegistryVersion(registryVersion: string, opNames: string[]): string {
	return `${registryVersion}/external/${opNames.join(',')}`;
}

export function buildExternalToolDescription(entry: RegistryOp): string {
	const scopeNotice =
		'Only projects in the caller-approved BuildOS scope are visible; public project visibility does not grant connector access.';

	if (entry.op === 'onto.project.create') {
		return `${entry.description} Project creation requires read_write access with onto.project.create whitelisted. A project-scoped key may create projects; each project it creates is automatically added to the key's scope. ${scopeNotice}`;
	}

	if (entry.group !== 'cal') {
		return `${entry.description} ${scopeNotice}`;
	}

	return `${entry.description} External callers must scope calendar access to an allowed project_id or task_id; broad user calendar access is not exposed through the BuildOS call gateway. ${scopeNotice}`;
}

async function loadVisibleProjects(context: ToolExecutionContext): Promise<VisibleProjectContext> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const projects = await fetchProjectSummaries(context.admin, actorId);
	const projectMap = buildAllowedProjectSet(context.scope, projects);
	const scopedProjectIds = Array.isArray(context.scope.project_ids)
		? new Set(context.scope.project_ids)
		: null;
	const visibleProjects = Array.from(projectMap.values()).filter(
		(project) => scopedProjectIds?.has(project.id) || project.state_key !== 'paused'
	);

	return {
		projects: visibleProjects,
		projectMap
	};
}

function assertProjectWriteAccess(project: OntologyProjectSummary): void {
	if (project.access_level !== 'write' && project.access_level !== 'admin') {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Write access is not available for this project',
			{
				project_id: project.id,
				project_name: project.name,
				project_access_level: project.access_level
			}
		);
	}
}

function normalizeProjectState(value: unknown, fieldName = 'state_key'): string | undefined {
	if (value === undefined) return undefined;
	const state = requireTrimmedString(value, fieldName);
	if (state === null) return undefined;
	if (!PROJECT_STATES.includes(state as (typeof PROJECT_STATES)[number])) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${PROJECT_STATES.join(', ')}`
		);
	}
	return state;
}

const ENTITY_STATE_VALUES: Record<ExternalEntityKind, readonly string[]> = {
	project: PROJECT_STATES,
	task: TASK_STATES,
	document: DOCUMENT_STATES,
	goal: GOAL_STATES,
	plan: PLAN_STATES,
	milestone: MILESTONE_STATES,
	risk: RISK_STATES
};

function normalizeEntityStateFilter(
	value: unknown,
	kind: ExternalEntityKind,
	fieldName = 'state_key'
): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;

	if (kind === 'task') {
		const state = normalizeTaskStateInput(value);
		if (state) return state;
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${TASK_STATES.join(', ')}`
		);
	}

	if (kind === 'document') {
		const state = normalizeDocumentStateInput(value);
		if (state) return state;
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${DOCUMENT_STATES.join(', ')}`
		);
	}

	if (kind === 'project') {
		return normalizeProjectState(value, fieldName);
	}

	return normalizeStateValue(value, fieldName, ENTITY_STATE_VALUES[kind]);
}

function normalizeEntityTypeFilter(value: unknown, kind?: ExternalEntityKind): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const typeKey = requireTrimmedString(value, 'type_key');
	if (!typeKey) return undefined;
	void kind;
	return typeKey;
}

function normalizeRiskImpactFilter(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const impact = requireTrimmedString(value, 'impact') ?? '';
	if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'impact must be one of: low, medium, high, critical'
		);
	}
	return impact;
}

function normalizeArchivedBoolean(value: unknown, fieldName = 'archived'): boolean | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'true') return true;
		if (normalized === 'false') return false;
	}
	throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a boolean`);
}

function normalizeArchivedReadFilter(value: unknown): boolean {
	return normalizeArchivedBoolean(value) ?? false;
}

function applyArchivedFilter<
	T extends { is: (...args: any[]) => any; not: (...args: any[]) => any }
>(query: T, archived: boolean): T {
	const withoutDeleted = query.is('deleted_at', null) as T;
	return archived
		? (withoutDeleted.not('archived_at', 'is', null) as T)
		: (withoutDeleted.is('archived_at', null) as T);
}

function applyArchivedReadFilter<
	T extends { is: (...args: any[]) => any; not: (...args: any[]) => any }
>(query: T, args: Record<string, unknown>): T {
	return applyArchivedFilter(query, normalizeArchivedReadFilter(args.archived));
}

function normalizeArchivedUpdate(value: unknown): string | null | undefined {
	const archived = normalizeArchivedBoolean(value);
	if (archived === undefined) return undefined;
	return archived ? new Date().toISOString() : null;
}

function normalizeRelationshipDirection(value: unknown): 'outgoing' | 'incoming' | 'both' {
	if (value === undefined || value === null || value === '') {
		return 'both';
	}
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'direction must be one of: outgoing, incoming, both'
		);
	}
	const normalized = value.trim().toLowerCase();
	if (normalized === 'out' || normalized === 'outgoing') return 'outgoing';
	if (normalized === 'in' || normalized === 'incoming') return 'incoming';
	if (normalized === 'both') return 'both';
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'direction must be one of: outgoing, incoming, both'
	);
}

function normalizeStateValue<const T extends readonly string[]>(
	value: unknown,
	fieldName: string,
	allowed: T,
	fallback?: T[number]
): T[number] | undefined {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}

	const state = requireTrimmedString(value, fieldName);
	if (!allowed.includes(state as T[number])) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be one of: ${allowed.join(', ')}`
		);
	}
	return state as T[number];
}

function normalizeOptionalText(
	value: unknown,
	fieldName: string,
	options?: { allowNull?: boolean }
): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		if (options?.allowNull) return null;
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}
	return requireTrimmedString(value, fieldName, { allowEmpty: true });
}

function normalizeOptionalUuid(value: unknown, fieldName: string): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (typeof value !== 'string' || !isValidUUID(value.trim())) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a valid UUID`);
	}
	return value.trim();
}

function normalizeEntityKind(value: unknown, fieldName: string): ExternalLinkEntityKind {
	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}
	const normalized = value.trim().toLowerCase();
	if (!Object.prototype.hasOwnProperty.call(LINK_ENTITY_TABLES, normalized)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Unsupported ${fieldName}: ${value}`
		);
	}
	return normalized as ExternalLinkEntityKind;
}

function assertValidId(value: unknown, fieldName: string): string {
	if (typeof value !== 'string' || !isValidUUID(value.trim())) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a valid UUID`);
	}
	return value.trim();
}

function getProjectIdsForVisibleContext(visible: VisibleProjectContext): string[] {
	return visible.projects.map((project) => project.id);
}

function getProjectIdsOrThrow(visible: VisibleProjectContext, entityLabel: string): string[] {
	const projectIds = getProjectIdsForVisibleContext(visible);
	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${entityLabel} not found`);
	}
	return projectIds;
}

function withProjectName(
	row: Record<string, unknown>,
	projectMap: Map<string, OntologyProjectSummary>
): Record<string, unknown> {
	return {
		...row,
		project_name: projectMap.get(String(row.project_id))?.name ?? null
	};
}

async function loadEntityForAccess(
	context: ToolExecutionContext,
	kind: ExternalLinkEntityKind,
	id: unknown,
	access: 'read' | 'write',
	options: { archived?: boolean; includeArchived?: boolean } = {}
): Promise<EntityAccessResult> {
	const entityId = assertValidId(id, `${kind}_id`);
	const table = LINK_ENTITY_TABLES[kind];
	const visible = await loadVisibleProjects(context);

	let query = context.admin.from(table).select('*').eq('id', entityId);
	if (ARCHIVABLE_ENTITY_KINDS.has(kind) && !options.includeArchived) {
		query = applyArchivedFilter(query, options.archived ?? false);
	} else if (kind !== 'metric' && kind !== 'source' && !ARCHIVABLE_ENTITY_KINDS.has(kind)) {
		query = query.is('deleted_at', null);
	}

	const { data, error } = await query.maybeSingle();
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || `Failed to load ${kind}`);
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', `${kind} not found`);
	}

	const entity = data as Record<string, unknown>;
	const projectId = kind === 'project' ? entityId : entity.project_id;
	let project: OntologyProjectSummary | null = null;
	try {
		project = assertVisibleEntityProject(visible.projectMap, projectId);
	} catch (error) {
		if (kind === 'project' && options.includeArchived) {
			project = await resolveArchivedProjectAccessContext(context, entity);
		}
		if (!project) throw error;
	}
	if (access === 'write') {
		assertProjectWriteAccess(project);
	}

	return {
		kind,
		entity,
		project,
		projectId: project.id
	};
}

async function loadCoreEntityForAccess(
	context: ToolExecutionContext,
	kind: ExternalEntityKind,
	id: unknown,
	access: 'read' | 'write',
	options: { archived?: boolean; includeArchived?: boolean } = {}
): Promise<EntityAccessResult> {
	return loadEntityForAccess(context, kind, id, access, options);
}

function resolveEntityProjectId(access: EntityAccessResult): string {
	return access.kind === 'project'
		? String(access.entity.id)
		: String(access.entity.project_id ?? access.projectId);
}

function requireTrimmedString(
	value: unknown,
	fieldName: string,
	options?: { allowEmpty?: boolean; allowNull?: boolean }
): string | null {
	if (value === null && options?.allowNull) {
		return null;
	}

	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a string`);
	}

	const normalized = value.trim();
	if (!normalized && options?.allowEmpty !== true) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} is required`);
	}

	return normalized;
}

function normalizeOptionalDate(value: unknown, fieldName: string): string | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null || value === '') {
		return null;
	}

	if (typeof value !== 'string') {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a string or null`
		);
	}

	const normalized = value.trim();
	if (!normalized) {
		return null;
	}

	const parsed = Date.parse(normalized);
	if (Number.isNaN(parsed)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a valid ISO date`
		);
	}

	return normalized;
}

function normalizePriority(
	value: unknown,
	fieldName: string,
	options?: { allowNull?: boolean }
): number | null | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		if (options?.allowNull) {
			return null;
		}
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	const normalized = Math.floor(value);
	if (normalized < 1 || normalized > 5) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a number from 1 to 5`
		);
	}

	return normalized;
}

function normalizeProps(value: unknown, fieldName: string): Record<string, unknown> | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be an object`);
	}

	return value as Record<string, unknown>;
}

function toNullableText(value: string | null | undefined): string | null {
	if (typeof value !== 'string') {
		return value ?? null;
	}

	return value.trim().length > 0 ? value : null;
}

function ensureWriteExecutionContext(
	context: ToolExecutionContext,
	op: BuildosAgentAllowedOp
): { callerId: string; callSessionId: string } {
	if (!context.callerId || !context.callSessionId) {
		throw new ExternalToolGatewayError('INTERNAL', `Missing write execution context for ${op}`);
	}

	return {
		callerId: context.callerId,
		callSessionId: context.callSessionId
	};
}

function getExternalAgentActivityContext(
	context: ToolExecutionContext
): ActivityLogActorContext | undefined {
	if (!context.callerId && !context.callSessionId) {
		return undefined;
	}

	return {
		externalAgentCallerId: context.callerId ?? null,
		agentCallSessionId: context.callSessionId ?? null
	};
}

function getStringArg(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value !== 'string') continue;
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			return trimmed;
		}
	}
	return undefined;
}

function createCalendarExecutor(context: ToolExecutionContext): CalendarPort {
	if (!context.calendar) {
		throw new ExternalToolGatewayError('INTERNAL', 'Calendar port not available');
	}
	return context.calendar;
}

function normalizeCalendarToolError(error: unknown): ExternalToolGatewayError {
	if (error instanceof ExternalToolGatewayError) {
		return error;
	}

	const message = error instanceof Error ? error.message : 'Calendar tool execution failed';
	const normalized = message.toLowerCase();
	if (normalized.includes('not found')) {
		return new ExternalToolGatewayError('NOT_FOUND', message);
	}

	if (
		normalized.includes('required') ||
		normalized.includes('invalid') ||
		normalized.includes('must be') ||
		normalized.includes('expected') ||
		normalized.includes('after') ||
		normalized.includes('before')
	) {
		return new ExternalToolGatewayError('VALIDATION_ERROR', message);
	}

	return new ExternalToolGatewayError('INTERNAL', message);
}

async function runCalendarTool(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	invoke: (executor: CalendarPort, args: Record<string, unknown>) => Promise<unknown>
): Promise<Record<string, unknown>> {
	try {
		const result = await invoke(createCalendarExecutor(context), args);
		if (result && typeof result === 'object' && !Array.isArray(result)) {
			return result as Record<string, unknown>;
		}
		return { result: result ?? null };
	} catch (error) {
		throw normalizeCalendarToolError(error);
	}
}

async function assertCalendarProjectAccess(
	context: ToolExecutionContext,
	projectId: unknown,
	access: 'read' | 'write'
): Promise<OntologyProjectSummary> {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, projectId);
	if (access === 'write') {
		assertProjectWriteAccess(project);
	}
	return project;
}

async function assertTaskCalendarProjectAccess(
	context: ToolExecutionContext,
	taskId: unknown,
	access: 'read' | 'write',
	expectedProjectId?: string
): Promise<OntologyProjectSummary> {
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.select('id, project_id')
		.eq('id', taskId)
		.is('archived_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load task');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const projectId = (data as { project_id?: unknown }).project_id;
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new ExternalToolGatewayError('INTERNAL', 'Task project_id is invalid');
	}

	if (expectedProjectId && projectId !== expectedProjectId) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must belong to project_id');
	}

	return assertCalendarProjectAccess(context, projectId, access);
}

async function assertCalendarEventAccess(
	context: ToolExecutionContext,
	eventId: unknown,
	access: 'read' | 'write'
): Promise<{ projectId: string }> {
	if (typeof eventId !== 'string' || !isValidUUID(eventId)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'onto_event_id must be a valid UUID'
		);
	}

	const { data, error } = await context.admin
		.from('onto_events')
		.select('id, project_id, owner_entity_type, owner_entity_id')
		.eq('id', eventId)
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load event');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Event not found');
	}

	const event = data as {
		project_id?: unknown;
		owner_entity_type?: unknown;
		owner_entity_id?: unknown;
	};
	const projectId = typeof event.project_id === 'string' ? event.project_id : null;
	if (projectId) {
		const project = await assertCalendarProjectAccess(context, projectId, access);
		return { projectId: project.id };
	}

	if (
		event.owner_entity_type === 'project' &&
		typeof event.owner_entity_id === 'string' &&
		isValidUUID(event.owner_entity_id)
	) {
		const project = await assertCalendarProjectAccess(context, event.owner_entity_id, access);
		return { projectId: project.id };
	}

	if (
		event.owner_entity_type === 'task' &&
		typeof event.owner_entity_id === 'string' &&
		isValidUUID(event.owner_entity_id)
	) {
		const project = await assertTaskCalendarProjectAccess(
			context,
			event.owner_entity_id,
			access
		);
		return { projectId: project.id };
	}

	throw new ExternalToolGatewayError(
		'FORBIDDEN',
		'External calendar event access must be scoped to an allowed project or task'
	);
}

async function resolveExternalCalendarProjectArgs(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	access: 'read' | 'write',
	options?: { allowTaskId?: boolean }
): Promise<Record<string, unknown>> {
	const requestedProjectId = getStringArg(args.project_id, args.projectId);
	const taskId = options?.allowTaskId ? getStringArg(args.task_id, args.taskId) : undefined;

	if (taskId) {
		const project = await assertTaskCalendarProjectAccess(
			context,
			taskId,
			access,
			requestedProjectId
		);
		return {
			...args,
			project_id: project.id,
			calendar_scope: 'project'
		};
	}

	if (!requestedProjectId) {
		const message = options?.allowTaskId
			? 'External calendar event access must include project_id or task_id'
			: 'External calendar access must include project_id';
		throw new ExternalToolGatewayError('FORBIDDEN', message);
	}

	const project = await assertCalendarProjectAccess(context, requestedProjectId, access);
	return {
		...args,
		project_id: project.id,
		calendar_scope: 'project'
	};
}

export function normalizeGatewayError(error: unknown): ExternalToolGatewayError {
	if (error instanceof ExternalToolGatewayError) {
		return error;
	}

	if (error instanceof AgentCallWritePendingError) {
		return new ExternalToolGatewayError(
			'CONFLICT',
			'An idempotent write with this key is already in progress'
		);
	}

	if (error instanceof AgentCallWriteReplayError) {
		return new ExternalToolGatewayError('INTERNAL', error.message);
	}

	return new ExternalToolGatewayError(
		'INTERNAL',
		error instanceof Error ? error.message : 'Tool execution failed'
	);
}

function extractWriteEntityMeta(params: {
	op: BuildosAgentAllowedOp;
	result: Record<string, unknown>;
}): { entityKind?: string; entityId?: string } {
	if (params.op === 'onto.edge.link') {
		const edge = params.result.edge;
		if (edge && typeof edge === 'object' && !Array.isArray(edge)) {
			const entityId = (edge as { id?: unknown }).id;
			if (typeof entityId === 'string' && isValidUUID(entityId)) {
				return { entityKind: 'edge', entityId };
			}
		}
	}

	if (params.op === 'onto.edge.unlink') {
		const entityId = params.result.edge_id;
		if (typeof entityId === 'string' && isValidUUID(entityId)) {
			return { entityKind: 'edge', entityId };
		}
	}

	if (params.op === 'onto.task.docs.create_or_attach') {
		const document = params.result.document;
		if (document && typeof document === 'object' && !Array.isArray(document)) {
			const entityId = (document as { id?: unknown }).id;
			if (typeof entityId === 'string' && isValidUUID(entityId)) {
				return { entityKind: 'document', entityId };
			}
		}
	}

	if (params.op === 'onto.document.tree.move') {
		const entityId = params.result.document_id;
		if (typeof entityId === 'string' && isValidUUID(entityId)) {
			return { entityKind: 'document', entityId };
		}
	}

	const entityKeyMap: Array<{ prefix: string; kind: string; resultKey: string }> = [
		{ prefix: 'onto.task.', kind: 'task', resultKey: 'task' },
		{ prefix: 'onto.document.', kind: 'document', resultKey: 'document' },
		{ prefix: 'onto.project.', kind: 'project', resultKey: 'project' },
		{ prefix: 'onto.goal.', kind: 'goal', resultKey: 'goal' },
		{ prefix: 'onto.plan.', kind: 'plan', resultKey: 'plan' },
		{ prefix: 'onto.milestone.', kind: 'milestone', resultKey: 'milestone' },
		{ prefix: 'onto.risk.', kind: 'risk', resultKey: 'risk' },
		{ prefix: 'cal.event.', kind: 'event', resultKey: 'event' }
	];

	for (const { prefix, kind, resultKey } of entityKeyMap) {
		if (!params.op.startsWith(prefix)) continue;
		const entity = params.result[resultKey];
		if (entity && typeof entity === 'object' && !Array.isArray(entity)) {
			const entityId = (entity as { id?: unknown }).id;
			if (typeof entityId === 'string' && isValidUUID(entityId)) {
				return { entityKind: kind, entityId };
			}
		}
	}

	return {};
}

function compactRecordForAudit(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const compact: Record<string, unknown> = {};

	for (const key of ['id', 'project_id', 'project_name', 'title', 'name']) {
		const entry = record[key];
		if (typeof entry === 'string' && entry.trim()) {
			compact[key] = entry;
		}
	}

	return Object.keys(compact).length > 0 ? compact : null;
}

function entityKindFromGatewayOp(op: string): string | null {
	const parts = op.split('.');
	if (parts[0] === 'onto' && parts[1]) return parts[1];
	if (parts[0] === 'cal' && parts[1] === 'event') return 'event';
	if (parts[0] === 'cal' && parts[1] === 'project') return 'calendar';
	return null;
}

function buildToolExecutionAuditPayload(params: {
	response: Record<string, unknown>;
	canonicalOp: BuildosAgentAllowedOp;
	result: Record<string, unknown>;
}): {
	responsePayload: Record<string, unknown>;
	entityKind?: string;
	entityId?: string;
} {
	const entityMeta = extractWriteEntityMeta({
		op: params.canonicalOp,
		result: params.result
	});
	const entityKind = entityMeta.entityKind ?? entityKindFromGatewayOp(params.canonicalOp);
	const responseMeta =
		params.response.meta &&
		typeof params.response.meta === 'object' &&
		!Array.isArray(params.response.meta)
			? (params.response.meta as Record<string, unknown>)
			: null;
	const resultSummary: Record<string, unknown> = {};

	if (entityKind) {
		const compactEntity = compactRecordForAudit(params.result[entityKind]);
		if (compactEntity) {
			resultSummary[entityKind] = compactEntity;
		}
	}

	const compactProject = compactRecordForAudit(params.result.project);
	if (compactProject) {
		resultSummary.project = compactProject;
	}

	for (const countKey of ['total', 'count']) {
		const value = params.result[countKey];
		if (typeof value === 'number' && Number.isFinite(value)) {
			resultSummary[countKey] = value;
		}
	}

	if (Array.isArray(params.result.results)) {
		resultSummary.result_count = params.result.results.length;
	}

	return {
		responsePayload: {
			op: params.response.op ?? params.canonicalOp,
			ok: params.response.ok === true,
			result: resultSummary,
			...(responseMeta ? { meta: responseMeta } : {})
		},
		...(entityKind ? { entityKind } : {}),
		...(entityMeta.entityId ? { entityId: entityMeta.entityId } : {})
	};
}

function buildGatewayResponseMeta(params: {
	requestedOp: string;
	canonicalOp: string;
	warnings: string[];
	extra?: Record<string, unknown>;
}): Record<string, unknown> | undefined {
	const meta: Record<string, unknown> = {
		...(params.canonicalOp !== params.requestedOp ? { executed_op: params.canonicalOp } : {}),
		...(params.warnings.length > 0 ? { warnings: params.warnings } : {}),
		...(params.extra ?? {})
	};

	return Object.keys(meta).length > 0 ? meta : undefined;
}

function buildGatewaySuccessResponse(params: {
	requestedOp: string;
	canonicalOp: string;
	result: Record<string, unknown>;
	warnings: string[];
	meta?: Record<string, unknown>;
}): Record<string, unknown> {
	const responseMeta = buildGatewayResponseMeta({
		requestedOp: params.requestedOp,
		canonicalOp: params.canonicalOp,
		warnings: params.warnings,
		extra: params.meta
	});

	return {
		op: params.requestedOp,
		ok: true,
		result: params.result,
		...(responseMeta ? { meta: responseMeta } : {})
	};
}

async function syncCreatedTaskSideEffects(params: {
	context: ToolExecutionContext;
	project: OntologyProjectSummary;
	actorId: string;
	task: Record<string, unknown>;
}): Promise<void> {
	const actorDisplayName = 'BuildOS agent';
	const mentionUserIds = await resolveEntityMentionUserIds({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectOwnerActorId: params.project.owner_actor_id,
		actorUserId: params.context.userId,
		nextTextValues: [
			typeof params.task.title === 'string' ? params.task.title : null,
			typeof params.task.description === 'string' ? params.task.description : null
		]
	});

	await notifyEntityMentionsAdded({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectName: params.project.name,
		entityType: 'task',
		entityId: String(params.task.id),
		entityTitle: typeof params.task.title === 'string' ? params.task.title : null,
		actorUserId: params.context.userId,
		actorDisplayName,
		mentionedUserIds: mentionUserIds,
		source: 'agent_ping'
	});

	if (params.context.taskSync) {
		try {
			await params.context.taskSync.syncTaskEvents(
				params.context.userId,
				params.actorId,
				params.task as any,
				{
					activityLog: {
						changeSource: 'agent_call',
						actorContext: getExternalAgentActivityContext(params.context)
					}
				}
			);
		} catch (eventError) {
			console.warn(
				'[External Tool Gateway] Failed to sync task events on create:',
				eventError
			);
		}
	}

	await logCreateAsync(
		params.context.admin,
		params.project.id,
		'task',
		String(params.task.id),
		{
			title: params.task.title,
			type_key: params.task.type_key,
			state_key: params.task.state_key
		},
		params.context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(params.context)
	);
}

async function syncUpdatedTaskSideEffects(params: {
	context: ToolExecutionContext;
	project: OntologyProjectSummary;
	actorId: string;
	existingTask: Record<string, unknown>;
	updatedTask: Record<string, unknown>;
	changedArgs: Record<string, unknown>;
}): Promise<void> {
	const isTransitioningToDone =
		params.changedArgs.state_key !== undefined &&
		params.existingTask.state_key !== 'done' &&
		params.updatedTask.state_key === 'done';
	const isTransitioningFromDone =
		params.changedArgs.state_key !== undefined &&
		params.existingTask.state_key === 'done' &&
		params.updatedTask.state_key !== 'done';
	const hasSchedulingEdit =
		params.changedArgs.start_at !== undefined || params.changedArgs.due_at !== undefined;
	const shouldSyncFromTitleEdit =
		params.changedArgs.title !== undefined && !isTransitioningFromDone;
	const shouldSyncEvents = shouldSyncFromTitleEdit || hasSchedulingEdit || isTransitioningToDone;

	if (shouldSyncEvents && params.context.taskSync) {
		try {
			await params.context.taskSync.syncTaskEvents(
				params.context.userId,
				params.actorId,
				params.updatedTask as any,
				{
					activityLog: {
						changeSource: 'agent_call',
						actorContext: getExternalAgentActivityContext(params.context)
					}
				}
			);
		} catch (eventError) {
			console.warn(
				'[External Tool Gateway] Failed to sync task events on update:',
				eventError
			);
		}
	}

	const actorDisplayName = 'BuildOS agent';
	const mentionUserIds = await resolveEntityMentionUserIds({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectOwnerActorId: params.project.owner_actor_id,
		actorUserId: params.context.userId,
		nextTextValues: [
			typeof params.updatedTask.title === 'string' ? params.updatedTask.title : null,
			typeof params.updatedTask.description === 'string'
				? params.updatedTask.description
				: null
		],
		previousTextValues: [
			typeof params.existingTask.title === 'string' ? params.existingTask.title : null,
			typeof params.existingTask.description === 'string'
				? params.existingTask.description
				: null
		]
	});

	await notifyEntityMentionsAdded({
		supabase: params.context.admin,
		projectId: params.project.id,
		projectName: params.project.name,
		entityType: 'task',
		entityId: String(params.updatedTask.id),
		entityTitle: typeof params.updatedTask.title === 'string' ? params.updatedTask.title : null,
		actorUserId: params.context.userId,
		actorDisplayName,
		mentionedUserIds: mentionUserIds,
		source: 'agent_ping'
	});

	await logUpdateAsync(
		params.context.admin,
		params.project.id,
		'task',
		String(params.updatedTask.id),
		{
			title: params.existingTask.title,
			state_key: params.existingTask.state_key,
			props: params.existingTask.props
		},
		{
			title: params.updatedTask.title,
			state_key: params.updatedTask.state_key,
			props: params.updatedTask.props
		},
		params.context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(params.context)
	);
}

async function listCalendarEvents(context: ToolExecutionContext, args: Record<string, unknown>) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.listCalendarEvents(toolArgs as any)
	);
}

async function getCalendarEventDetails(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'read');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.getCalendarEventDetails(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.getCalendarEventDetails(toolArgs as any)
	);
}

async function createCalendarEvent(context: ToolExecutionContext, args: Record<string, unknown>) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write', {
		allowTaskId: true
	});
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.createCalendarEvent(toolArgs as any)
	);
}

async function updateCalendarEvent(context: ToolExecutionContext, args: Record<string, unknown>) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'write');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.updateCalendarEvent(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.updateCalendarEvent(toolArgs as any)
	);
}

async function deleteCalendarEvent(context: ToolExecutionContext, args: Record<string, unknown>) {
	if (args.onto_event_id !== undefined) {
		await assertCalendarEventAccess(context, args.onto_event_id, 'write');
		return runCalendarTool(context, args, (executor, toolArgs) =>
			executor.deleteCalendarEvent(toolArgs as any)
		);
	}

	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.deleteCalendarEvent(toolArgs as any)
	);
}

async function getProjectCalendar(context: ToolExecutionContext, args: Record<string, unknown>) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'read');
	const result = await runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.getProjectCalendar(toolArgs as any)
	);
	return Object.keys(result).length === 1 &&
		Object.prototype.hasOwnProperty.call(result, 'result')
		? { calendar: result.result ?? null }
		: { calendar: result };
}

async function setProjectCalendar(context: ToolExecutionContext, args: Record<string, unknown>) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.setProjectCalendar(toolArgs as any)
	);
}

async function listProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const requestedState = normalizeEntityStateFilter(args.state_key, 'project');
	const requestedType = normalizeEntityTypeFilter(args.type_key, 'project');
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);

	const filteredProjects = visible.projects
		.filter((project) => (requestedState ? project.state_key === requestedState : true))
		.filter((project) => (requestedType ? project.type_key === requestedType : true));
	const projects = filteredProjects.slice(offset, offset + limit).map((project) => ({
		id: project.id,
		name: project.name,
		description: project.description,
		type_key: project.type_key,
		state_key: project.state_key,
		updated_at: project.updated_at,
		task_count: project.task_count,
		goal_count: project.goal_count,
		plan_count: project.plan_count,
		document_count: project.document_count,
		access_role: project.access_role,
		access_level: project.access_level
	}));

	return {
		projects,
		total: filteredProjects.length,
		pagination: buildPaginationForRows(offset, limit, filteredProjects.length, projects.length)
	};
}

async function searchProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const requestedState = normalizeEntityStateFilter(args.state_key, 'project');
	const requestedType = normalizeEntityTypeFilter(args.type_key, 'project');
	const visible = await loadVisibleProjects(context);

	const filteredProjects = visible.projects
		.filter((project) => {
			const haystack = `${project.name} ${project.description ?? ''}`.toLowerCase();
			return haystack.includes(query);
		})
		.filter((project) => (requestedState ? project.state_key === requestedState : true))
		.filter((project) => (requestedType ? project.type_key === requestedType : true));
	const results = filteredProjects.slice(offset, offset + limit).map((project) => ({
		type: 'project',
		id: project.id,
		project_id: project.id,
		project_name: project.name,
		title: project.name,
		snippet: project.description ?? null,
		name: project.name,
		description: project.description,
		type_key: project.type_key,
		state_key: project.state_key,
		updated_at: project.updated_at
	}));

	return {
		query,
		projects: results,
		results,
		total: filteredProjects.length,
		pagination: buildPaginationForRows(offset, limit, filteredProjects.length, results.length)
	};
}

async function getProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);

	const { data, error } = await context.admin.rpc('load_fastchat_context', {
		p_context_type: 'project',
		p_user_id: context.userId,
		p_project_id: project.id
	});

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project snapshot'
		);
	}

	return {
		project: {
			id: project.id,
			name: project.name,
			description: project.description,
			type_key: project.type_key,
			state_key: project.state_key,
			updated_at: project.updated_at,
			task_count: project.task_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			document_count: project.document_count,
			access_role: project.access_role,
			access_level: project.access_level
		},
		snapshot: data ?? null
	};
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function parseDateMs(value: unknown): number | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function pluralizeCount(count: number, label: string): string {
	return `${count} ${label}${count === 1 ? '' : 's'}`;
}

function extractProjectStatusTitle(value: unknown): string | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const record = value as Record<string, unknown>;
	const candidate =
		record.title ?? record.name ?? record.summary ?? record.text ?? record.display_name;
	return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function buildProjectStatusCandidates(projects: OntologyProjectSummary[]) {
	return projects.slice(0, 8).map((project) => ({
		project_id: project.id,
		name: project.name,
		state_key: project.state_key,
		updated_at: project.updated_at
	}));
}

function isProjectStatusTaskComplete(row: Record<string, unknown>): boolean {
	if (typeof row.completed_at === 'string' && row.completed_at.trim()) return true;
	const stateKey = typeof row.state_key === 'string' ? row.state_key.trim().toLowerCase() : '';
	return ['done', 'completed', 'closed', 'archived', 'cancelled', 'canceled'].includes(stateKey);
}

function serializeProjectStatusTask(row: Record<string, unknown>) {
	return {
		id: typeof row.id === 'string' ? row.id : null,
		title: typeof row.title === 'string' ? row.title : null,
		state_key: typeof row.state_key === 'string' ? row.state_key : null,
		priority: typeof row.priority === 'number' ? row.priority : null,
		due_at: typeof row.due_at === 'string' ? row.due_at : null,
		updated_at: typeof row.updated_at === 'string' ? row.updated_at : null
	};
}

function serializeProjectStatusEvent(row: Record<string, unknown>) {
	return {
		id: typeof row.id === 'string' ? row.id : null,
		title: typeof row.title === 'string' ? row.title : null,
		start_at: typeof row.start_at === 'string' ? row.start_at : null,
		end_at: typeof row.end_at === 'string' ? row.end_at : null,
		state_key: typeof row.state_key === 'string' ? row.state_key : null,
		location: typeof row.location === 'string' ? row.location : null
	};
}

function serializeProjectStatusChange(row: Record<string, unknown>) {
	const afterData =
		row.after_data && typeof row.after_data === 'object' && !Array.isArray(row.after_data)
			? (row.after_data as Record<string, unknown>)
			: null;
	const beforeData =
		row.before_data && typeof row.before_data === 'object' && !Array.isArray(row.before_data)
			? (row.before_data as Record<string, unknown>)
			: null;
	return {
		entity_type: typeof row.entity_type === 'string' ? row.entity_type : null,
		entity_id: typeof row.entity_id === 'string' ? row.entity_id : null,
		action: typeof row.action === 'string' ? row.action : null,
		title: extractProjectStatusTitle(afterData) ?? extractProjectStatusTitle(beforeData),
		changed_at: typeof row.created_at === 'string' ? row.created_at : null,
		change_source: typeof row.change_source === 'string' ? row.change_source : null
	};
}

function extractProjectStatusActor(value: unknown): Record<string, unknown> | null {
	if (!value) return null;
	if (Array.isArray(value)) {
		const first = value[0];
		return first && typeof first === 'object' && !Array.isArray(first)
			? (first as Record<string, unknown>)
			: null;
	}
	return typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function serializeProjectStatusCollaborator(row: Record<string, unknown>, currentActorId: string) {
	const actor = extractProjectStatusActor(row.actor);
	const actorId = typeof row.actor_id === 'string' ? row.actor_id : null;
	const name = typeof actor?.name === 'string' && actor.name.trim() ? actor.name.trim() : null;
	const email =
		typeof actor?.email === 'string' && actor.email.trim() ? actor.email.trim() : null;
	const displayName = name ?? email ?? (actorId === currentActorId ? 'You' : 'Project member');

	return {
		id: typeof row.id === 'string' ? row.id : null,
		actor_id: actorId,
		display_name: displayName,
		email,
		role_key: typeof row.role_key === 'string' ? row.role_key : null,
		role_name:
			typeof row.role_name === 'string' && row.role_name.trim() ? row.role_name.trim() : null,
		role_description:
			typeof row.role_description === 'string' && row.role_description.trim()
				? row.role_description.trim()
				: null,
		access: typeof row.access === 'string' ? row.access : null,
		is_current_user: actorId === currentActorId,
		joined_at: typeof row.created_at === 'string' ? row.created_at : null
	};
}

function sortProjectStatusCollaborators(
	currentActorId: string,
	left: Record<string, unknown>,
	right: Record<string, unknown>
) {
	const leftActorId = typeof left.actor_id === 'string' ? left.actor_id : null;
	const rightActorId = typeof right.actor_id === 'string' ? right.actor_id : null;
	if (leftActorId === currentActorId && rightActorId !== currentActorId) return -1;
	if (rightActorId === currentActorId && leftActorId !== currentActorId) return 1;

	const roleOrder: Record<string, number> = { owner: 0, editor: 1, viewer: 2 };
	const leftRole = typeof left.role_key === 'string' ? left.role_key : '';
	const rightRole = typeof right.role_key === 'string' ? right.role_key : '';
	const roleDelta = (roleOrder[leftRole] ?? 99) - (roleOrder[rightRole] ?? 99);
	if (roleDelta !== 0) return roleDelta;

	const leftName = serializeProjectStatusCollaborator(left, currentActorId).display_name;
	const rightName = serializeProjectStatusCollaborator(right, currentActorId).display_name;
	return leftName.localeCompare(rightName);
}

function compareByDate(field: string, ascending: boolean) {
	return (left: Record<string, unknown>, right: Record<string, unknown>) => {
		const leftMs = parseDateMs(left[field]) ?? (ascending ? Number.POSITIVE_INFINITY : 0);
		const rightMs = parseDateMs(right[field]) ?? (ascending ? Number.POSITIVE_INFINITY : 0);
		return ascending ? leftMs - rightMs : rightMs - leftMs;
	};
}

async function resolveProjectStatusTarget(
	context: ToolExecutionContext,
	args: Record<string, unknown>
): Promise<{
	visible: VisibleProjectContext;
	project: OntologyProjectSummary;
	query: string | null;
}> {
	const visible = await loadVisibleProjects(context);
	const projectId = typeof args.project_id === 'string' ? args.project_id.trim() : '';
	if (projectId) {
		return {
			visible,
			project: assertAccessibleProject(visible.projectMap, projectId),
			query: null
		};
	}

	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (query) {
		const normalizedQuery = query.toLowerCase();
		const exactMatches = visible.projects.filter(
			(project) => project.name.trim().toLowerCase() === normalizedQuery
		);
		const matches =
			exactMatches.length > 0
				? exactMatches
				: visible.projects.filter((project) => {
						const haystack =
							`${project.name} ${project.description ?? ''}`.toLowerCase();
						return haystack.includes(normalizedQuery);
					});

		if (matches.length === 1) {
			return { visible, project: matches[0]!, query };
		}
		if (matches.length === 0) {
			throw new ExternalToolGatewayError(
				'NOT_FOUND',
				`No accessible project matched "${query}".`,
				{
					candidates: buildProjectStatusCandidates(visible.projects)
				}
			);
		}
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`Multiple accessible projects matched "${query}". Pass project_id.`,
			{ candidates: buildProjectStatusCandidates(matches) }
		);
	}

	if (visible.projects.length === 1) {
		return { visible, project: visible.projects[0]!, query: null };
	}

	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'project_id is required when more than one project is visible',
		{ candidates: buildProjectStatusCandidates(visible.projects) }
	);
}

async function loadProjectStatusTasks(params: {
	context: ToolExecutionContext;
	projectId: string;
	now: Date;
	dueSoonDays: number;
	taskLimit: number;
}) {
	const horizonIso = addDays(params.now, params.dueSoonDays).toISOString();
	const { data, error } = await params.context.admin
		.from('onto_tasks')
		.select('id, project_id, title, state_key, priority, due_at, completed_at, updated_at')
		.eq('project_id', params.projectId)
		.is('deleted_at', null)
		.is('archived_at', null)
		.lte('due_at', horizonIso)
		.order('due_at', { ascending: true })
		.limit(params.taskLimit * 4);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project due tasks'
		);
	}

	const nowMs = params.now.getTime();
	const horizonMs = addDays(params.now, params.dueSoonDays).getTime();
	const activeDueTasks = ((data ?? []) as Array<Record<string, unknown>>)
		.filter((row) => !isProjectStatusTaskComplete(row))
		.filter((row) => {
			const dueMs = parseDateMs(row.due_at);
			return dueMs !== null && dueMs <= horizonMs;
		});

	return {
		overdue_tasks: activeDueTasks
			.filter((row) => {
				const dueMs = parseDateMs(row.due_at);
				return dueMs !== null && dueMs < nowMs;
			})
			.slice(0, params.taskLimit)
			.map(serializeProjectStatusTask),
		due_soon_tasks: activeDueTasks
			.filter((row) => {
				const dueMs = parseDateMs(row.due_at);
				return dueMs !== null && dueMs >= nowMs;
			})
			.slice(0, params.taskLimit)
			.map(serializeProjectStatusTask)
	};
}

async function loadProjectStatusEvents(params: {
	context: ToolExecutionContext;
	projectId: string;
	now: Date;
	upcomingDays: number;
	eventLimit: number;
}) {
	const nowIso = params.now.toISOString();
	const horizonIso = addDays(params.now, params.upcomingDays).toISOString();
	const { data, error } = await params.context.admin
		.from('onto_events')
		.select('id, project_id, title, state_key, start_at, end_at, location, updated_at')
		.eq('project_id', params.projectId)
		.is('deleted_at', null)
		.gte('start_at', nowIso)
		.lte('start_at', horizonIso)
		.order('start_at', { ascending: true })
		.limit(params.eventLimit);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project upcoming events'
		);
	}

	return ((data ?? []) as Array<Record<string, unknown>>)
		.sort(compareByDate('start_at', true))
		.slice(0, params.eventLimit)
		.map(serializeProjectStatusEvent);
}

async function loadProjectStatusRecentChanges(params: {
	context: ToolExecutionContext;
	projectId: string;
	recentLimit: number;
}) {
	const { data, error } = await params.context.admin
		.from('onto_project_logs')
		.select(
			'entity_type, entity_id, action, created_at, before_data, after_data, change_source'
		)
		.eq('project_id', params.projectId)
		.order('created_at', { ascending: false })
		.limit(params.recentLimit);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project recent changes'
		);
	}

	return ((data ?? []) as Array<Record<string, unknown>>)
		.sort(compareByDate('created_at', false))
		.slice(0, params.recentLimit)
		.map(serializeProjectStatusChange);
}

async function loadProjectStatusCollaborators(params: {
	context: ToolExecutionContext;
	projectId: string;
	collaboratorLimit: number;
}) {
	const currentActorId = await ensureActorId(params.context.admin, params.context.userId);
	const { data, error, count } = await params.context.admin
		.from('onto_project_members')
		.select(
			'id, project_id, actor_id, role_key, access, role_name, role_description, created_at, actor:onto_actors!onto_project_members_actor_id_fkey(id, user_id, name, email)',
			{ count: 'exact' }
		)
		.eq('project_id', params.projectId)
		.is('removed_at', null)
		.order('created_at', { ascending: true })
		.limit(params.collaboratorLimit + 1);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load project collaborators'
		);
	}

	const rows = ((data ?? []) as Array<Record<string, unknown>>).sort((left, right) =>
		sortProjectStatusCollaborators(currentActorId, left, right)
	);
	const visibleRows = rows.slice(0, params.collaboratorLimit);
	const totalCount = typeof count === 'number' ? count : rows.length;

	return {
		count: totalCount,
		shown: visibleRows.length,
		truncated: totalCount > visibleRows.length,
		members: visibleRows.map((row) => serializeProjectStatusCollaborator(row, currentActorId))
	};
}

async function getProjectStatus(context: ToolExecutionContext, args: Record<string, unknown>) {
	const { project, query } = await resolveProjectStatusTarget(context, args);
	const now = new Date();
	const recentLimit = clampInteger(args.recent_limit, 8, 1, 20);
	const taskLimit = clampInteger(args.task_limit, 8, 1, 20);
	const eventLimit = clampInteger(args.event_limit, 8, 1, 20);
	const collaboratorLimit = clampInteger(args.collaborator_limit, 20, 1, 50);
	const dueSoonDays = clampInteger(args.due_soon_days, 7, 1, 60);
	const upcomingDays = clampInteger(args.upcoming_days, 14, 1, 90);

	const [changes, taskStatus, upcomingEvents, collaborators] = await Promise.all([
		loadProjectStatusRecentChanges({
			context,
			projectId: project.id,
			recentLimit
		}),
		loadProjectStatusTasks({
			context,
			projectId: project.id,
			now,
			dueSoonDays,
			taskLimit
		}),
		loadProjectStatusEvents({
			context,
			projectId: project.id,
			now,
			upcomingDays,
			eventLimit
		}),
		loadProjectStatusCollaborators({
			context,
			projectId: project.id,
			collaboratorLimit
		})
	]);

	const counts = {
		tasks: project.task_count ?? 0,
		documents: project.document_count ?? 0,
		plans: project.plan_count ?? 0,
		goals: project.goal_count ?? 0,
		collaborators: collaborators.count
	};
	const countSummary = [
		pluralizeCount(counts.tasks, 'task'),
		pluralizeCount(counts.documents, 'document'),
		pluralizeCount(counts.plans, 'plan'),
		pluralizeCount(counts.goals, 'goal'),
		pluralizeCount(counts.collaborators, 'collaborator')
	].join(', ');

	return {
		generated_at: now.toISOString(),
		scope: 'project',
		project: {
			id: project.id,
			name: project.name,
			description: project.description,
			type_key: project.type_key,
			state_key: project.state_key,
			updated_at: project.updated_at,
			access_role: project.access_role,
			access_level: project.access_level
		},
		overview: {
			short_description: project.description ?? '',
			counts,
			count_summary: `${project.name} has ${countSummary}.`,
			next_step_short: project.next_step_short ?? null
		},
		collaborators,
		recent_changes: changes,
		upcoming: {
			overdue_tasks: taskStatus.overdue_tasks,
			due_soon_tasks: taskStatus.due_soon_tasks,
			upcoming_events: upcomingEvents,
			windows: {
				due_soon_days: dueSoonDays,
				upcoming_days: upcomingDays
			}
		},
		match: {
			status: 'resolved',
			project_id: project.id,
			query
		},
		message: `Project status prepared for ${project.name}.`
	};
}

async function listTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const stateKey = normalizeEntityStateFilter(args.state_key, 'task');
	const typeKey = normalizeEntityTypeFilter(args.type_key, 'task');
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			tasks: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, archived_at, updated_at',
			{ count: 'exact' }
		)
		.in('project_id', projectIds)
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}
	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to list tasks');
	}

	const tasks = (data ?? []).map((task: Record<string, unknown>) => ({
		...task,
		project_name: visible.projectMap.get(String(task.project_id))?.name ?? null
	}));

	return {
		tasks,
		total: count ?? tasks.length,
		pagination: buildPaginationForRows(offset, limit, count ?? tasks.length, tasks.length)
	};
}

async function searchTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['task']);
}

async function getTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskId = args.task_id;
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	query = applyArchivedReadFilter(query, args);

	const { data, error } = await query.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load task');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, data.project_id);

	return {
		task: {
			...data,
			project_name: project.name
		}
	};
}

async function listGoals(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'goal');
}

async function searchGoals(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['goal']);
}

async function getGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'goal');
}

async function listPlans(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'plan');
}

async function searchPlans(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['plan']);
}

async function getPlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'plan');
}

async function listMilestones(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'milestone');
}

async function searchMilestones(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['milestone']);
}

async function getMilestone(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'milestone');
}

async function listRisks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return listCoreEntities(context, args, 'risk');
}

async function searchRisks(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['risk']);
}

async function getRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	return getCoreEntity(context, args, 'risk');
}

async function listCoreEntities(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: Exclude<ExternalEntityKind, 'project' | 'task' | 'document'>
) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const stateKey = normalizeEntityStateFilter(args.state_key, kind);
	const typeKey = normalizeEntityTypeFilter(args.type_key, kind);
	const impact = kind === 'risk' ? normalizeRiskImpactFilter(args.impact) : undefined;
	let projectIds = getProjectIdsForVisibleContext(visible);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			[`${kind}s`]: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	const config = CORE_ENTITY_CONFIG[kind];
	let query = context.admin
		.from(config.table)
		.select(config.select, { count: 'exact' })
		.in('project_id', projectIds)
		.order(kind === 'milestone' ? 'due_at' : 'updated_at', {
			ascending: kind === 'milestone',
			...(kind === 'milestone' ? { nullsFirst: true } : {})
		})
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}
	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}
	if (kind === 'risk' && impact) {
		query = query.eq('impact', impact);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || `Failed to list ${kind}s`);
	}

	const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
		withProjectName(row, visible.projectMap)
	);

	return {
		[`${kind}s`]: rows,
		total: count ?? rows.length,
		pagination: buildPaginationForRows(offset, limit, count ?? rows.length, rows.length)
	};
}

async function getCoreEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: Exclude<ExternalEntityKind, 'task' | 'document'>
) {
	const config = CORE_ENTITY_CONFIG[kind];
	const entityId = args[config.idArg];
	const access = await loadCoreEntityForAccess(context, kind, entityId, 'read', {
		archived: normalizeArchivedReadFilter(args.archived)
	});
	return {
		[config.resultKey]: serializeExternalEntity(kind, access.entity, access.project.name)
	};
}

async function createTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);

	const title = requireTrimmedString(args.title, 'title');
	const description =
		args.description === undefined
			? undefined
			: requireTrimmedString(args.description, 'description', { allowEmpty: true });
	const stateKeyInput =
		args.state_key === undefined
			? undefined
			: requireTrimmedString(args.state_key, 'state_key');
	const stateKey = stateKeyInput === undefined ? 'todo' : normalizeTaskStateInput(stateKeyInput);

	if (!stateKey) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'state_key must be one of: todo, in_progress, blocked, done'
		);
	}

	const typeKey =
		args.type_key === undefined
			? 'task.default'
			: (requireTrimmedString(args.type_key, 'type_key') ?? 'task.default');
	const priority = normalizePriority(args.priority, 'priority');
	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	const props = normalizeProps(args.props, 'props');
	const actorId = await ensureActorId(context.admin, context.userId);

	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		title,
		description: toNullableText(description),
		type_key: typeKey,
		state_key: stateKey,
		created_by: actorId,
		start_at: startAt ?? null,
		due_at: dueAt ?? null,
		props: props ?? {}
	};

	if (priority !== undefined) {
		insertPayload.priority = priority;
	}

	if (stateKey === 'done') {
		insertPayload.completed_at = new Date().toISOString();
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.insert(insertPayload)
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at'
		)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create task');
	}

	await syncCreatedTaskSideEffects({
		context,
		project,
		actorId,
		task: data as Record<string, unknown>
	});

	return {
		task: {
			...data,
			project_name: project.name
		}
	};
}

async function updateTask(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskId = args.task_id;
	if (typeof taskId !== 'string' || !isValidUUID(taskId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'task_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	let existingTaskQuery = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	if (archivedAtUpdate !== null) {
		existingTaskQuery = existingTaskQuery.is('archived_at', null);
	}

	const { data: existingTask, error: existingTaskError } = await existingTaskQuery.maybeSingle();

	if (existingTaskError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingTaskError.message || 'Failed to load task'
		);
	}

	if (!existingTask) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Task not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, existingTask.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;

	if (args.title !== undefined) {
		updateData.title = requireTrimmedString(args.title, 'title');
		changedFieldCount += 1;
	}

	if (args.description !== undefined) {
		if (args.description === null) {
			updateData.description = null;
		} else {
			updateData.description = toNullableText(
				requireTrimmedString(args.description, 'description', {
					allowEmpty: true
				})
			);
		}
		changedFieldCount += 1;
	}

	if (args.type_key !== undefined) {
		updateData.type_key = requireTrimmedString(args.type_key, 'type_key');
		changedFieldCount += 1;
	}

	if (args.priority !== undefined) {
		updateData.priority = normalizePriority(args.priority, 'priority', { allowNull: true });
		changedFieldCount += 1;
	}

	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changedFieldCount += 1;
	}

	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	if (dueAt !== undefined) {
		updateData.due_at = dueAt;
		changedFieldCount += 1;
	}

	if (args.props !== undefined) {
		const props = normalizeProps(args.props, 'props');
		updateData.props = {
			...((existingTask.props as Record<string, unknown> | null) ?? {}),
			...(props ?? {})
		};
		changedFieldCount += 1;
	}

	if (args.state_key !== undefined) {
		const normalizedStateInput = requireTrimmedString(args.state_key, 'state_key');
		const normalizedState = normalizeTaskStateInput(normalizedStateInput);
		if (!normalizedState) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'state_key must be one of: todo, in_progress, blocked, done'
			);
		}

		updateData.state_key = normalizedState;
		if (existingTask.state_key !== 'done' && normalizedState === 'done') {
			updateData.completed_at = new Date().toISOString();
		} else if (existingTask.state_key === 'done' && normalizedState !== 'done') {
			updateData.completed_at = null;
		}
		changedFieldCount += 1;
	}

	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changedFieldCount += 1;
	}

	if (changedFieldCount === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable task field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_tasks')
		.update(updateData)
		.eq('id', taskId)
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, archived_at'
		)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to update task');
	}

	await syncUpdatedTaskSideEffects({
		context,
		project,
		actorId,
		existingTask: existingTask as Record<string, unknown>,
		updatedTask: data as Record<string, unknown>,
		changedArgs: args
	});

	return {
		task: {
			...data,
			project_name: project.name
		}
	};
}

function assertContentWithinCap(value: string | null | undefined, fieldName: string): void {
	if (typeof value !== 'string' || value.length === 0) return;
	const byteLength = Buffer.byteLength(value, 'utf8');
	if (byteLength > MAX_DOCUMENT_CONTENT_BYTES) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} exceeds the 200 KB limit for external document writes`,
			{ byte_length: byteLength, limit_bytes: MAX_DOCUMENT_CONTENT_BYTES }
		);
	}
}

function resolveDocumentTypeKey(value: unknown): string {
	if (typeof value !== 'string' || !value.trim()) {
		return 'document.default';
	}
	const trimmed = value.trim();
	return isValidTypeKey(trimmed, 'document') ? trimmed : 'document.default';
}

function normalizeDocumentPosition(value: unknown, fieldName: string): number | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be a non-negative integer`
		);
	}
	return value;
}

function normalizeDocumentUpdateStrategy(value: unknown): 'replace' | 'append' | 'merge_llm' {
	if (value === undefined || value === null) return 'replace';
	if (value === 'replace' || value === 'append' || value === 'merge_llm') {
		return value;
	}
	throw new ExternalToolGatewayError(
		'VALIDATION_ERROR',
		'update_strategy must be one of: replace, append, merge_llm'
	);
}

async function resolveExternalDocumentContentWithStrategy(params: {
	strategy: 'replace' | 'append' | 'merge_llm';
	newContent: string;
	existingLoader: () => Promise<string>;
}): Promise<string> {
	const { strategy, newContent, existingLoader } = params;

	if (strategy === 'replace') {
		return newContent;
	}

	let existingText = '';
	try {
		existingText = await existingLoader();
	} catch (error) {
		console.warn(
			'[External Tool Gateway] Failed to load existing document content for merge, using provided content:',
			error
		);
		return newContent;
	}

	if (!newContent.trim()) {
		return existingText;
	}

	if (strategy === 'append' || strategy === 'merge_llm') {
		return existingText ? `${existingText}\n\n${newContent}` : newContent;
	}

	return newContent;
}

async function createDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);

	const title = requireTrimmedString(args.title, 'title');
	const description =
		args.description === undefined
			? null
			: args.description === null
				? null
				: requireTrimmedString(args.description, 'description', { allowEmpty: true });

	const rawContent =
		typeof args.content === 'string'
			? args.content
			: typeof args.body_markdown === 'string'
				? args.body_markdown
				: null;
	const normalizedContent = normalizeMarkdownInput(rawContent);
	assertContentWithinCap(normalizedContent, 'content');

	const typeKey = resolveDocumentTypeKey(args.type_key);

	const stateInput =
		args.state_key === undefined
			? undefined
			: requireTrimmedString(args.state_key, 'state_key');
	const normalizedState =
		stateInput === undefined ? 'draft' : normalizeDocumentStateInput(stateInput);
	if (!normalizedState) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
		);
	}

	const parentDocumentInput =
		args.parent_document_id !== undefined ? args.parent_document_id : args.parent_id;
	if (
		args.parent_document_id !== undefined &&
		args.parent_id !== undefined &&
		args.parent_document_id !== args.parent_id
	) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'parent_document_id and parent_id must match when both are provided'
		);
	}

	const parentDocumentId =
		parentDocumentInput === undefined || parentDocumentInput === null
			? null
			: typeof parentDocumentInput === 'string' && isValidUUID(parentDocumentInput)
				? parentDocumentInput
				: (() => {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							'parent_document_id (or parent_id) must be a valid UUID'
						);
					})();

	const props = normalizeProps(args.props, 'props') ?? {};
	const position = normalizeDocumentPosition(args.position, 'position');
	const actorId = await ensureActorId(context.admin, context.userId);

	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		title,
		description,
		type_key: typeKey,
		state_key: normalizedState,
		content: normalizedContent,
		props: {
			...props,
			...(normalizedContent ? { body_markdown: normalizedContent } : {}),
			origin: 'external_agent'
		},
		created_by: actorId
	};

	const { data, error } = await context.admin
		.from('onto_documents')
		.insert(insertPayload)
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to create document'
		);
	}

	try {
		await createOrMergeDocumentVersion({
			supabase: context.admin,
			documentId: data.id,
			actorId,
			snapshot: toDocumentSnapshot(data),
			changeSource: 'api'
		});
	} catch (versionError) {
		console.warn(
			'[External Tool Gateway] Failed to record initial document version:',
			versionError
		);
	}

	let structure: Record<string, unknown> | null = null;
	let structureError: string | null = null;
	try {
		structure = (await addDocumentToTree(
			context.admin,
			project.id,
			String(data.id),
			{
				parentId: parentDocumentId,
				position,
				title: typeof data.title === 'string' ? data.title : null,
				description: typeof data.description === 'string' ? data.description : null
			},
			actorId
		)) as unknown as Record<string, unknown>;
	} catch (treeError) {
		structureError = treeError instanceof Error ? treeError.message : String(treeError);
		console.warn('[External Tool Gateway] Failed to place document in tree:', treeError);
	}

	await notifyEntityMentionsAdded({
		supabase: context.admin,
		projectId: project.id,
		projectName: project.name,
		entityType: 'document',
		entityId: String(data.id),
		entityTitle: typeof data.title === 'string' ? data.title : null,
		actorUserId: context.userId,
		actorDisplayName: 'BuildOS agent',
		mentionedUserIds: await resolveEntityMentionUserIds({
			supabase: context.admin,
			projectId: project.id,
			projectOwnerActorId: project.owner_actor_id,
			actorUserId: context.userId,
			nextTextValues: [
				typeof data.title === 'string' ? data.title : null,
				typeof data.description === 'string' ? data.description : null,
				typeof data.content === 'string' ? data.content : null
			]
		}),
		source: 'agent_ping'
	});

	await logCreateAsync(
		context.admin,
		project.id,
		'document',
		String(data.id),
		{
			title: data.title,
			type_key: data.type_key,
			state_key: data.state_key
		},
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		document: serializeExternalEntity(
			'document',
			data as Record<string, unknown>,
			project.name
		),
		structure,
		structure_error: structureError
	};
}

async function updateDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	let existingDocumentQuery = context.admin
		.from('onto_documents')
		.select('*')
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	if (archivedAtUpdate !== null) {
		existingDocumentQuery = existingDocumentQuery.is('archived_at', null);
	}

	const { data: existingDocument, error: existingError } =
		await existingDocumentQuery.maybeSingle();

	if (existingError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingError.message || 'Failed to load document'
		);
	}

	if (!existingDocument) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, existingDocument.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);

	const updateData: Record<string, unknown> = {
		updated_at: new Date().toISOString()
	};
	let changedFieldCount = 0;
	let propsTouched = false;
	const mergedProps: Record<string, unknown> = {
		...((existingDocument.props as Record<string, unknown> | null) ?? {})
	};
	const strategy = normalizeDocumentUpdateStrategy(args.update_strategy);
	const mergeInstructions =
		args.merge_instructions === undefined
			? undefined
			: requireTrimmedString(args.merge_instructions, 'merge_instructions', {
					allowEmpty: true
				});
	void mergeInstructions;

	if (args.title !== undefined) {
		updateData.title = requireTrimmedString(args.title, 'title');
		changedFieldCount += 1;
	}

	if (args.description !== undefined) {
		if (args.description === null) {
			updateData.description = null;
		} else {
			updateData.description = requireTrimmedString(args.description, 'description', {
				allowEmpty: true
			});
		}
		changedFieldCount += 1;
	}

	if (args.type_key !== undefined) {
		updateData.type_key = resolveDocumentTypeKey(args.type_key);
		changedFieldCount += 1;
	}

	if (args.state_key !== undefined) {
		const normalizedStateInput = requireTrimmedString(args.state_key, 'state_key');
		const normalizedState = normalizeDocumentStateInput(normalizedStateInput);
		if (!normalizedState) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}
		updateData.state_key = normalizedState;
		changedFieldCount += 1;
	}

	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changedFieldCount += 1;
	}

	const documentContentCandidate =
		args.content !== undefined || args.body_markdown !== undefined
			? typeof args.content === 'string'
				? args.content
				: typeof args.body_markdown === 'string'
					? args.body_markdown
					: ''
			: undefined;

	if (isAppendOrMergeUpdateStrategy(strategy) && !getDocumentUpdateContentCandidate(args)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`update_onto_document ${strategy} requires non-empty content.`
		);
	}

	if (documentContentCandidate !== undefined) {
		const normalizedContent = normalizeMarkdownInput(documentContentCandidate) ?? '';
		const resolvedContent = await resolveExternalDocumentContentWithStrategy({
			strategy,
			newContent: normalizedContent,
			existingLoader: async () =>
				typeof existingDocument.content === 'string'
					? existingDocument.content
					: typeof (existingDocument.props as Record<string, unknown> | null)
								?.body_markdown === 'string'
						? ((existingDocument.props as Record<string, unknown>)
								.body_markdown as string)
						: ''
		});
		assertContentWithinCap(resolvedContent, 'content');
		updateData.content = resolvedContent;
		mergedProps.body_markdown = resolvedContent;
		propsTouched = true;
		changedFieldCount += 1;
	}

	if (args.props !== undefined) {
		const propsPatch = normalizeProps(args.props, 'props');
		Object.assign(mergedProps, propsPatch ?? {});
		propsTouched = true;
		changedFieldCount += 1;
	}

	if (propsTouched) {
		mergedProps.origin = mergedProps.origin ?? 'external_agent';
		updateData.props = mergedProps;
	}

	if (changedFieldCount === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable document field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_documents')
		.update(updateData)
		.eq('id', documentId)
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to update document'
		);
	}

	try {
		await createOrMergeDocumentVersion({
			supabase: context.admin,
			documentId: data.id,
			actorId,
			snapshot: toDocumentSnapshot(data),
			changeSource: 'api'
		});
	} catch (versionError) {
		console.warn('[External Tool Gateway] Failed to record document version:', versionError);
	}

	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		String(data.id),
		{
			title: existingDocument.title,
			state_key: existingDocument.state_key,
			type_key: existingDocument.type_key
		},
		{
			title: data.title,
			state_key: data.state_key,
			type_key: data.type_key
		},
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		document: serializeExternalEntity('document', data as Record<string, unknown>, project.name)
	};
}

async function createProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	// Project creation is gated only by the `onto.project.create` write op being in
	// the caller's whitelist (enforced by registry inclusion) plus read_write mode.
	// It is intentionally NOT tied to all-project scope: a project-scoped key may
	// create new projects, and the created project is auto-added to the key's scope
	// below so the same caller can immediately read and write it.

	if (Array.isArray(args.clarifications) && args.clarifications.length > 0) {
		return {
			project_id: '',
			counts: {},
			clarifications: args.clarifications,
			message: 'Additional information is required before creating the project.'
		};
	}

	const contextDocument =
		args.context_document &&
		typeof args.context_document === 'object' &&
		!Array.isArray(args.context_document)
			? {
					...(args.context_document as Record<string, unknown>),
					body_markdown:
						typeof (args.context_document as Record<string, unknown>).body_markdown ===
						'string'
							? (args.context_document as Record<string, unknown>).body_markdown
							: (args.context_document as Record<string, unknown>).content
				}
			: undefined;
	const spec = {
		project: args.project,
		entities: Array.isArray(args.entities) ? args.entities : [],
		relationships: Array.isArray(args.relationships) ? args.relationships : [],
		...(contextDocument ? { context_document: contextDocument } : {})
	};
	const validation = validateProjectSpec(spec);
	if (!validation.valid) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			validation.errors[0] ?? 'Invalid ProjectSpec'
		);
	}

	let result: { project_id: string; counts: Record<string, number | undefined> };
	try {
		result = await instantiateProject(context.admin, spec as any, context.userId, {
			activityLog: {
				changeSource: 'agent_call',
				actorContext: getExternalAgentActivityContext(context)
			}
		});
	} catch (error) {
		if (error instanceof OntologyInstantiationError) {
			throw new ExternalToolGatewayError('VALIDATION_ERROR', error.message);
		}
		throw error;
	}

	await grantCallerProjectAccess(context, result.project_id);

	const { data: project } = await context.admin
		.from('onto_projects')
		.select(CORE_ENTITY_CONFIG.project.select)
		.eq('id', result.project_id)
		.maybeSingle();

	return {
		project_id: result.project_id,
		project: project ?? { id: result.project_id },
		counts: result.counts,
		message: `Created project "${(project as { name?: string } | null)?.name ?? result.project_id}".`
	};
}

/**
 * After a project-scoped caller creates a project, add it to that caller's scope
 * so the same key can immediately read and write the project it just made.
 *
 * - Unscoped callers (project_ids absent) already see all projects — no-op.
 * - The in-memory scope is updated so later calls in this same session work.
 * - The caller policy is persisted so future sessions keep the access. Runtime
 *   auth (both static keys and OAuth) derives scope from external_agent_callers.
 *   policy, so updating it here is sufficient.
 */
async function grantCallerProjectAccess(
	context: ToolExecutionContext,
	projectId: string
): Promise<void> {
	if (!context.callerId) return;
	if (!Array.isArray(context.scope.project_ids)) return;
	if (context.scope.project_ids.includes(projectId)) return;

	// Update the in-session scope immediately.
	context.scope.project_ids = [...context.scope.project_ids, projectId];

	try {
		const { data: caller } = await context.admin
			.from('external_agent_callers')
			.select('policy')
			.eq('id', context.callerId)
			.maybeSingle();

		const policy = ((caller?.policy as Record<string, unknown> | null) ?? {}) as Record<
			string,
			unknown
		>;
		const existing = Array.isArray(policy.allowed_project_ids)
			? (policy.allowed_project_ids as unknown[]).filter(
					(id): id is string => typeof id === 'string'
				)
			: null;

		// A null stored allowlist means the key is unscoped in storage; don't
		// narrow it to a single project. Only append when an explicit list exists.
		if (!existing || existing.includes(projectId)) return;

		await context.admin
			.from('external_agent_callers')
			.update({ policy: { ...policy, allowed_project_ids: [...existing, projectId] } })
			.eq('id', context.callerId);
	} catch {
		// Persisting the scope expansion is best-effort. The project was created and
		// is usable for the rest of this session even if the policy write fails.
	}
}

async function updateProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const access = await loadCoreEntityForAccess(context, 'project', args.project_id, 'write', {
		includeArchived: archivedAtUpdate === null
	});
	const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
	let changed = 0;

	if (args.name !== undefined) {
		updateData.name = requireTrimmedString(args.name, 'name');
		changed += 1;
	}
	if (args.description !== undefined) {
		updateData.description = normalizeOptionalText(args.description, 'description', {
			allowNull: true
		});
		changed += 1;
	}
	if (args.state_key !== undefined || args.state !== undefined) {
		updateData.state_key = normalizeProjectState(args.state_key ?? args.state);
		changed += 1;
	}
	const startAt = normalizeOptionalDate(args.start_at, 'start_at');
	if (startAt !== undefined) {
		updateData.start_at = startAt;
		changed += 1;
	}
	const endAt = normalizeOptionalDate(args.end_at, 'end_at');
	if (endAt !== undefined) {
		updateData.end_at = endAt;
		changed += 1;
	}
	if (args.props !== undefined) {
		updateData.props = {
			...((access.entity.props as Record<string, unknown> | null) ?? {}),
			...(normalizeProps(args.props, 'props') ?? {})
		};
		changed += 1;
	}
	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
		changed += 1;
	}

	if (changed === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'At least one writable project field is required'
		);
	}

	const { data, error } = await context.admin
		.from('onto_projects')
		.update(updateData)
		.eq('id', access.project.id)
		.select(CORE_ENTITY_CONFIG.project.select)
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to update project'
		);
	}

	await logUpdateAsync(
		context.admin,
		access.project.id,
		'project',
		access.project.id,
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		project: data,
		message: `Updated ontology project "${data.name ?? access.project.id}".`
	};
}

async function createGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);
	const name = requireTrimmedString(args.name, 'name');
	const stateKey = normalizeStateValue(args.state_key, 'state_key', GOAL_STATES, 'draft');
	const targetDate = normalizeOptionalDate(args.target_date, 'target_date');
	const description = normalizeOptionalText(args.description, 'description', { allowNull: true });
	const goalBody = normalizeOptionalText(args.goal, 'goal', { allowNull: true });
	const measurementCriteria = normalizeOptionalText(
		args.measurement_criteria,
		'measurement_criteria',
		{ allowNull: true }
	);
	const props = normalizeProps(args.props, 'props') ?? {};
	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		name,
		goal: goalBody ?? null,
		description: description ?? null,
		type_key:
			typeof args.type_key === 'string' && args.type_key.trim()
				? args.type_key.trim()
				: 'goal.outcome.project',
		state_key: stateKey,
		target_date: targetDate ?? null,
		completed_at: stateKey === 'achieved' ? new Date().toISOString() : null,
		created_by: actorId,
		props: {
			...props,
			goal: goalBody ?? null,
			description: description ?? null,
			target_date: targetDate ?? null,
			measurement_criteria: measurementCriteria ?? null,
			priority: args.priority ?? null
		}
	};

	const { data, error } = await context.admin
		.from('onto_goals')
		.insert(insertPayload)
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create goal');
	}

	await logCreateAsync(
		context.admin,
		project.id,
		'goal',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		goal: serializeExternalEntity('goal', data as Record<string, unknown>, project.name),
		message: `Created ontology goal "${data.name ?? 'Goal'}".`
	};
}

async function updateGoal(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'goal', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.name !== undefined) updateData.name = requireTrimmedString(args.name, 'name');
		if (args.description !== undefined) {
			updateData.description = normalizeOptionalText(args.description, 'description', {
				allowNull: true
			});
		}
		if (args.type_key !== undefined)
			updateData.type_key = requireTrimmedString(args.type_key, 'type_key');
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(args.state_key, 'state_key', GOAL_STATES);
			updateData.completed_at =
				updateData.state_key === 'achieved'
					? (existing.completed_at ?? new Date().toISOString())
					: null;
		}
		if (args.target_date !== undefined) {
			updateData.target_date = normalizeOptionalDate(args.target_date, 'target_date');
		}
		if (
			args.props !== undefined ||
			args.measurement_criteria !== undefined ||
			args.priority !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.measurement_criteria !== undefined
					? {
							measurement_criteria: normalizeOptionalText(
								args.measurement_criteria,
								'measurement_criteria',
								{ allowNull: true }
							)
						}
					: {}),
				...(args.priority !== undefined ? { priority: args.priority } : {})
			};
		}
		return updateData;
	});
}

async function createPlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);
	const name = requireTrimmedString(args.name, 'name');
	const description = normalizeOptionalText(args.description, 'description', { allowNull: true });
	const planBody = normalizeMarkdownInput(typeof args.plan === 'string' ? args.plan : null);
	const stateKey = normalizeStateValue(args.state_key, 'state_key', PLAN_STATES, 'draft');
	const props = normalizeProps(args.props, 'props') ?? {};
	const startDate = normalizeOptionalText(args.start_date, 'start_date', { allowNull: true });
	const endDate = normalizeOptionalText(args.end_date, 'end_date', { allowNull: true });
	const insertPayload: Record<string, unknown> = {
		project_id: project.id,
		name,
		description: description ?? null,
		plan: planBody ?? null,
		type_key:
			typeof args.type_key === 'string' && args.type_key.trim()
				? args.type_key.trim()
				: 'plan.phase.project',
		state_key: stateKey,
		created_by: actorId,
		props: {
			...props,
			plan: planBody ?? null,
			description: description ?? null,
			start_date: startDate ?? null,
			end_date: endDate ?? null
		}
	};

	const { data, error } = await context.admin
		.from('onto_plans')
		.insert(insertPayload)
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create plan');
	}

	await createOptionalParentEdges(context, project, 'plan', String(data.id), [
		...(typeof args.goal_id === 'string'
			? [{ kind: 'goal', id: args.goal_id, rel: 'has_plan' }]
			: []),
		...(typeof args.milestone_id === 'string'
			? [{ kind: 'milestone', id: args.milestone_id, rel: 'has_plan' }]
			: [])
	]);
	await logCreateAsync(
		context.admin,
		project.id,
		'plan',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		plan: serializeExternalEntity('plan', data as Record<string, unknown>, project.name),
		message: `Created ontology plan "${data.name ?? 'Plan'}".`
	};
}

async function updatePlan(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'plan', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.name !== undefined) updateData.name = requireTrimmedString(args.name, 'name');
		if (args.description !== undefined) {
			updateData.description = normalizeOptionalText(args.description, 'description', {
				allowNull: true
			});
		}
		if (args.plan !== undefined) {
			updateData.plan = normalizeMarkdownInput(
				typeof args.plan === 'string' ? args.plan : null
			);
		}
		if (args.type_key !== undefined)
			updateData.type_key = requireTrimmedString(args.type_key, 'type_key');
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(args.state_key, 'state_key', PLAN_STATES);
		}
		if (
			args.props !== undefined ||
			args.start_date !== undefined ||
			args.end_date !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.start_date !== undefined
					? {
							start_date: normalizeOptionalText(args.start_date, 'start_date', {
								allowNull: true
							})
						}
					: {}),
				...(args.end_date !== undefined
					? {
							end_date: normalizeOptionalText(args.end_date, 'end_date', {
								allowNull: true
							})
						}
					: {})
			};
		}
		return updateData;
	});
}

async function createMilestone(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
	const goalId = normalizeOptionalUuid(args.goal_id, 'goal_id');
	if (!goalId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'goal_id is required for milestones'
		);
	}
	await loadCoreEntityForAccess(context, 'goal', goalId, 'write');
	const actorId = await ensureActorId(context.admin, context.userId);
	const title = requireTrimmedString(args.title, 'title');
	const stateKey = normalizeStateValue(args.state_key, 'state_key', MILESTONE_STATES, 'pending');
	const dueAt = normalizeOptionalDate(args.due_at, 'due_at');
	const description = normalizeOptionalText(args.description, 'description', { allowNull: true });
	const milestone = normalizeOptionalText(args.milestone, 'milestone', { allowNull: true });
	const props = normalizeProps(args.props, 'props') ?? {};
	const { data, error } = await context.admin
		.from('onto_milestones')
		.insert({
			project_id: project.id,
			title,
			milestone: milestone ?? null,
			description: description ?? null,
			type_key: 'milestone.default',
			state_key: stateKey,
			due_at: dueAt ?? null,
			props,
			created_by: actorId
		})
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || 'Failed to create milestone'
		);
	}

	await createOptionalParentEdges(context, project, 'milestone', String(data.id), [
		{ kind: 'goal', id: goalId, rel: 'has_milestone' }
	]);
	await logCreateAsync(
		context.admin,
		project.id,
		'milestone',
		String(data.id),
		{ title: data.title, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		milestone: serializeExternalEntity(
			'milestone',
			data as Record<string, unknown>,
			project.name
		),
		message: `Created ontology milestone "${data.title ?? 'Milestone'}".`
	};
}

async function updateMilestone(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'milestone', () => {
		const updateData: Record<string, unknown> = {};
		if (args.title !== undefined) updateData.title = requireTrimmedString(args.title, 'title');
		if (args.description !== undefined) {
			updateData.description = normalizeOptionalText(args.description, 'description', {
				allowNull: true
			});
		}
		if (args.due_at !== undefined)
			updateData.due_at = normalizeOptionalDate(args.due_at, 'due_at');
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(
				args.state_key,
				'state_key',
				MILESTONE_STATES
			);
		}
		if (args.props !== undefined) updateData.props = normalizeProps(args.props, 'props');
		return updateData;
	});
}

async function createRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
	const actorId = await ensureActorId(context.admin, context.userId);
	const title = requireTrimmedString(args.title, 'title');
	const impact = requireTrimmedString(args.impact, 'impact') ?? '';
	if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'impact must be one of: low, medium, high, critical'
		);
	}
	const probability =
		args.probability === undefined
			? null
			: typeof args.probability === 'number' &&
				  Number.isFinite(args.probability) &&
				  args.probability >= 0 &&
				  args.probability <= 1
				? args.probability
				: (() => {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							'probability must be a number between 0 and 1'
						);
					})();
	const stateKey = normalizeStateValue(args.state_key, 'state_key', RISK_STATES, 'identified');
	const content =
		normalizeOptionalText(args.content, 'content', { allowNull: true }) ??
		normalizeOptionalText(args.description, 'description', { allowNull: true }) ??
		null;
	const mitigationStrategy = normalizeOptionalText(
		args.mitigation_strategy,
		'mitigation_strategy',
		{ allowNull: true }
	);
	const props = normalizeProps(args.props, 'props') ?? {};
	const { data, error } = await context.admin
		.from('onto_risks')
		.insert({
			project_id: project.id,
			title,
			impact,
			probability,
			state_key: stateKey,
			content,
			type_key: 'risk.default',
			props: {
				...props,
				description: content,
				mitigation_strategy: mitigationStrategy ?? null
			},
			...(stateKey === 'mitigated' ? { mitigated_at: new Date().toISOString() } : {}),
			created_by: actorId
		})
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create risk');
	}

	await logCreateAsync(
		context.admin,
		project.id,
		'risk',
		String(data.id),
		{ title: data.title, impact: data.impact, state_key: data.state_key },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		risk: serializeExternalEntity('risk', data as Record<string, unknown>, project.name),
		message: `Created ontology risk "${data.title ?? 'Risk'}".`
	};
}

async function updateRisk(context: ToolExecutionContext, args: Record<string, unknown>) {
	return updateCoreEntity(context, args, 'risk', (existing) => {
		const updateData: Record<string, unknown> = {};
		if (args.title !== undefined) updateData.title = requireTrimmedString(args.title, 'title');
		if (args.impact !== undefined) {
			const impact = requireTrimmedString(args.impact, 'impact') ?? '';
			if (!['low', 'medium', 'high', 'critical'].includes(impact)) {
				throw new ExternalToolGatewayError(
					'VALIDATION_ERROR',
					'impact must be one of: low, medium, high, critical'
				);
			}
			updateData.impact = impact;
		}
		if (args.probability !== undefined) {
			updateData.probability =
				typeof args.probability === 'number' &&
				Number.isFinite(args.probability) &&
				args.probability >= 0 &&
				args.probability <= 1
					? args.probability
					: (() => {
							throw new ExternalToolGatewayError(
								'VALIDATION_ERROR',
								'probability must be a number between 0 and 1'
							);
						})();
		}
		if (args.state_key !== undefined) {
			updateData.state_key = normalizeStateValue(args.state_key, 'state_key', RISK_STATES);
			updateData.mitigated_at =
				updateData.state_key === 'mitigated'
					? (existing.mitigated_at ?? new Date().toISOString())
					: existing.mitigated_at;
		}
		if (args.content !== undefined) {
			updateData.content = normalizeOptionalText(args.content, 'content', {
				allowNull: true
			});
		}
		if (
			args.props !== undefined ||
			args.description !== undefined ||
			args.mitigation_strategy !== undefined ||
			args.owner !== undefined
		) {
			updateData.props = {
				...((existing.props as Record<string, unknown> | null) ?? {}),
				...(normalizeProps(args.props, 'props') ?? {}),
				...(args.description !== undefined
					? {
							description: normalizeOptionalText(args.description, 'description', {
								allowNull: true
							})
						}
					: {}),
				...(args.mitigation_strategy !== undefined
					? {
							mitigation_strategy: normalizeOptionalText(
								args.mitigation_strategy,
								'mitigation_strategy',
								{ allowNull: true }
							)
						}
					: {}),
				...(args.owner !== undefined
					? { owner: normalizeOptionalText(args.owner, 'owner', { allowNull: true }) }
					: {})
			};
		}
		return updateData;
	});
}

async function updateCoreEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: Exclude<ExternalEntityKind, 'project' | 'task' | 'document'>,
	buildUpdateData: (existing: Record<string, unknown>) => Record<string, unknown>
) {
	const config = CORE_ENTITY_CONFIG[kind];
	const archivedAtUpdate = normalizeArchivedUpdate(args.archived);
	const access = await loadCoreEntityForAccess(context, kind, args[config.idArg], 'write', {
		includeArchived: archivedAtUpdate === null
	});
	const updateData = buildUpdateData(access.entity);
	if (archivedAtUpdate !== undefined) {
		updateData.archived_at = archivedAtUpdate;
	}
	const meaningfulKeys = Object.keys(updateData);
	if (meaningfulKeys.length === 0) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`At least one writable ${kind} field is required`
		);
	}

	updateData.updated_at = new Date().toISOString();
	const { data, error } = await context.admin
		.from(config.table)
		.update(updateData)
		.eq('id', String(access.entity.id))
		.select('*')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error?.message || `Failed to update ${kind}`
		);
	}

	await logUpdateAsync(
		context.admin,
		access.project.id,
		kind,
		String(access.entity.id),
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		[config.resultKey]: serializeExternalEntity(
			kind,
			data as Record<string, unknown>,
			access.project.name
		),
		message: `Updated ontology ${kind} "${data[config.displayField] ?? access.entity.id}".`
	};
}

async function createOptionalParentEdges(
	context: ToolExecutionContext,
	project: OntologyProjectSummary,
	entityKind: ExternalLinkEntityKind,
	entityId: string,
	parents: Array<{ kind: string; id: string; rel?: string }>
): Promise<void> {
	for (const parent of parents) {
		await createEdge(
			context,
			{
				src_kind: parent.kind,
				src_id: parent.id,
				dst_kind: entityKind,
				dst_id: entityId,
				rel: parent.rel ?? 'contains',
				props: { origin: 'external_agent' }
			},
			project
		);
	}
}

async function createEdge(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	knownProject?: OntologyProjectSummary
): Promise<{
	created: number;
	edge: Record<string, unknown> | null;
	project: OntologyProjectSummary;
}> {
	const srcKind = normalizeEntityKind(args.src_kind, 'src_kind');
	const dstKind = normalizeEntityKind(args.dst_kind, 'dst_kind');
	const relInput = requireTrimmedString(args.rel, 'rel') ?? '';
	const props = normalizeProps(args.props, 'props') ?? {};
	const src = await loadEntityForAccess(context, srcKind, args.src_id, 'write');
	const dst = await loadEntityForAccess(context, dstKind, args.dst_id, 'write');
	const srcProjectId = resolveEntityProjectId(src);
	const dstProjectId = resolveEntityProjectId(dst);

	if (srcProjectId !== dstProjectId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Cross-project edges are not allowed'
		);
	}
	if (knownProject && knownProject.id !== srcProjectId) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			'Edge project does not match the expected project'
		);
	}

	const normalized =
		relInput === TASK_DOCUMENT_REL
			? {
					src_kind: srcKind as EntityKind,
					src_id: String(src.entity.id),
					dst_kind: dstKind as EntityKind,
					dst_id: String(dst.entity.id),
					rel: TASK_DOCUMENT_REL,
					props
				}
			: (() => {
					const resolved = resolveEdgeRelationship({
						srcKind: srcKind as EntityKind,
						dstKind: dstKind as EntityKind,
						rel: relInput
					});
					const resolvedRel = resolved.rel;
					if (!resolvedRel || !VALID_RELS.includes(resolvedRel)) {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							`Invalid relationship: ${relInput}`
						);
					}

					const normalizedEdge = normalizeEdgeDirection({
						src_kind: srcKind,
						src_id: String(src.entity.id),
						dst_kind: dstKind,
						dst_id: String(dst.entity.id),
						rel: resolvedRel,
						props: {
							...props,
							...(resolved.original_rel && props.original_rel === undefined
								? { original_rel: resolved.original_rel }
								: {})
						}
					});
					if (!normalizedEdge) {
						throw new ExternalToolGatewayError(
							'VALIDATION_ERROR',
							`Invalid relationship: ${relInput}`
						);
					}
					return normalizedEdge;
				})();

	const { data: existing, error: existingError } = await context.admin
		.from('onto_edges')
		.select('id, src_kind, src_id, dst_kind, dst_id, rel, props, project_id, created_at')
		.eq('src_id', normalized.src_id)
		.eq('dst_id', normalized.dst_id)
		.eq('rel', normalized.rel)
		.maybeSingle();
	if (existingError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			existingError.message || 'Failed to check existing edge'
		);
	}
	if (existing) {
		return {
			created: 0,
			edge: existing as Record<string, unknown>,
			project: knownProject ?? src.project
		};
	}

	const { data, error } = await context.admin
		.from('onto_edges')
		.insert({
			project_id: srcProjectId,
			src_kind: normalized.src_kind,
			src_id: normalized.src_id,
			dst_kind: normalized.dst_kind,
			dst_id: normalized.dst_id,
			rel: normalized.rel,
			props: normalized.props
		})
		.select('id, src_kind, src_id, dst_kind, dst_id, rel, props, project_id, created_at')
		.single();

	if (error || !data) {
		throw new ExternalToolGatewayError('INTERNAL', error?.message || 'Failed to create edge');
	}

	await logCreateAsync(
		context.admin,
		srcProjectId,
		'edge',
		String(data.id),
		{ src_kind: data.src_kind, dst_kind: data.dst_kind, rel: data.rel },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		created: 1,
		edge: data as Record<string, unknown>,
		project: knownProject ?? src.project
	};
}

async function linkOntoEntities(context: ToolExecutionContext, args: Record<string, unknown>) {
	const result = await createEdge(context, args);
	return {
		created: result.created,
		edge: result.edge,
		message:
			result.created > 0 ? 'Linked entities successfully.' : 'Entities were already linked.'
	};
}

async function unlinkOntoEdge(context: ToolExecutionContext, args: Record<string, unknown>) {
	const edgeId = assertValidId(args.edge_id, 'edge_id');
	const { data: edge, error: edgeError } = await context.admin
		.from('onto_edges')
		.select('*')
		.eq('id', edgeId)
		.maybeSingle();

	if (edgeError) {
		throw new ExternalToolGatewayError('INTERNAL', edgeError.message || 'Failed to load edge');
	}
	if (!edge) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Edge not found');
	}

	const visible = await loadVisibleProjects(context);
	const project = assertVisibleEntityProject(visible.projectMap, edge.project_id);
	assertProjectWriteAccess(project);

	const { error: deleteError } = await context.admin.from('onto_edges').delete().eq('id', edgeId);
	if (deleteError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			deleteError.message || 'Failed to delete edge'
		);
	}

	await logUpdateAsync(
		context.admin,
		project.id,
		'edge',
		edgeId,
		edge as Record<string, unknown>,
		{ deleted: true },
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		deleted: true,
		edge_id: edgeId,
		edge,
		message: 'Unlinked entities successfully.'
	};
}

async function createTaskDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskAccess = await loadCoreEntityForAccess(context, 'task', args.task_id, 'write');
	const actorId = await ensureActorId(context.admin, context.userId);
	let document: Record<string, unknown>;

	if (args.document_id !== undefined) {
		const documentAccess = await loadCoreEntityForAccess(
			context,
			'document',
			args.document_id,
			'write'
		);
		if (documentAccess.project.id !== taskAccess.project.id) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				'Document must belong to the same project as the task'
			);
		}
		document = documentAccess.entity;
	} else {
		const rawContent =
			typeof args.content === 'string'
				? args.content
				: typeof args.body_markdown === 'string'
					? args.body_markdown
					: null;
		const normalizedContent = normalizeMarkdownInput(rawContent);
		const title =
			typeof args.title === 'string' && args.title.trim()
				? args.title.trim()
				: `${taskAccess.entity.title ?? 'Task'} Document`;
		const stateInput =
			args.state_key === undefined
				? undefined
				: requireTrimmedString(args.state_key, 'state_key');
		const stateKey =
			stateInput === undefined ? 'draft' : normalizeDocumentStateInput(stateInput);
		if (!stateKey) {
			throw new ExternalToolGatewayError(
				'VALIDATION_ERROR',
				`state_key must be one of: ${DOCUMENT_STATES.join(', ')}`
			);
		}
		const props = normalizeProps(args.props, 'props') ?? {};
		const { data, error } = await context.admin
			.from('onto_documents')
			.insert({
				project_id: taskAccess.project.id,
				title,
				type_key:
					typeof args.type_key === 'string' && args.type_key.trim()
						? args.type_key.trim()
						: 'document.task.scratch',
				state_key: stateKey,
				content: normalizedContent,
				description:
					normalizeOptionalText(args.description, 'description', {
						allowNull: true
					}) ?? null,
				props: {
					...props,
					...(normalizedContent ? { body_markdown: normalizedContent } : {})
				},
				created_by: actorId
			})
			.select('*')
			.single();

		if (error || !data) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error?.message || 'Failed to create task document'
			);
		}
		document = data as Record<string, unknown>;
		try {
			await createOrMergeDocumentVersion({
				supabase: context.admin,
				documentId: String(document.id),
				actorId,
				snapshot: toDocumentSnapshot(document),
				changeSource: 'api'
			});
		} catch (versionError) {
			console.warn(
				'[External Tool Gateway] Failed to record task document version:',
				versionError
			);
		}
		await logCreateAsync(
			context.admin,
			taskAccess.project.id,
			'document',
			String(document.id),
			{
				title: document.title,
				type_key: document.type_key,
				state_key: document.state_key
			},
			context.userId,
			'agent_call',
			undefined,
			getExternalAgentActivityContext(context)
		);
	}

	const role =
		typeof args.role === 'string' && args.role.trim() ? args.role.trim() : 'deliverable';
	const edgeResult = await createEdge(
		context,
		{
			src_kind: 'task',
			src_id: taskAccess.entity.id,
			dst_kind: 'document',
			dst_id: document.id,
			rel: TASK_DOCUMENT_REL,
			props: {
				role,
				origin_task_id: taskAccess.entity.id,
				created_at: new Date().toISOString(),
				created_by: actorId
			}
		},
		taskAccess.project
	);

	return {
		document: serializeExternalEntity('document', document, taskAccess.project.name),
		edge: edgeResult.edge,
		message: `Linked document "${document.title ?? 'Document'}" to task.`
	};
}

async function moveDocumentInTree(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	assertProjectWriteAccess(project);
	const documentId = assertValidId(args.document_id, 'document_id');
	const { data: document, error: documentError } = await context.admin
		.from('onto_documents')
		.select('id, project_id')
		.eq('id', documentId)
		.eq('project_id', project.id)
		.is('archived_at', null)
		.maybeSingle();

	if (documentError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			documentError.message || 'Failed to load document'
		);
	}
	if (!document) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const newParentId = normalizeOptionalUuid(
		args.new_parent_id ?? args.parent_id,
		'new_parent_id'
	);
	if (newParentId) {
		const { data: parent, error: parentError } = await context.admin
			.from('onto_documents')
			.select('id')
			.eq('id', newParentId)
			.eq('project_id', project.id)
			.is('archived_at', null)
			.maybeSingle();
		if (parentError) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				parentError.message || 'Failed to load parent document'
			);
		}
		if (!parent) {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Parent document not found');
		}
	}
	const position =
		normalizeDocumentPosition(args.new_position ?? args.position, 'new_position') ?? 0;
	const actorId = await ensureActorId(context.admin, context.userId);
	const structure = await moveDocument(
		context.admin,
		project.id,
		documentId,
		{
			newParentId: newParentId ?? null,
			newPosition: position
		},
		actorId
	);
	await logUpdateAsync(
		context.admin,
		project.id,
		'document',
		documentId,
		{ tree_move: true },
		{
			tree_move: true,
			new_parent_id: newParentId ?? null,
			new_position: position
		},
		context.userId,
		'agent_call',
		undefined,
		getExternalAgentActivityContext(context)
	);

	return {
		project_id: project.id,
		document_id: documentId,
		structure,
		message: `Moved document ${documentId} in doc structure.`
	};
}

async function listDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	const offset = normalizeOffset(args.offset);
	const typeKey = normalizeEntityTypeFilter(args.type_key, 'document');
	const stateKey = normalizeEntityStateFilter(args.state_key, 'document');
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			documents: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	let query = context.admin
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, state_key, archived_at, created_at, updated_at',
			{
				count: 'exact'
			}
		)
		.in('project_id', projectIds)
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	query = applyArchivedReadFilter(query, args);

	if (typeKey) {
		query = query.eq('type_key', typeKey);
	}

	if (stateKey) {
		query = query.eq('state_key', stateKey);
	}

	const { data, error, count } = await query;
	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to list documents');
	}

	const documents = (data ?? []).map((document: Record<string, unknown>) => ({
		...document,
		project_name: visible.projectMap.get(String(document.project_id))?.name ?? null
	}));

	return {
		documents,
		total: count ?? documents.length,
		pagination: buildPaginationForRows(
			offset,
			limit,
			count ?? documents.length,
			documents.length
		)
	};
}

async function searchDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['document']);
}

async function getDocument(context: ToolExecutionContext, args: Record<string, unknown>) {
	const documentId = args.document_id;
	if (typeof documentId !== 'string' || !isValidUUID(documentId)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'document_id must be a valid UUID');
	}

	const maxChars = normalizeMaxChars(args.max_chars);
	const visible = await loadVisibleProjects(context);

	if (visible.projects.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	let query = context.admin
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, content, state_key, archived_at, created_at, updated_at'
		)
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		);
	query = applyArchivedReadFilter(query, args);

	const { data, error } = await query.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError('INTERNAL', error.message || 'Failed to load document');
	}

	if (!data) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, data.project_id);
	const body = truncateText(data.content, maxChars);

	return {
		document: {
			...data,
			project_name: project.name,
			content: body.content,
			content_truncated: body.truncated
		}
	};
}

async function getProjectGraph(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const graph = await loadProjectGraphData(context.admin, project.id, {
		excludeCompletedTasks: true
	});

	return {
		graph: serializeProjectGraphData(graph as unknown as Record<string, unknown>),
		metadata: {
			projectId: project.id,
			queryPattern: 'project-graph-loader',
			generatedAt: new Date().toISOString()
		}
	};
}

async function getDocumentTree(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const includeDocuments = args.include_documents === true;
	const includeContent = includeDocuments && args.include_content === true;
	const tree = await getDocTree(context.admin, project.id, {
		includeDocuments,
		includeContent
	});

	const countNodes = (nodes: any[]): number =>
		(nodes ?? []).reduce(
			(total, node) =>
				total + 1 + countNodes(Array.isArray(node.children) ? node.children : []),
			0
		);

	return {
		...serializeDocumentTree(tree as unknown as Record<string, unknown>),
		message: `Document tree loaded with ${countNodes(tree.structure.root)} nodes.`
	};
}

async function getDocumentPath(context: ToolExecutionContext, args: Record<string, unknown>) {
	const documentId = assertValidId(args.document_id, 'document_id');
	const visible = await loadVisibleProjects(context);
	let projectId: string | null = null;
	let fallbackTitle = 'Untitled';

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectId = project.id;
	} else {
		const projectIds = getProjectIdsOrThrow(visible, 'Document');
		const { data, error } = await context.admin
			.from('onto_documents')
			.select('id, project_id, title')
			.eq('id', documentId)
			.in('project_id', projectIds)
			.is('archived_at', null)
			.maybeSingle();

		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to load document'
			);
		}
		if (!data) {
			throw new ExternalToolGatewayError('NOT_FOUND', 'Document not found');
		}

		projectId = String(data.project_id);
		fallbackTitle = typeof data.title === 'string' ? data.title : fallbackTitle;
	}

	const tree = await getDocTree(context.admin, projectId, {
		includeDocuments: true,
		includeContent: false
	});
	const pathIds = getNodePath(tree.structure.root, documentId);
	const path = pathIds.map((id) => ({
		id,
		title: tree.documents[id]?.title ?? (id === documentId ? fallbackTitle : 'Untitled')
	}));

	return {
		path,
		document_id: documentId,
		project_id: projectId,
		message:
			path.length > 0
				? `Document path: ${path.map((item) => item.title).join(' > ')}`
				: `Document "${fallbackTitle}" is not placed in the tree.`
	};
}

async function listTaskDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	const taskAccess = await loadCoreEntityForAccess(context, 'task', args.task_id, 'read');
	const { data: edges, error: edgeError } = await context.admin
		.from('onto_edges')
		.select('*')
		.eq('src_kind', 'task')
		.eq('src_id', String(taskAccess.entity.id))
		.eq('rel', TASK_DOCUMENT_REL)
		.order('created_at', { ascending: true });

	if (edgeError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			edgeError.message || 'Failed to fetch task document links'
		);
	}

	const edgeRows = (edges ?? []) as Array<Record<string, unknown>>;
	if (edgeRows.length === 0) {
		return {
			documents: [],
			scratch_pad: null,
			message: 'Found 0 documents linked to this task.'
		};
	}

	const documentIds = edgeRows
		.map((edge) => edge.dst_id)
		.filter((id): id is string => typeof id === 'string' && isValidUUID(id));
	const { data: documents, error: documentError } = await context.admin
		.from('onto_documents')
		.select('*')
		.in('id', documentIds)
		.eq('project_id', taskAccess.project.id)
		.is('archived_at', null);

	if (documentError) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			documentError.message || 'Failed to fetch task documents'
		);
	}

	const documentMap = new Map(
		((documents ?? []) as Array<Record<string, unknown>>).map((document) => [
			String(document.id),
			document
		])
	);
	const combined = edgeRows
		.map((edge) => {
			const document = documentMap.get(String(edge.dst_id));
			return document
				? {
						document: serializeExternalEntity(
							'document',
							document,
							taskAccess.project.name
						),
						edge
					}
				: null;
		})
		.filter(
			(item): item is { document: Record<string, unknown>; edge: Record<string, unknown> } =>
				Boolean(item)
		);
	const scratchPad =
		combined.find(
			(item) =>
				item.edge.props &&
				typeof item.edge.props === 'object' &&
				!Array.isArray(item.edge.props) &&
				(item.edge.props as Record<string, unknown>).role === 'scratch'
		) ?? null;

	return {
		documents: combined,
		scratch_pad: scratchPad,
		message: `Found ${combined.length} documents linked to this task.`
	};
}

async function resolveVisibleEntityById(
	context: ToolExecutionContext,
	entityId: unknown,
	access: 'read' | 'write'
): Promise<EntityAccessResult> {
	const id = assertValidId(entityId, 'entity_id');
	const kinds: ExternalLinkEntityKind[] = [
		'project',
		'task',
		'plan',
		'goal',
		'milestone',
		'document',
		'risk',
		'event',
		'requirement',
		'metric',
		'source'
	];
	let lastError: unknown = null;

	for (const kind of kinds) {
		try {
			return await loadEntityForAccess(context, kind, id, access);
		} catch (error) {
			if (error instanceof ExternalToolGatewayError && error.code === 'NOT_FOUND') {
				lastError = error;
				continue;
			}
			throw error;
		}
	}

	throw lastError instanceof ExternalToolGatewayError
		? new ExternalToolGatewayError('NOT_FOUND', 'Entity not found')
		: new ExternalToolGatewayError('NOT_FOUND', 'Entity not found');
}

async function getEntityRelationships(
	context: ToolExecutionContext,
	args: Record<string, unknown>
) {
	const direction = normalizeRelationshipDirection(args.direction);
	const entity = await resolveVisibleEntityById(context, args.entity_id, 'read');
	const relationships: Array<Record<string, unknown>> = [];

	if (direction === 'outgoing' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select('*')
			.eq('project_id', entity.project.id)
			.eq('src_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch outgoing relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'outgoing'
			}))
		);
	}

	if (direction === 'incoming' || direction === 'both') {
		const { data, error } = await context.admin
			.from('onto_edges')
			.select('*')
			.eq('project_id', entity.project.id)
			.eq('dst_id', String(entity.entity.id))
			.limit(50);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || 'Failed to fetch incoming relationships'
			);
		}
		relationships.push(
			...((data ?? []) as Array<Record<string, unknown>>).map((edge) => ({
				...edge,
				direction: 'incoming'
			}))
		);
	}

	return {
		relationships,
		message: `Found ${relationships.length} relationships for entity ${String(entity.entity.id)}.`
	};
}

function pluralKind(kind: string): string {
	if (kind === 'milestone') return 'milestones';
	if (kind === 'risk') return 'risks';
	return `${kind}s`;
}

type LinkedEntityRef = {
	kind: ExternalLinkEntityKind;
	id: string;
	edge: Record<string, unknown>;
};

async function getLinkedEntities(context: ToolExecutionContext, args: Record<string, unknown>) {
	const entityKind = normalizeEntityKind(args.entity_kind, 'entity_kind');
	const source = await loadEntityForAccess(context, entityKind, args.entity_id, 'read');
	const filterKind =
		typeof args.filter_kind === 'string' && args.filter_kind !== 'all'
			? normalizeEntityKind(args.filter_kind, 'filter_kind')
			: null;

	const { relationships } = await getEntityRelationships(context, {
		entity_id: source.entity.id,
		entity_kind: entityKind,
		direction: 'both'
	});

	const linkedRefs = (relationships as Array<Record<string, unknown>>)
		.map<LinkedEntityRef | null>((edge) => {
			const isOutgoing = edge.src_id === source.entity.id;
			const kind = String(isOutgoing ? edge.dst_kind : edge.src_kind);
			const id = String(isOutgoing ? edge.dst_id : edge.src_id);
			if (filterKind && kind !== filterKind) return null;
			if (!Object.prototype.hasOwnProperty.call(LINK_ENTITY_TABLES, kind)) return null;
			return {
				kind: kind as ExternalLinkEntityKind,
				id,
				edge
			};
		})
		.filter((ref): ref is LinkedEntityRef => ref !== null && isValidUUID(ref.id));

	const linkedByKind: Record<string, LinkedEntityRef[]> = {};
	for (const ref of linkedRefs) {
		if (!linkedByKind[ref.kind]) linkedByKind[ref.kind] = [];
		linkedByKind[ref.kind]!.push(ref);
	}

	const linkedEntities: Record<string, Array<Record<string, unknown>>> = {};
	for (const [kind, refs] of Object.entries(linkedByKind)) {
		const table = LINK_ENTITY_TABLES[kind as ExternalLinkEntityKind];
		const ids = refs.map((ref) => ref.id);
		const { data, error } = await context.admin.from(table).select('*').in('id', ids);
		if (error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				error.message || `Failed to fetch linked ${kind} entities`
			);
		}
		const rowsById = new Map(
			((data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
		);
		linkedEntities[pluralKind(kind)] = refs
			.map<Record<string, unknown> | null>((ref) => {
				const row = rowsById.get(ref.id);
				if (!row) return null;
				return {
					...serializeExternalEntity(kind as ExternalLinkEntityKind, row),
					edge_id: ref.edge.id,
					edge_rel: ref.edge.rel,
					edge_direction: ref.edge.direction
				};
			})
			.filter((row): row is Record<string, unknown> => Boolean(row));
	}

	const counts = Object.fromEntries(
		Object.entries(linkedEntities).map(([kind, rows]) => [kind, rows.length])
	);
	const total = Object.values(counts).reduce(
		(sum, count) => sum + (typeof count === 'number' ? count : 0),
		0
	);

	return {
		linked_entities: linkedEntities,
		counts: {
			...counts,
			total
		},
		summary: `${total} linked entities`,
		message: `Found ${total} linked entities for ${entityKind} ${String(source.entity.id)}.`
	};
}

async function searchOntology(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, [
		'task',
		'plan',
		'goal',
		'document',
		'milestone',
		'risk'
	]);
}

async function searchAssets(context: ToolExecutionContext, args: Record<string, unknown>) {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const ocrStatus = normalizeOptionalAssetOcrStatus(args.ocr_status);
	const includeTextPreview = args.include_text_preview === true;
	const visible = await loadVisibleProjects(context);
	let projectIds = getProjectIdsForVisibleContext(visible);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			query: query || null,
			assets: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0),
			access: {
				media: 'metadata_and_bounded_ocr_only',
				raw_pixels: false,
				signed_urls: false
			}
		};
	}

	let dbQuery = context.admin
		.from('onto_assets')
		.select(EXTERNAL_ASSET_SELECT, { count: 'exact' })
		.in('project_id', projectIds)
		.eq('kind', 'image')
		.is('deleted_at', null);

	if (ocrStatus) {
		dbQuery = dbQuery.eq('ocr_status', ocrStatus);
	}

	const filter = buildSearchFilter(query, [
		'original_filename',
		'caption',
		'alt_text',
		'extraction_summary',
		'extracted_text'
	]);
	if (filter) {
		dbQuery = dbQuery.or(filter);
	}

	const { data, error, count } = await dbQuery
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to search image assets'
		);
	}

	const rows = Array.isArray(data)
		? data.filter(
				(row): row is Record<string, unknown> =>
					Boolean(row) && typeof row === 'object' && !Array.isArray(row)
			)
		: [];
	const assets = rows.map((row) =>
		serializeExternalAsset(row, visible.projectMap, { includeTextPreview })
	);
	const total = typeof count === 'number' ? count : assets.length;

	return {
		query: query || null,
		assets,
		total,
		pagination: buildPaginationForRows(offset, limit, total, assets.length),
		access: {
			media: 'metadata_and_bounded_ocr_only',
			raw_pixels: false,
			signed_urls: false
		}
	};
}

async function getAsset(context: ToolExecutionContext, args: Record<string, unknown>) {
	const assetId = assertValidId(args.asset_id, 'asset_id');
	const includeTextPreview = args.include_text_preview !== false;
	const visible = await loadVisibleProjects(context);
	const projectIds = getProjectIdsForVisibleContext(visible);

	if (projectIds.length === 0) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Asset not found');
	}

	const { data, error } = await context.admin
		.from('onto_assets')
		.select(EXTERNAL_ASSET_SELECT)
		.eq('id', assetId)
		.in('project_id', projectIds)
		.eq('kind', 'image')
		.is('deleted_at', null)
		.maybeSingle();

	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || 'Failed to load image asset'
		);
	}

	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new ExternalToolGatewayError('NOT_FOUND', 'Asset not found');
	}

	const projectId = (data as Record<string, unknown>).project_id;
	assertVisibleEntityProject(visible.projectMap, projectId);

	return {
		asset: serializeExternalAsset(data as Record<string, unknown>, visible.projectMap, {
			includeTextPreview
		}),
		access: {
			media: 'metadata_and_bounded_ocr_only',
			raw_pixels: false,
			signed_urls: false
		}
	};
}

async function searchEntitiesByType(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	allowedTypes: Array<'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk'>
) {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const visible = await loadVisibleProjects(context);
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			query,
			results: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	const requestedTypes = Array.isArray(args.types)
		? args.types.filter(
				(value): value is 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk' =>
					typeof value === 'string' &&
					allowedTypes.includes(
						value as 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk'
					)
			)
		: allowedTypes;
	const activeTypes = requestedTypes.length > 0 ? requestedTypes : allowedTypes;

	if (activeTypes.length === 1) {
		const result = await searchEntityKind({
			context,
			args,
			kind: activeTypes[0]!,
			query,
			projectIds,
			projectMap: visible.projectMap,
			offset,
			limit,
			strictFilters: true
		});
		return {
			query,
			results: result.results,
			total: result.total,
			pagination: buildPaginationForRows(offset, limit, result.total, result.results.length)
		};
	}

	const fetchLimit = offset + limit;
	const perKindResults = await Promise.all(
		activeTypes.map((kind) =>
			searchEntityKind({
				context,
				args,
				kind,
				query,
				projectIds,
				projectMap: visible.projectMap,
				offset: 0,
				limit: fetchLimit,
				strictFilters: false
			})
		)
	);
	const total = perKindResults.reduce((sum, result) => sum + result.total, 0);
	const merged = perKindResults
		.flatMap((result) => result.results)
		.sort(
			(a, b) =>
				Date.parse(String(b.updated_at ?? '')) - Date.parse(String(a.updated_at ?? ''))
		);
	const results = merged.slice(offset, offset + limit);

	return {
		query,
		results,
		total,
		pagination: buildPaginationForRows(offset, limit, total, results.length)
	};
}

type SearchKind = 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk';

const SEARCH_CONFIG: Record<
	SearchKind,
	{
		table: string;
		select: string;
		searchFields: string[];
		titleField: 'title' | 'name';
		snippetField?: 'description' | 'content';
	}
> = {
	task: {
		table: 'onto_tasks',
		select: 'id, project_id, title, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'description'],
		titleField: 'title',
		snippetField: 'description'
	},
	plan: {
		table: 'onto_plans',
		select: 'id, project_id, name, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['name', 'description'],
		titleField: 'name',
		snippetField: 'description'
	},
	goal: {
		table: 'onto_goals',
		select: 'id, project_id, name, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['name', 'description'],
		titleField: 'name',
		snippetField: 'description'
	},
	document: {
		table: 'onto_documents',
		select: 'id, project_id, title, description, content, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'content', 'description'],
		titleField: 'title',
		snippetField: 'content'
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, project_id, title, description, type_key, state_key, due_at, archived_at, updated_at',
		searchFields: ['title', 'description'],
		titleField: 'title',
		snippetField: 'description'
	},
	risk: {
		table: 'onto_risks',
		select: 'id, project_id, title, content, impact, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'content'],
		titleField: 'title',
		snippetField: 'content'
	}
};

function normalizeSearchStateFilter(
	value: unknown,
	kind: SearchKind,
	strict: boolean
): string | null | undefined {
	try {
		return normalizeEntityStateFilter(value, kind);
	} catch (error) {
		if (strict) throw error;
		return null;
	}
}

function normalizeSearchTypeFilter(
	value: unknown,
	kind: SearchKind,
	strict: boolean
): string | null | undefined {
	try {
		return normalizeEntityTypeFilter(value, kind);
	} catch (error) {
		if (strict) throw error;
		return null;
	}
}

async function searchEntityKind(params: {
	context: ToolExecutionContext;
	args: Record<string, unknown>;
	kind: SearchKind;
	query: string;
	projectIds: string[];
	projectMap: Map<string, OntologyProjectSummary>;
	offset: number;
	limit: number;
	strictFilters: boolean;
}): Promise<{ results: Array<Record<string, unknown>>; total: number }> {
	const { context, args, kind, query, projectIds, projectMap, offset, limit, strictFilters } =
		params;
	const config = SEARCH_CONFIG[kind];
	const stateKey = normalizeSearchStateFilter(args.state_key, kind, strictFilters);
	const typeKey = normalizeSearchTypeFilter(args.type_key, kind, strictFilters);
	const impact =
		kind === 'risk'
			? (() => {
					try {
						return normalizeRiskImpactFilter(args.impact);
					} catch (error) {
						if (strictFilters) throw error;
						return null;
					}
				})()
			: undefined;

	if (stateKey === null || typeKey === null || impact === null) {
		return { results: [], total: 0 };
	}
	if (args.impact !== undefined && kind !== 'risk' && strictFilters) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'impact only applies to risks');
	}

	let dbQuery = context.admin
		.from(config.table)
		.select(config.select, { count: 'exact' })
		.in('project_id', projectIds)
		.or(buildSearchFilter(query, config.searchFields))
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	dbQuery = applyArchivedReadFilter(dbQuery, args);

	if (stateKey) {
		dbQuery = dbQuery.eq('state_key', stateKey);
	}
	if (typeKey) {
		dbQuery = dbQuery.eq('type_key', typeKey);
	}
	if (kind === 'risk' && impact) {
		dbQuery = dbQuery.eq('impact', impact);
	}

	const { data, error, count } = await dbQuery;
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || `Failed to search ${kind}s`
		);
	}

	const results = ((data ?? []) as Array<Record<string, unknown>>).map((item) => {
		const title = item[config.titleField] ?? null;
		const snippetSource =
			config.snippetField === 'content'
				? typeof item.content === 'string'
					? item.content.replace(/\s+/g, ' ').trim()
					: typeof item.description === 'string'
						? item.description
						: ''
				: item[config.snippetField ?? 'description'];
		const snippet =
			typeof snippetSource === 'string' ? truncateText(snippetSource, 220).content : null;
		return {
			type: kind,
			id: item.id,
			project_id: item.project_id,
			project_name: projectMap.get(String(item.project_id))?.name ?? null,
			title,
			snippet,
			type_key: item.type_key,
			state_key: item.state_key,
			archived_at: item.archived_at ?? null,
			...(kind === 'milestone' ? { due_at: item.due_at } : {}),
			...(kind === 'risk' ? { impact: item.impact } : {}),
			updated_at: item.updated_at
		};
	});

	return {
		results,
		total: count ?? results.length
	};
}

export function buildExternalGatewayRegistry(
	scope: AgentCallScope,
	registryOps: Record<string, RegistryOp>,
	registryVersion: string
): ExternalGatewayRegistry {
	const allowedOps = (scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode)).filter((op) =>
		scope.mode === 'read_write' ? true : !isWriteOp(op)
	);
	const ops: Record<string, ExternalGatewayRegistryEntry> = {};

	for (const op of allowedOps) {
		const entry = registryOps[op] ?? EXTERNAL_CUSTOM_OPS[op];
		const handler = EXTERNAL_OP_HANDLERS[op];
		if (!entry || !handler) continue;
		const parametersSchema =
			EXTERNAL_WRITE_OP_SCHEMAS[op] ??
			withExternalArchiveUpdateParameter(op, entry.parameters_schema);
		ops[op] = {
			...entry,
			parameters_schema: parametersSchema,
			required_scope_mode: isWriteOp(op) ? 'read_write' : 'read_only',
			handler
		};
	}

	return {
		version: buildRegistryVersion(registryVersion, Object.keys(ops).sort()),
		ops
	};
}

function validateRequiredArgs(
	schema: Record<string, any>,
	args: Record<string, unknown>
): string[] {
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	return required.filter((field) => args[field] === undefined);
}

function validateUnexpectedArgs(
	schema: Record<string, any>,
	args: Record<string, unknown>
): string[] {
	if (schema.additionalProperties !== false) {
		return [];
	}

	const properties = (schema.properties ?? {}) as Record<string, unknown>;
	const allowed = new Set(Object.keys(properties));
	return Object.keys(args).filter((field) => !allowed.has(field));
}

function readGatewayArg(args: Record<string, unknown>, alias: string): unknown {
	if (Object.prototype.hasOwnProperty.call(args, alias)) {
		return args[alias];
	}

	if (!alias.includes('.')) {
		return undefined;
	}

	let current: unknown = args;
	for (const part of alias.split('.')) {
		if (!current || typeof current !== 'object' || Array.isArray(current)) {
			return undefined;
		}
		const record = current as Record<string, unknown>;
		if (!Object.prototype.hasOwnProperty.call(record, part)) {
			return undefined;
		}
		current = record[part];
	}
	return current;
}

function deleteFlatGatewayAliases(args: Record<string, unknown>, aliases: readonly string[]) {
	for (const alias of aliases) {
		if (!alias.includes('.')) {
			delete args[alias];
		}
	}
}

function mapGatewayArgAlias(
	args: Record<string, unknown>,
	target: string,
	aliases: readonly string[],
	options: { allowNonString?: boolean } = {}
) {
	if (args[target] === undefined) {
		for (const alias of aliases) {
			const value = readGatewayArg(args, alias);
			if (value === undefined) continue;
			if (!options.allowNonString && typeof value !== 'string') continue;
			args[target] = value;
			break;
		}
	}
	deleteFlatGatewayAliases(args, aliases);
}

function normalizeGatewayOpArgs(
	op: BuildosAgentAllowedOp,
	args: Record<string, unknown>
): Record<string, unknown> {
	if (op !== 'onto.edge.link') {
		return args;
	}

	const normalized = { ...args };
	mapGatewayArgAlias(normalized, 'src_kind', [
		'source_kind',
		'from_kind',
		'from.kind',
		'source.kind',
		'src.kind'
	]);
	mapGatewayArgAlias(normalized, 'src_id', [
		'source_id',
		'from_id',
		'from.id',
		'source.id',
		'src.id'
	]);
	mapGatewayArgAlias(normalized, 'dst_kind', [
		'target_kind',
		'tgt_kind',
		'to_kind',
		'to.kind',
		'target.kind',
		'tgt.kind',
		'dst.kind'
	]);
	mapGatewayArgAlias(normalized, 'dst_id', [
		'target_id',
		'tgt_id',
		'to_id',
		'to.id',
		'target.id',
		'tgt.id',
		'dst.id'
	]);
	mapGatewayArgAlias(normalized, 'rel', [
		'relationship',
		'relation',
		'relationship_type',
		'edge_type',
		'type'
	]);
	mapGatewayArgAlias(normalized, 'props', ['edge_props', 'metadata'], { allowNonString: true });
	return normalized;
}

export function buildExecError(
	requestedOp: string,
	code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL',
	message: string,
	helpPath?: string,
	details?: Record<string, unknown>
) {
	return {
		op: requestedOp,
		ok: false,
		error: {
			code,
			message,
			...(helpPath ? { help_path: helpPath } : {}),
			...(details ? { details } : {})
		}
	};
}

export async function executeGatewayOp(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
	registryOps: Record<string, RegistryOp>;
	registryVersion: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
}): Promise<Record<string, unknown>> {
	const registry = buildExternalGatewayRegistry(
		params.scope,
		params.registryOps,
		params.registryVersion
	);
	const input = params.arguments ?? {};
	const requestedOp = typeof input.op === 'string' ? input.op.trim() : '';

	if (!requestedOp) {
		return buildExecError('', 'VALIDATION_ERROR', 'Missing op', 'root');
	}

	const canonicalOp = normalizeGatewayOpName(requestedOp);
	const allowedOps = params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode);
	const entry = registry.ops[canonicalOp];
	if (!entry) {
		if (isSupportedOp(canonicalOp)) {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: 'op_outside_granted_scope',
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						requiredScopeMode: requiredScopeModeForOp(canonicalOp),
						allowedOps
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
			return buildExecError(
				requestedOp,
				'FORBIDDEN',
				`Op ${canonicalOp} is outside the granted BuildOS call scope`,
				canonicalOp,
				{
					granted_scope_mode: params.scope.mode,
					required_scope_mode: requiredScopeModeForOp(canonicalOp),
					allowed_ops: allowedOps
				}
			);
		}

		return buildExecError(requestedOp, 'NOT_FOUND', `Unknown op: ${requestedOp}`, 'root');
	}

	const rawOpArgs =
		input.args && typeof input.args === 'object' && !Array.isArray(input.args)
			? (input.args as Record<string, unknown>)
			: {};
	const opArgs = normalizeGatewayOpArgs(canonicalOp as BuildosAgentAllowedOp, rawOpArgs);
	const missingRequired = validateRequiredArgs(entry.parameters_schema, opArgs);
	if (missingRequired.length > 0) {
		return buildExecError(
			requestedOp,
			'VALIDATION_ERROR',
			`Missing required parameter${missingRequired.length === 1 ? '' : 's'}: ${missingRequired.join(', ')}`,
			canonicalOp
		);
	}

	const unexpectedArgs = validateUnexpectedArgs(entry.parameters_schema, opArgs);
	if (unexpectedArgs.length > 0) {
		return buildExecError(
			requestedOp,
			'VALIDATION_ERROR',
			`Unsupported parameter${unexpectedArgs.length === 1 ? '' : 's'}: ${unexpectedArgs.join(', ')}`,
			canonicalOp
		);
	}

	const warnings: string[] = [];
	if (canonicalOp !== requestedOp) {
		warnings.push(`Normalized legacy op "${requestedOp}" to "${canonicalOp}".`);
	}
	if (input.dry_run === true && !isWriteOp(canonicalOp)) {
		warnings.push('dry_run ignored for external read operations.');
	}
	if (
		typeof input.idempotency_key === 'string' &&
		input.idempotency_key.trim() &&
		!isWriteOp(canonicalOp)
	) {
		warnings.push('idempotency_key ignored for external read operations.');
	}

	if (input.dry_run === true && isWriteOp(canonicalOp)) {
		return buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result: {
				dry_run: true,
				op: canonicalOp,
				args: opArgs
			},
			warnings
		});
	}

	let executionContext: { callerId: string; callSessionId: string } | null = null;
	if (isWriteOp(canonicalOp)) {
		try {
			executionContext = ensureWriteExecutionContext(
				{
					admin: params.admin,
					userId: params.userId,
					callerId: params.callerId,
					callSessionId: params.callSessionId,
					scope: params.scope
				},
				canonicalOp
			);
		} catch (error) {
			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}
	const rawIdempotencyKey =
		typeof input.idempotency_key === 'string' ? input.idempotency_key.trim() : '';
	const idempotencyKey = rawIdempotencyKey.length > 0 ? rawIdempotencyKey : undefined;
	let executionId: string | null = null;

	if (isWriteOp(canonicalOp) && executionContext) {
		try {
			const reservation = await reserveWriteExecution({
				admin: params.admin,
				callSessionId: executionContext.callSessionId,
				callerId: executionContext.callerId,
				userId: params.userId,
				op: canonicalOp,
				args: opArgs,
				idempotencyKey,
				securityEventOptions: params.securityEventOptions
			});
			executionId = reservation.executionId;
		} catch (error) {
			if (error instanceof AgentCallWriteReplayError) {
				const replayedResponse = error.responsePayload;
				const replayedMeta =
					replayedResponse.meta &&
					typeof replayedResponse.meta === 'object' &&
					!Array.isArray(replayedResponse.meta)
						? (replayedResponse.meta as Record<string, unknown>)
						: {};

				return {
					...replayedResponse,
					meta: {
						...replayedMeta,
						replayed: true
					}
				};
			}

			if (error instanceof AgentCallWritePendingError) {
				return buildExecError(
					requestedOp,
					'CONFLICT',
					error.message,
					canonicalOp,
					idempotencyKey ? { idempotency_key: idempotencyKey } : undefined
				);
			}

			const normalized = normalizeGatewayError(error);
			return buildExecError(
				requestedOp,
				normalized.code,
				normalized.message,
				canonicalOp,
				normalized.details
			);
		}
	}

	const executionStartedAt = new Date().toISOString();

	try {
		const result = await entry.handler(
			{
				admin: params.admin,
				userId: params.userId,
				callerId: params.callerId,
				callSessionId: params.callSessionId,
				scope: params.scope,
				calendar: params.calendar,
				taskSync: params.taskSync
			},
			opArgs
		);
		const response = buildGatewaySuccessResponse({
			requestedOp,
			canonicalOp,
			result,
			warnings
		});

		if (isWriteOp(canonicalOp) && executionContext) {
			const entityMeta = extractWriteEntityMeta({ op: canonicalOp, result });
			try {
				await recordWriteExecutionSuccess({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					responsePayload: response,
					entityKind: entityMeta.entityKind,
					entityId: entityMeta.entityId,
					startedAt: executionStartedAt,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write success:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			const auditPayload = buildToolExecutionAuditPayload({
				response,
				canonicalOp: canonicalOp as BuildosAgentAllowedOp,
				result
			});
			try {
				await recordToolExecutionSuccess({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					responsePayload: auditPayload.responsePayload,
					entityKind: auditPayload.entityKind,
					entityId: auditPayload.entityId,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool success:', auditError);
			}
		}

		return response;
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		if (normalized.code === 'FORBIDDEN') {
			await logSecurityEvent(
				{
					eventType: 'agent.tool.denied',
					category: 'agent',
					outcome: 'denied',
					severity: 'medium',
					actorType: 'external_agent',
					actorUserId: params.userId,
					externalAgentCallerId: params.callerId ?? null,
					sessionId: params.callSessionId ?? null,
					reason: normalized.message,
					metadata: {
						requestedOp,
						canonicalOp,
						grantedScopeMode: params.scope.mode,
						errorCode: normalized.code,
						details: normalized.details ?? null
					}
				},
				{ ...(params.securityEventOptions ?? {}), supabase: params.admin }
			);
		}
		const response = buildExecError(
			requestedOp,
			normalized.code,
			normalized.message,
			canonicalOp,
			normalized.details
		);

		if (isWriteOp(canonicalOp) && executionContext) {
			try {
				await recordWriteExecutionFailure({
					admin: params.admin,
					executionId,
					callSessionId: executionContext.callSessionId,
					callerId: executionContext.callerId,
					userId: params.userId,
					op: canonicalOp,
					idempotencyKey,
					args: opArgs,
					errorPayload: response.error,
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write failure:',
					auditError
				);
			}
		} else if (!isWriteOp(canonicalOp)) {
			try {
				await recordToolExecutionFailure({
					admin: params.admin,
					callSessionId: params.callSessionId,
					callerId: params.callerId,
					userId: params.userId,
					op: canonicalOp,
					args: opArgs,
					errorPayload: response.error,
					entityKind: entityKindFromGatewayOp(canonicalOp) ?? undefined,
					startedAt: executionStartedAt
				});
			} catch (auditError) {
				console.error('[External Tool Gateway] Failed to record tool failure:', auditError);
			}
		}

		return response;
	}
}

// ---------------------------------------------------------------------------
// Worker write-op execution (internal Agent Runs)
// ---------------------------------------------------------------------------

/** Calendar read ops that can run in a worker only when a CalendarPort is present. */
export const AGENT_OP_GATEWAY_CALENDAR_READ_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isReadOp(op) && op.startsWith('cal.'))
);

/** Calendar write ops that can run in a worker only when a CalendarPort is present. */
export const AGENT_OP_GATEWAY_CALENDAR_WRITE_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isWriteOp(op) && op.startsWith('cal.'))
);

/**
 * Non-calendar write ops that have a gateway handler — the set a worker Agent
 * Run can stage+commit without a CalendarPort. Calendar (`cal.*`) write ops
 * stay separate so the runner can advertise them only when the runtime has a
 * real calendar capability.
 */
export const AGENT_OP_GATEWAY_WRITE_CATALOG: readonly string[] = Object.freeze(
	Object.keys(EXTERNAL_OP_HANDLERS).filter((op) => isWriteOp(op) && !op.startsWith('cal.'))
);

export interface GatewayWriteOpResult {
	ok: boolean;
	data?: Record<string, unknown>;
	entityKind?: string | null;
	entityId?: string | null;
	error?: {
		code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
		message: string;
		details?: Record<string, unknown>;
	};
}

export interface GatewayReadOpResult {
	ok: boolean;
	data?: Record<string, unknown>;
	error?: {
		code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'CONFLICT' | 'INTERNAL';
		message: string;
		details?: Record<string, unknown>;
	};
}

/**
 * Execute a single BuildOS read op through the carved gateway handler map for
 * INTERNAL Agent Runs. This is primarily used for calendar reads, whose logic is
 * already in the gateway behind CalendarPort and should not be duplicated in the
 * worker.
 */
export async function runGatewayReadOp(params: {
	admin: any;
	userId: string;
	scope: AgentCallScope;
	op: string;
	args?: Record<string, unknown>;
	callSessionId?: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
}): Promise<GatewayReadOpResult> {
	const canonicalOp = normalizeGatewayOpName(
		typeof params.op === 'string' ? params.op.trim() : ''
	) as BuildosAgentAllowedOp;
	const handler = EXTERNAL_OP_HANDLERS[canonicalOp];
	if (!handler || !isReadOp(canonicalOp)) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: `No worker read handler for op: ${canonicalOp}` }
		};
	}

	const args =
		params.args && typeof params.args === 'object' && !Array.isArray(params.args)
			? params.args
			: {};

	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		callSessionId: params.callSessionId,
		scope: params.scope,
		calendar: params.calendar,
		taskSync: params.taskSync
	};

	try {
		const result = await handler(context, args);
		return { ok: true, data: result };
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				details: normalized.details
			}
		};
	}
}

/**
 * Execute a single BuildOS write op for an INTERNAL Agent Run.
 *
 * Unlike executeGatewayOp (the external-agent path, which carries
 * agent_call_tool_executions idempotency/replay audit keyed by an
 * external_agent_caller_id + agent_call_session), this is a lean path for the
 * worker runner: validate args, invoke the handler directly, return the entity
 * meta. The runner records its own agent_tool_executions telemetry, so there is
 * no external write-audit and no idempotency here. The caller is responsible for
 * scope/allowed-op enforcement (the worker's executeAgentOp does this before
 * dispatching); the handler additionally enforces project-level write access.
 *
 * Calendar/task-sync remain optional ports; when absent the task handlers skip
 * calendar sync (acceptable for worker runs until Wave 5).
 */
export async function runGatewayWriteOp(params: {
	// `any` matches ToolExecutionContext.admin (the whole handler map is typed
	// this way); callers pass a real SupabaseClient<Database>.
	admin: any;
	userId: string;
	scope: AgentCallScope;
	op: string;
	args?: Record<string, unknown>;
	callSessionId?: string;
	calendar?: CalendarPort;
	taskSync?: TaskSyncPort;
}): Promise<GatewayWriteOpResult> {
	const canonicalOp = normalizeGatewayOpName(
		typeof params.op === 'string' ? params.op.trim() : ''
	) as BuildosAgentAllowedOp;
	const handler = EXTERNAL_OP_HANDLERS[canonicalOp];
	if (!handler) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: `No worker write handler for op: ${canonicalOp}` }
		};
	}

	const rawArgs =
		params.args && typeof params.args === 'object' && !Array.isArray(params.args)
			? params.args
			: {};
	const args = normalizeGatewayOpArgs(canonicalOp, rawArgs);

	// Validate against the external write schema when one is defined (handlers
	// also self-validate their args, so a missing schema is not fatal).
	const schema = EXTERNAL_WRITE_OP_SCHEMAS[canonicalOp as BuildosAgentAllowedOp];
	if (schema) {
		const missing = validateRequiredArgs(schema, args);
		if (missing.length > 0) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: `Missing required parameter${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
				}
			};
		}
		const unexpected = validateUnexpectedArgs(schema, args);
		if (unexpected.length > 0) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: `Unsupported parameter${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`
				}
			};
		}
	}

	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		callerId: undefined,
		callSessionId: params.callSessionId,
		scope: params.scope,
		calendar: params.calendar,
		taskSync: params.taskSync
	};

	try {
		const result = await handler(context, args);
		const meta = extractWriteEntityMeta({ op: canonicalOp as BuildosAgentAllowedOp, result });
		return {
			ok: true,
			data: result,
			entityKind: meta.entityKind ?? null,
			entityId: meta.entityId ?? null
		};
	} catch (error) {
		const normalized = normalizeGatewayError(error);
		return {
			ok: false,
			error: {
				code: normalized.code,
				message: normalized.message,
				details: normalized.details
			}
		};
	}
}

// ---------------------------------------------------------------------------
// Staged write ops (Phase 4 — opt-in review-before-commit)
// ---------------------------------------------------------------------------

/** Derive the ProposedChange action from the op name. */
export function deriveProposedChangeAction(op: string): ProposedChangeAction {
	if (op === 'onto.edge.unlink') return 'delete';
	if (
		op.endsWith('.create') ||
		op === 'onto.edge.link' ||
		op === 'onto.task.docs.create_or_attach'
	) {
		return 'create';
	}
	// *.update, onto.document.tree.move, archive-via-update
	return 'update';
}

export type StageWriteOpResult =
	| { ok: true; change: Omit<ProposedChange, 'id'> }
	| {
			ok: false;
			error: { code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INTERNAL'; message: string };
	  };

/**
 * Compute a ProposedChange for a write op WITHOUT performing the mutation
 * (Phase 4 stage mode). Validates args the same way the commit path does,
 * derives the action/entity, and fetches a compact `before` snapshot for
 * update/delete ops so the review UI can render a diff. The `after` payload is
 * the proposed op args (what the commit will re-apply verbatim). Returns the
 * change minus its `id` — the caller (runner) assigns a stable id and records
 * telemetry against it.
 */
export async function stageGatewayWriteOp(params: {
	// `any` matches ToolExecutionContext.admin (see runGatewayWriteOp); callers
	// pass a real SupabaseClient<Database>.
	admin: any;
	op: string;
	args?: Record<string, unknown>;
	rationale?: string;
}): Promise<StageWriteOpResult> {
	const canonicalOp = normalizeGatewayOpName(
		typeof params.op === 'string' ? params.op.trim() : ''
	) as BuildosAgentAllowedOp;
	const handler = EXTERNAL_OP_HANDLERS[canonicalOp];
	if (!handler) {
		return {
			ok: false,
			error: { code: 'NOT_FOUND', message: `No worker write handler for op: ${canonicalOp}` }
		};
	}

	const rawArgs =
		params.args && typeof params.args === 'object' && !Array.isArray(params.args)
			? params.args
			: {};
	const args = normalizeGatewayOpArgs(canonicalOp, rawArgs);

	// Same arg validation as the commit path — a proposal must be applyable.
	const schema = EXTERNAL_WRITE_OP_SCHEMAS[canonicalOp];
	if (schema) {
		const missing = validateRequiredArgs(schema, args);
		if (missing.length > 0) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: `Missing required parameter${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`
				}
			};
		}
		const unexpected = validateUnexpectedArgs(schema, args);
		if (unexpected.length > 0) {
			return {
				ok: false,
				error: {
					code: 'VALIDATION_ERROR',
					message: `Unsupported parameter${unexpected.length === 1 ? '' : 's'}: ${unexpected.join(', ')}`
				}
			};
		}
	}

	const action = deriveProposedChangeAction(canonicalOp);
	const entityKind = entityKindFromGatewayOp(canonicalOp) ?? 'unknown';

	let entityId: string | undefined;
	let before: Record<string, unknown> | undefined;

	// For update/delete of a core entity, fetch a compact current snapshot.
	const cfg = (
		CORE_ENTITY_CONFIG as Record<string, { table: string; idArg: string; select: string }>
	)[entityKind];
	if (action !== 'create' && cfg) {
		const idVal = args[cfg.idArg];
		if (typeof idVal === 'string' && idVal) {
			entityId = idVal;
			try {
				const { data } = await params.admin
					.from(cfg.table)
					.select(cfg.select)
					.eq('id', idVal)
					.maybeSingle();
				before = (data as Record<string, unknown> | null) ?? undefined;
			} catch {
				before = undefined;
			}
		}
	}

	return {
		ok: true,
		change: {
			op: canonicalOp,
			entity_type: entityKind,
			entity_id: entityId,
			action,
			before,
			after: args,
			rationale: params.rationale ?? `Proposed ${action} of ${entityKind}`,
			decision: 'pending'
		}
	};
}
