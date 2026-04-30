// apps/web/src/lib/server/agent-call/external-tool-gateway.ts
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallScope,
	BuildosAgentAllowedOp,
	BuildosAgentDiscoveryToolName,
	BuildosAgentScopeMode,
	BuildosAgentToolDefinition
} from '@buildos/shared-types';
import { buildSearchFilter } from '$lib/utils/api-helpers';
import { logCreateAsync, logUpdateAsync } from '$lib/services/async-activity-logger';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';
import { TaskEventSyncService } from '$lib/services/ontology/task-event-sync.service';
import { GATEWAY_TOOL_DEFINITIONS } from '$lib/services/agentic-chat/tools/core/definitions/gateway';
import {
	getToolRegistry,
	type RegistryOp
} from '$lib/services/agentic-chat/tools/registry/tool-registry';
import { searchToolRegistry } from '$lib/services/agentic-chat/tools/registry/tool-search';
import { normalizeGatewayOpName } from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
import { loadSkill } from '$lib/services/agentic-chat/tools/skills/skill-load';
import {
	defaultAllowedOpsForMode,
	isSupportedOp,
	isWriteOp,
	requiredScopeModeForOp
} from './agent-call-policy';
import {
	AgentCallWritePendingError,
	AgentCallWriteReplayError,
	recordWriteExecutionFailure,
	recordWriteExecutionSuccess,
	reserveWriteExecution
} from './agent-call-write-audit.service';
import {
	notifyEntityMentionsAdded,
	resolveEntityMentionUserIds
} from '$lib/server/entity-mention-notification.service';
import { normalizeTaskStateInput } from '../../../routes/api/onto/shared/task-state';
import { normalizeDocumentStateInput } from '../../../routes/api/onto/shared/document-state';
import { normalizeMarkdownInput } from '$lib/utils/markdown-normalization';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import {
	addDocumentToTree,
	getDocTree,
	getNodePath,
	moveDocument
} from '$lib/services/ontology/doc-structure.service';
import {
	DOCUMENT_STATES,
	GOAL_STATES,
	MILESTONE_STATES,
	PLAN_STATES,
	PROJECT_STATES,
	RISK_STATES,
	isValidTypeKey
} from '$lib/types/onto';
import { logSecurityEvent, type SecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	getDocumentUpdateContentCandidate,
	isAppendOrMergeUpdateStrategy
} from '$lib/services/agentic-chat/shared/update-value-validation';
import { CalendarExecutor } from '$lib/services/agentic-chat/tools/core/executors/calendar-executor';
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import {
	instantiateProject,
	OntologyInstantiationError,
	validateProjectSpec
} from '$lib/services/ontology/instantiation.service';
import {
	normalizeEdgeDirection,
	VALID_RELS,
	type EntityKind
} from '$lib/services/ontology/edge-direction';
import { resolveEdgeRelationship } from '$lib/services/ontology/edge-relationship-resolver';

const MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024;
const TASK_DOCUMENT_REL = 'task_has_document';

type ToolExecutionContext = {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
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

type ExternalGatewayRegistryEntry = RegistryOp & {
	required_scope_mode: BuildosAgentScopeMode;
	handler: (
		context: ToolExecutionContext,
		args: Record<string, unknown>
	) => Promise<Record<string, unknown>>;
};

type ExternalGatewayRegistry = {
	version: string;
	ops: Record<string, ExternalGatewayRegistryEntry>;
};

type ToolHelpFormat = 'short' | 'full';

const EXTERNAL_DISCOVERY_TOOL_NAMES = new Set<BuildosAgentDiscoveryToolName>([
	'skill_load',
	'tool_search',
	'tool_schema'
]);

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
		select: 'id, name, description, type_key, state_key, props, start_at, end_at, created_at, updated_at, deleted_at'
	},
	task: {
		table: 'onto_tasks',
		idArg: 'task_id',
		resultKey: 'task',
		displayField: 'title',
		select: 'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at, deleted_at'
	},
	document: {
		table: 'onto_documents',
		idArg: 'document_id',
		resultKey: 'document',
		displayField: 'title',
		select: 'id, project_id, title, description, type_key, state_key, content, props, children, created_at, updated_at, deleted_at'
	},
	goal: {
		table: 'onto_goals',
		idArg: 'goal_id',
		resultKey: 'goal',
		displayField: 'name',
		select: 'id, project_id, name, goal, description, type_key, state_key, target_date, completed_at, props, created_at, updated_at, deleted_at'
	},
	plan: {
		table: 'onto_plans',
		idArg: 'plan_id',
		resultKey: 'plan',
		displayField: 'name',
		select: 'id, project_id, name, description, plan, type_key, state_key, props, created_at, updated_at, deleted_at'
	},
	milestone: {
		table: 'onto_milestones',
		idArg: 'milestone_id',
		resultKey: 'milestone',
		displayField: 'title',
		select: 'id, project_id, title, milestone, description, type_key, state_key, due_at, props, created_at, updated_at, deleted_at'
	},
	risk: {
		table: 'onto_risks',
		idArg: 'risk_id',
		resultKey: 'risk',
		displayField: 'title',
		select: 'id, project_id, title, impact, probability, state_key, content, type_key, props, mitigated_at, created_at, updated_at, deleted_at'
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

class ExternalToolGatewayError extends Error {
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

const EXTERNAL_WRITE_OP_SCHEMAS: Partial<Record<BuildosAgentAllowedOp, Record<string, unknown>>> = {
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

function clampLimit(value: unknown, fallback: number, min = 1, max = 50): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeMaxChars(value: unknown, fallback = 20000): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(50000, Math.max(500, Math.floor(value)));
}

function summarizeDescription(description: string): string {
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

function buildRegistryVersion(opNames: string[]): string {
	const internalRegistry = getToolRegistry();
	return `${internalRegistry.version}/external/${opNames.join(',')}`;
}

function buildExternalToolDescription(entry: RegistryOp): string {
	if (entry.group !== 'cal') {
		return entry.description;
	}

	return `${entry.description} External callers must scope calendar access to an allowed project_id or task_id; broad user calendar access is not exposed through the BuildOS call gateway.`;
}

async function loadVisibleProjects(context: ToolExecutionContext): Promise<VisibleProjectContext> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const projects = await fetchProjectSummaries(context.admin, actorId);
	const projectMap = buildAllowedProjectSet(context.scope, projects);

	return {
		projects: Array.from(projectMap.values()),
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

function assertUnscopedProjectCreationAllowed(scope: AgentCallScope): void {
	if (Array.isArray(scope.project_ids) && scope.project_ids.length > 0) {
		throw new ExternalToolGatewayError(
			'FORBIDDEN',
			'Project creation is only available to unscoped read_write callers'
		);
	}
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
	access: 'read' | 'write'
): Promise<EntityAccessResult> {
	const entityId = assertValidId(id, `${kind}_id`);
	const table = LINK_ENTITY_TABLES[kind];
	const visible = await loadVisibleProjects(context);

	let query = context.admin.from(table).select('*').eq('id', entityId);
	if (kind !== 'metric' && kind !== 'source') {
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
	const project = assertVisibleEntityProject(visible.projectMap, projectId);
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
	access: 'read' | 'write'
): Promise<EntityAccessResult> {
	return loadEntityForAccess(context, kind, id, access);
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
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a number`);
	}

	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', `${fieldName} must be a number`);
	}

	const normalized = Math.floor(value);
	if (normalized < 1 || normalized > 5) {
		throw new ExternalToolGatewayError(
			'VALIDATION_ERROR',
			`${fieldName} must be between 1 and 5`
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

function createCalendarExecutor(context: ToolExecutionContext): CalendarExecutor {
	return new CalendarExecutor({
		supabase: context.admin,
		userId: context.userId,
		sessionId: context.callSessionId,
		fetchFn: fetch,
		getActorId: () => ensureActorId(context.admin, context.userId),
		getAdminSupabase: () => context.admin,
		getAuthHeaders: async () => ({
			'Content-Type': 'application/json',
			'X-Change-Source': 'agent_call'
		})
	});
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
	invoke: (executor: CalendarExecutor, args: Record<string, unknown>) => Promise<unknown>
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
		.is('deleted_at', null)
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

function normalizeGatewayError(error: unknown): ExternalToolGatewayError {
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

	try {
		const taskEventSync = new TaskEventSyncService(params.context.admin);
		await taskEventSync.syncTaskEvents(
			params.context.userId,
			params.actorId,
			params.task as any
		);
	} catch (eventError) {
		console.warn('[External Tool Gateway] Failed to sync task events on create:', eventError);
	}

	logCreateAsync(
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
		'api'
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

	if (shouldSyncEvents) {
		try {
			const taskEventSync = new TaskEventSyncService(params.context.admin);
			await taskEventSync.syncTaskEvents(
				params.context.userId,
				params.actorId,
				params.updatedTask as any
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

	logUpdateAsync(
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
		'api'
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
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.getProjectCalendar(toolArgs as any)
	);
}

async function setProjectCalendar(context: ToolExecutionContext, args: Record<string, unknown>) {
	const scopedArgs = await resolveExternalCalendarProjectArgs(context, args, 'write');
	return runCalendarTool(context, scopedArgs, (executor, toolArgs) =>
		executor.setProjectCalendar(toolArgs as any)
	);
}

async function listProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const requestedState =
		typeof args.state_key === 'string' && args.state_key.trim() ? args.state_key.trim() : null;
	const requestedType =
		typeof args.type_key === 'string' && args.type_key.trim() ? args.type_key.trim() : null;
	const limit = clampLimit(args.limit, 20, 1, 50);

	const projects = visible.projects
		.filter((project) => (requestedState ? project.state_key === requestedState : true))
		.filter((project) => (requestedType ? project.type_key === requestedType : true))
		.slice(0, limit)
		.map((project) => ({
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
		total: projects.length
	};
}

async function searchProjects(context: ToolExecutionContext, args: Record<string, unknown>) {
	const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 20);
	const visible = await loadVisibleProjects(context);

	const results = visible.projects
		.filter((project) => {
			const haystack = `${project.name} ${project.description ?? ''}`.toLowerCase();
			return haystack.includes(query);
		})
		.slice(0, limit)
		.map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			type_key: project.type_key,
			state_key: project.state_key,
			updated_at: project.updated_at
		}));

	return {
		query,
		projects: results,
		total: results.length
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

async function listTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const limit = clampLimit(args.limit, 20, 1, 50);
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return { tasks: [], total: 0 };
	}

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, updated_at',
			{ count: 'exact' }
		)
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (typeof args.state_key === 'string' && args.state_key.trim()) {
		query = query.eq('state_key', args.state_key.trim());
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
		total: count ?? tasks.length
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

	const { data, error } = await context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		)
		.is('deleted_at', null)
		.maybeSingle();

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
	let projectIds = getProjectIdsForVisibleContext(visible);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return { [`${kind}s`]: [], total: 0 };
	}

	const config = CORE_ENTITY_CONFIG[kind];
	let query = context.admin
		.from(config.table)
		.select(config.select, { count: 'exact' })
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.order(kind === 'milestone' ? 'due_at' : 'updated_at', {
			ascending: kind === 'milestone',
			...(kind === 'milestone' ? { nullsFirst: true } : {})
		})
		.limit(limit);

	if (typeof args.state_key === 'string' && args.state_key.trim()) {
		query = query.eq('state_key', args.state_key.trim());
	}
	if (kind === 'risk' && typeof args.impact === 'string' && args.impact.trim()) {
		query = query.eq('impact', args.impact.trim());
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
		total: count ?? rows.length
	};
}

async function getCoreEntity(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	kind: Exclude<ExternalEntityKind, 'task' | 'document'>
) {
	const config = CORE_ENTITY_CONFIG[kind];
	const entityId = args[config.idArg];
	const access = await loadCoreEntityForAccess(context, kind, entityId, 'read');
	return {
		[config.resultKey]: {
			...access.entity,
			project_name: access.project.name
		}
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

	const { data: existingTask, error: existingTaskError } = await context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at'
		)
		.eq('id', taskId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		)
		.is('deleted_at', null)
		.maybeSingle();

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
			'id, project_id, title, description, type_key, state_key, priority, start_at, due_at, completed_at, props, created_at, updated_at'
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

	logCreateAsync(
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
		'api'
	);

	return {
		document: {
			...data,
			project_name: project.name
		},
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

	const { data: existingDocument, error: existingError } = await context.admin
		.from('onto_documents')
		.select('*')
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		)
		.is('deleted_at', null)
		.maybeSingle();

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

	logUpdateAsync(
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
		'api'
	);

	return {
		document: {
			...data,
			project_name: project.name
		}
	};
}

async function createProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	assertUnscopedProjectCreationAllowed(context.scope);

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
		result = await instantiateProject(context.admin, spec as any, context.userId);
	} catch (error) {
		if (error instanceof OntologyInstantiationError) {
			throw new ExternalToolGatewayError('VALIDATION_ERROR', error.message);
		}
		throw error;
	}

	const { data: project } = await context.admin
		.from('onto_projects')
		.select(CORE_ENTITY_CONFIG.project.select)
		.eq('id', result.project_id)
		.maybeSingle();

	logCreateAsync(
		context.admin,
		result.project_id,
		'project',
		result.project_id,
		{
			name:
				project && typeof project.name === 'string'
					? project.name
					: (args.project as { name?: unknown } | undefined)?.name,
			counts: result.counts
		},
		context.userId,
		'api'
	);

	return {
		project_id: result.project_id,
		project: project ?? { id: result.project_id },
		counts: result.counts,
		message: `Created project "${(project as { name?: string } | null)?.name ?? result.project_id}".`
	};
}

async function updateProject(context: ToolExecutionContext, args: Record<string, unknown>) {
	const access = await loadCoreEntityForAccess(context, 'project', args.project_id, 'write');
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

	logUpdateAsync(
		context.admin,
		access.project.id,
		'project',
		access.project.id,
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'api'
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

	logCreateAsync(
		context.admin,
		project.id,
		'goal',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'api'
	);

	return {
		goal: {
			...data,
			project_name: project.name
		},
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
	logCreateAsync(
		context.admin,
		project.id,
		'plan',
		String(data.id),
		{ name: data.name, type_key: data.type_key, state_key: data.state_key },
		context.userId,
		'api'
	);

	return {
		plan: {
			...data,
			project_name: project.name
		},
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
	logCreateAsync(
		context.admin,
		project.id,
		'milestone',
		String(data.id),
		{ title: data.title, state_key: data.state_key },
		context.userId,
		'api'
	);

	return {
		milestone: {
			...data,
			project_name: project.name
		},
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

	logCreateAsync(
		context.admin,
		project.id,
		'risk',
		String(data.id),
		{ title: data.title, impact: data.impact, state_key: data.state_key },
		context.userId,
		'api'
	);

	return {
		risk: {
			...data,
			project_name: project.name
		},
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
	const access = await loadCoreEntityForAccess(context, kind, args[config.idArg], 'write');
	const updateData = buildUpdateData(access.entity);
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

	logUpdateAsync(
		context.admin,
		access.project.id,
		kind,
		String(access.entity.id),
		access.entity,
		data as Record<string, unknown>,
		context.userId,
		'api'
	);

	return {
		[config.resultKey]: {
			...data,
			project_name: access.project.name
		},
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

	logCreateAsync(
		context.admin,
		srcProjectId,
		'edge',
		String(data.id),
		{ src_kind: data.src_kind, dst_kind: data.dst_kind, rel: data.rel },
		context.userId,
		'api'
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

	logUpdateAsync(
		context.admin,
		project.id,
		'edge',
		edgeId,
		edge as Record<string, unknown>,
		{ deleted: true },
		context.userId,
		'api'
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
		await createEdge(
			context,
			{
				src_kind: 'project',
				src_id: taskAccess.project.id,
				dst_kind: 'document',
				dst_id: document.id,
				rel: 'has_document',
				props: { origin: 'external_agent' }
			},
			taskAccess.project
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
		document,
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
		.is('deleted_at', null)
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
			.is('deleted_at', null)
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
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return { documents: [], total: 0 };
	}

	let query = context.admin
		.from('onto_documents')
		.select('id, project_id, title, description, type_key, state_key, created_at, updated_at', {
			count: 'exact'
		})
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (typeof args.type_key === 'string' && args.type_key.trim()) {
		query = query.eq('type_key', args.type_key.trim());
	}

	if (typeof args.state_key === 'string' && args.state_key.trim()) {
		query = query.eq('state_key', args.state_key.trim());
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
		total: count ?? documents.length
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

	const { data, error } = await context.admin
		.from('onto_documents')
		.select(
			'id, project_id, title, description, type_key, content, state_key, created_at, updated_at'
		)
		.eq('id', documentId)
		.in(
			'project_id',
			visible.projects.map((project) => project.id)
		)
		.is('deleted_at', null)
		.maybeSingle();

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
		graph,
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
		...tree,
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
			.is('deleted_at', null)
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
		.is('deleted_at', null);

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
			return document ? { document, edge } : null;
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
	const entity = await resolveVisibleEntityById(context, args.entity_id, 'read');
	const direction =
		args.direction === 'outgoing' || args.direction === 'incoming' || args.direction === 'both'
			? args.direction
			: 'both';
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
					...row,
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

async function searchEntitiesByType(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	allowedTypes: Array<'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk'>
) {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 20);
	const visible = await loadVisibleProjects(context);
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return { query, results: [] };
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

	const taskFilter = activeTypes.includes('task')
		? buildSearchFilter(query, ['title', 'description'])
		: null;
	const planFilter = activeTypes.includes('plan')
		? buildSearchFilter(query, ['name', 'description'])
		: null;
	const goalFilter = activeTypes.includes('goal')
		? buildSearchFilter(query, ['name', 'description'])
		: null;
	const documentFilter = activeTypes.includes('document')
		? buildSearchFilter(query, ['title', 'content', 'description'])
		: null;
	const milestoneFilter = activeTypes.includes('milestone')
		? buildSearchFilter(query, ['title', 'description'])
		: null;
	const riskFilter = activeTypes.includes('risk')
		? buildSearchFilter(query, ['title', 'content'])
		: null;
	const perTypeLimit = Math.max(
		2,
		Math.min(8, Math.ceil(limit / Math.max(1, activeTypes.length)))
	);

	const [tasks, plans, goals, documents, milestones, risks] = await Promise.all([
		taskFilter
			? context.admin
					.from('onto_tasks')
					.select('id, project_id, title, description, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(taskFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null }),
		planFilter
			? context.admin
					.from('onto_plans')
					.select('id, project_id, name, description, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(planFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null }),
		goalFilter
			? context.admin
					.from('onto_goals')
					.select('id, project_id, name, description, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(goalFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null }),
		documentFilter
			? context.admin
					.from('onto_documents')
					.select('id, project_id, title, description, content, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(documentFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null }),
		milestoneFilter
			? context.admin
					.from('onto_milestones')
					.select('id, project_id, title, description, state_key, due_at, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(milestoneFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null }),
		riskFilter
			? context.admin
					.from('onto_risks')
					.select('id, project_id, title, content, impact, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(riskFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null })
	]);

	for (const result of [tasks, plans, goals, documents, milestones, risks]) {
		if (result.error) {
			throw new ExternalToolGatewayError(
				'INTERNAL',
				result.error.message || 'Failed to search ontology'
			);
		}
	}

	const results = [
		...((tasks.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'task',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.title,
			snippet: item.description ?? null,
			state_key: item.state_key,
			updated_at: item.updated_at
		})),
		...((plans.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'plan',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.name,
			snippet: item.description ?? null,
			state_key: item.state_key,
			updated_at: item.updated_at
		})),
		...((goals.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'goal',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.name,
			snippet: item.description ?? null,
			state_key: item.state_key,
			updated_at: item.updated_at
		})),
		...((documents.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'document',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.title,
			snippet: truncateText(
				typeof item.content === 'string'
					? item.content.replace(/\s+/g, ' ').trim()
					: typeof item.description === 'string'
						? item.description
						: '',
				220
			).content,
			state_key: item.state_key,
			updated_at: item.updated_at
		})),
		...((milestones.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'milestone',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.title,
			snippet: item.description ?? null,
			state_key: item.state_key,
			due_at: item.due_at,
			updated_at: item.updated_at
		})),
		...((risks.data ?? []) as Array<Record<string, unknown>>).map((item) => ({
			type: 'risk',
			id: item.id,
			project_id: item.project_id,
			project_name: visible.projectMap.get(String(item.project_id))?.name ?? null,
			title: item.title,
			snippet:
				typeof item.content === 'string'
					? truncateText(item.content.replace(/\s+/g, ' ').trim(), 220).content
					: null,
			state_key: item.state_key,
			impact: item.impact,
			updated_at: item.updated_at
		}))
	]
		.sort(
			(a, b) =>
				Date.parse(String(b.updated_at ?? '')) - Date.parse(String(a.updated_at ?? ''))
		)
		.slice(0, limit);

	return {
		query,
		results
	};
}

function buildExternalGatewayRegistry(scope: AgentCallScope): ExternalGatewayRegistry {
	const internalRegistry = getToolRegistry();
	const allowedOps = (scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode)).filter((op) =>
		scope.mode === 'read_write' ? true : !isWriteOp(op)
	);
	const ops: Record<string, ExternalGatewayRegistryEntry> = {};

	for (const op of allowedOps) {
		const entry = internalRegistry.ops[op];
		const handler = EXTERNAL_OP_HANDLERS[op];
		if (!entry || !handler) continue;
		ops[op] = {
			...entry,
			parameters_schema: EXTERNAL_WRITE_OP_SCHEMAS[op] ?? entry.parameters_schema,
			required_scope_mode: isWriteOp(op) ? 'read_write' : 'read_only',
			handler
		};
	}

	return {
		version: buildRegistryVersion(Object.keys(ops).sort()),
		ops
	};
}

function buildMinimalArgsTemplate(schema: Record<string, any>): Record<string, unknown> {
	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
	const template: Record<string, unknown> = {};

	for (const [name, definition] of Object.entries(properties)) {
		if (!required.has(name)) {
			continue;
		}

		const type = Array.isArray(definition.type) ? definition.type[0] : definition.type;
		if (name.endsWith('_id')) {
			template[name] = `<${name}>`;
			continue;
		}

		if (type === 'number' || type === 'integer') {
			template[name] = 1;
			continue;
		}

		if (type === 'object') {
			template[name] = {};
			continue;
		}

		template[name] = `<${name}>`;
	}

	return template;
}

function buildExternalOpHelp(
	entry: ExternalGatewayRegistryEntry,
	format: ToolHelpFormat,
	includeSchemas: boolean,
	includeExamples: boolean
): Record<string, unknown> {
	const schema = buildExternalDirectToolSchema(entry);
	const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
	const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
	const args = Object.entries(properties).map(([name, definition]) => ({
		name,
		type: Array.isArray(definition.type)
			? definition.type.join(' | ')
			: (definition.type ?? 'any'),
		required: required.includes(name),
		description: definition.description
	}));
	const minimalArgs = buildMinimalArgsTemplate(schema);

	const help: Record<string, unknown> = {
		type: 'op',
		op: entry.op,
		tool_name: entry.tool_name,
		callable_tool: entry.tool_name,
		kind: entry.kind,
		summary: summarizeDescription(buildExternalToolDescription(entry)),
		usage: `${entry.tool_name}({ ... })`,
		required_scope_mode: entry.required_scope_mode,
		required_args: required,
		args
	};

	if (includeSchemas) {
		help.schema = schema;
	}

	if (includeExamples) {
		help.example_tool_call = {
			name: entry.tool_name,
			arguments: minimalArgs
		};
	}

	if (format === 'full') {
		help.description = buildExternalToolDescription(entry);
	}

	return help;
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

function buildExecError(
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

async function executeGatewayOp(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	const registry = buildExternalGatewayRegistry(params.scope);
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

	const opArgs =
		input.args && typeof input.args === 'object' && !Array.isArray(input.args)
			? (input.args as Record<string, unknown>)
			: {};
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

	try {
		const result = await entry.handler(
			{
				admin: params.admin,
				userId: params.userId,
				callerId: params.callerId,
				callSessionId: params.callSessionId,
				scope: params.scope
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
					securityEventOptions: params.securityEventOptions
				});
			} catch (auditError) {
				console.error(
					'[External Tool Gateway] Failed to record write success:',
					auditError
				);
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
		}

		return response;
	}
}

export function getBuildosAgentGatewayTools(scope: AgentCallScope): BuildosAgentToolDefinition[] {
	const discoveryTools = GATEWAY_TOOL_DEFINITIONS.filter((tool) =>
		EXTERNAL_DISCOVERY_TOOL_NAMES.has(tool.function.name as BuildosAgentDiscoveryToolName)
	).map((tool) => ({
		name: tool.function.name,
		description: tool.function.description,
		inputSchema: tool.function.parameters ?? { type: 'object', properties: {} }
	}));

	const registry = buildExternalGatewayRegistry(scope);
	const directTools = Object.values(registry.ops).map((entry) => ({
		name: entry.tool_name,
		description: buildExternalToolDescription(entry),
		inputSchema: buildExternalDirectToolSchema(entry)
	}));

	return [...discoveryTools, ...directTools];
}

function buildExternalDirectToolSchema(
	entry: ExternalGatewayRegistryEntry
): Record<string, unknown> {
	const schema = cloneSchema(entry.parameters_schema);
	if (!isWriteOp(entry.op)) {
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
			idempotency_key: {
				type: 'string',
				description:
					'Optional stable key for safely retrying the same external write without duplicating it.'
			},
			dry_run: {
				type: 'boolean',
				description: 'Return the validated write payload without mutating BuildOS.'
			}
		}
	};
}

function cloneSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> {
	return JSON.parse(JSON.stringify(schema ?? { type: 'object', properties: {} })) as Record<
		string,
		unknown
	>;
}

function findExternalDirectTool(
	scope: AgentCallScope,
	toolName: string
): ExternalGatewayRegistryEntry | null {
	const registry = buildExternalGatewayRegistry(scope);
	return Object.values(registry.ops).find((entry) => entry.tool_name === toolName) ?? null;
}

function buildDirectToolGatewayArguments(
	entry: ExternalGatewayRegistryEntry,
	args: Record<string, unknown> | undefined
): Record<string, unknown> {
	const input = { ...(args ?? {}) };
	const idempotencyKey =
		typeof input.idempotency_key === 'string' && input.idempotency_key.trim()
			? input.idempotency_key.trim()
			: undefined;
	const dryRun = input.dry_run === true;
	delete input.idempotency_key;
	delete input.dry_run;

	return {
		op: entry.op,
		args: input,
		...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
		...(dryRun ? { dry_run: true } : {})
	};
}

export async function executeBuildosAgentGatewayTool(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	toolName: string;
	arguments?: Record<string, unknown>;
	securityEventOptions?: SecurityEventLogOptions;
}): Promise<Record<string, unknown>> {
	switch (params.toolName) {
		case 'skill_load':
			return loadSkill(
				typeof params.arguments?.skill === 'string'
					? params.arguments.skill
					: typeof params.arguments?.id === 'string'
						? params.arguments.id
						: typeof params.arguments?.path === 'string'
							? params.arguments.path
							: '',
				{
					format: params.arguments?.format === 'full' ? 'full' : 'short',
					include_examples: params.arguments?.include_examples !== false
				}
			) as Record<string, unknown>;
		case 'tool_search': {
			const registry = buildExternalGatewayRegistry(params.scope);
			const payload = searchToolRegistry({
				query:
					typeof params.arguments?.query === 'string'
						? params.arguments.query
						: undefined,
				capability:
					typeof params.arguments?.capability === 'string'
						? params.arguments.capability
						: undefined,
				group:
					params.arguments?.group === 'onto' ||
					params.arguments?.group === 'util' ||
					params.arguments?.group === 'cal'
						? (params.arguments.group as 'onto' | 'util' | 'cal')
						: undefined,
				kind:
					params.arguments?.kind === 'read' || params.arguments?.kind === 'write'
						? (params.arguments.kind as 'read' | 'write')
						: undefined,
				entity:
					typeof params.arguments?.entity === 'string'
						? params.arguments.entity
						: undefined,
				limit:
					typeof params.arguments?.limit === 'number' ? params.arguments.limit : undefined
			}) as Record<string, unknown>;
			const matches = Array.isArray(payload.matches)
				? payload.matches.filter((match) => {
						const op =
							typeof (match as { op?: unknown }).op === 'string'
								? (match as { op: string }).op
								: '';
						return Boolean(op) && Boolean(registry.ops[op]);
					})
				: [];
			return {
				...payload,
				version: registry.version,
				total_matches: matches.length,
				matches
			};
		}
		case 'tool_schema': {
			const requestedOp =
				typeof params.arguments?.op === 'string'
					? params.arguments.op
					: typeof params.arguments?.path === 'string'
						? params.arguments.path
						: '';
			const canonicalOp = normalizeGatewayOpName(requestedOp);
			const registry = buildExternalGatewayRegistry(params.scope);
			const entry = registry.ops[canonicalOp];
			if (!entry) {
				return buildExecError(
					requestedOp,
					isSupportedOp(canonicalOp) ? 'FORBIDDEN' : 'NOT_FOUND',
					isSupportedOp(canonicalOp)
						? `Op ${canonicalOp} is outside the granted BuildOS call scope`
						: `Unknown op: ${requestedOp}`,
					isSupportedOp(canonicalOp) ? canonicalOp : 'root'
				);
			}
			return {
				...buildExternalOpHelp(
					entry,
					'full',
					params.arguments?.include_schema !== false,
					params.arguments?.include_examples !== false
				),
				type: 'tool_schema'
			} as Record<string, unknown>;
		}
		default:
			break;
	}

	const directEntry = findExternalDirectTool(params.scope, params.toolName);
	if (directEntry) {
		return executeGatewayOp({
			...params,
			arguments: buildDirectToolGatewayArguments(directEntry, params.arguments)
		});
	}

	const registryEntry = getToolRegistry().byToolName[params.toolName];
	const canonicalOp = registryEntry ? normalizeGatewayOpName(registryEntry.op) : '';
	if (canonicalOp && isSupportedOp(canonicalOp)) {
		return buildExecError(
			canonicalOp,
			'FORBIDDEN',
			`Tool ${params.toolName} is outside the granted BuildOS call scope`,
			canonicalOp,
			{
				granted_scope_mode: params.scope.mode,
				required_scope_mode: requiredScopeModeForOp(canonicalOp),
				allowed_ops: params.scope.allowed_ops ?? defaultAllowedOpsForMode(params.scope.mode)
			}
		);
	}

	return buildExecError(
		params.toolName,
		'NOT_FOUND',
		`Unsupported BuildOS tool: ${params.toolName}.`,
		'root'
	);
}
