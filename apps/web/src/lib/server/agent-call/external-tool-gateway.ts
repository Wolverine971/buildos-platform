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
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';
import { DOCUMENT_STATES, isValidTypeKey } from '$lib/types/onto';
import { logSecurityEvent, type SecurityEventLogOptions } from '$lib/server/security-event-logger';
import {
	getDocumentUpdateContentCandidate,
	isAppendOrMergeUpdateStrategy
} from '$lib/services/agentic-chat/shared/update-value-validation';

const MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024;

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
	'onto.task.list': listTasks,
	'onto.task.search': searchTasks,
	'onto.task.get': getTask,
	'onto.task.create': createTask,
	'onto.task.update': updateTask,
	'onto.document.list': listDocuments,
	'onto.document.search': searchDocuments,
	'onto.document.get': getDocument,
	'onto.document.create': createDocument,
	'onto.document.update': updateDocument,
	'onto.search': searchOntology,
	// The remaining expanded write ops are registered in shared-types/agent-call but not
	// yet implemented on the gateway. They will surface FORBIDDEN (wrong scope) rather
	// than NOT_FOUND when a caller attempts them, which is intentional while we roll
	// out the PoC incrementally.
	'onto.project.create': notImplementedHandler('onto.project.create'),
	'onto.project.update': notImplementedHandler('onto.project.update'),
	'onto.goal.create': notImplementedHandler('onto.goal.create'),
	'onto.goal.update': notImplementedHandler('onto.goal.update'),
	'onto.plan.create': notImplementedHandler('onto.plan.create'),
	'onto.plan.update': notImplementedHandler('onto.plan.update'),
	'onto.milestone.create': notImplementedHandler('onto.milestone.create'),
	'onto.milestone.update': notImplementedHandler('onto.milestone.update'),
	'onto.risk.create': notImplementedHandler('onto.risk.create'),
	'onto.risk.update': notImplementedHandler('onto.risk.update')
};

function notImplementedHandler(op: string) {
	return async () => {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			`${op} is registered but not yet implemented on the external gateway.`
		);
	};
}

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
	const entityKeyMap: Array<{ prefix: string; kind: string; resultKey: string }> = [
		{ prefix: 'onto.task.', kind: 'task', resultKey: 'task' },
		{ prefix: 'onto.document.', kind: 'document', resultKey: 'document' },
		{ prefix: 'onto.project.', kind: 'project', resultKey: 'project' },
		{ prefix: 'onto.goal.', kind: 'goal', resultKey: 'goal' },
		{ prefix: 'onto.plan.', kind: 'plan', resultKey: 'plan' },
		{ prefix: 'onto.milestone.', kind: 'milestone', resultKey: 'milestone' },
		{ prefix: 'onto.risk.', kind: 'risk', resultKey: 'risk' }
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

function normalizeDocumentUpdateStrategy(
	value: unknown
): 'replace' | 'append' | 'merge_llm' {
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

	if (
		isAppendOrMergeUpdateStrategy(strategy) &&
		!getDocumentUpdateContentCandidate(args)
	) {
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
					: typeof (existingDocument.props as Record<string, unknown> | null)?.body_markdown ===
							  'string'
						? ((existingDocument.props as Record<string, unknown>).body_markdown as string)
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

async function searchOntology(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, ['task', 'plan', 'goal', 'document']);
}

async function searchEntitiesByType(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	allowedTypes: Array<'task' | 'plan' | 'goal' | 'document'>
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
				(value): value is 'task' | 'plan' | 'goal' | 'document' =>
					typeof value === 'string' &&
					allowedTypes.includes(value as 'task' | 'plan' | 'goal' | 'document')
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
	const perTypeLimit = Math.max(
		2,
		Math.min(8, Math.ceil(limit / Math.max(1, activeTypes.length)))
	);

	const [tasks, plans, goals, documents] = await Promise.all([
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
			: Promise.resolve({ data: [], error: null })
	]);

	for (const result of [tasks, plans, goals, documents]) {
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
		summary: summarizeDescription(entry.description),
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
		help.description = entry.description;
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
		description: entry.description,
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
