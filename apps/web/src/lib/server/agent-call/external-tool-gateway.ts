// apps/web/src/lib/server/agent-call/external-tool-gateway.ts
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallScope,
	BuildosAgentAllowedOp,
	BuildosAgentGatewayToolName,
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
import {
	normalizeGatewayHelpPath,
	normalizeGatewayOpName
} from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';
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

type ExternalToolHelpOptions = {
	format?: ToolHelpFormat;
	include_examples?: boolean;
	include_schemas?: boolean;
};

const EXTERNAL_GATEWAY_TOOL_NAMES = new Set<BuildosAgentGatewayToolName>([
	'skill_load',
	'tool_search',
	'tool_schema',
	'buildos_call',
	'tool_help',
	'tool_exec'
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
				description: 'Optional task type key.'
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
	'onto.search': searchOntology
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

function normalizePath(path: string): string {
	if (!path) return 'root';
	const trimmed = path.trim();
	if (!trimmed) return 'root';
	return trimmed.replace(/^\./, '').replace(/\.$/, '');
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
	if (params.op.startsWith('onto.task.')) {
		const task = params.result.task;
		if (task && typeof task === 'object' && !Array.isArray(task)) {
			const taskId = (task as { id?: unknown }).id;
			if (typeof taskId === 'string' && isValidUUID(taskId)) {
				return {
					entityKind: 'task',
					entityId: taskId
				};
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
	const schema = entry.parameters_schema ?? { type: 'object', properties: {} };
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
		kind: entry.kind,
		summary: summarizeDescription(entry.description),
		usage: `buildos_call({ op: "${entry.op}", args: { ... } })`,
		required_scope_mode: entry.required_scope_mode,
		required_args: required,
		args
	};

	if (includeSchemas) {
		help.schema = schema;
	}

	if (includeExamples) {
		help.example_buildos_call = {
			op: entry.op,
			args: minimalArgs
		};
	}

	if (format === 'full') {
		help.description = entry.description;
	}

	return help;
}

function rewriteGatewayPayloadForBuildosCall(value: unknown): unknown {
	if (typeof value === 'string') {
		return value.replace(/\btool_exec\b/g, 'buildos_call');
	}

	if (Array.isArray(value)) {
		return value.map((entry) => rewriteGatewayPayloadForBuildosCall(entry));
	}

	if (!value || typeof value !== 'object') {
		return value;
	}

	const record = value as Record<string, unknown>;
	const output: Record<string, unknown> = {};
	for (const [key, entry] of Object.entries(record)) {
		const nextKey =
			key === 'tool_exec'
				? 'buildos_call'
				: key === 'example_tool_exec'
					? 'example_buildos_call'
					: key;
		output[nextKey] = rewriteGatewayPayloadForBuildosCall(entry);
	}
	return output;
}

function rewriteGatewayRecordPayloadForBuildosCall(
	value: Record<string, unknown>
): Record<string, unknown> {
	return rewriteGatewayPayloadForBuildosCall(value) as Record<string, unknown>;
}

function listDirectoryChildren(
	path: string,
	ops: Record<string, ExternalGatewayRegistryEntry>
): Array<Record<string, unknown>> {
	const childDirectories = new Set<string>();
	const childOps: Array<Record<string, unknown>> = [];
	const prefix = path === 'root' ? '' : `${path}.`;

	for (const op of Object.keys(ops).sort()) {
		if (path !== 'root' && !op.startsWith(prefix)) continue;
		if (path === 'root') {
			const rootSegment = op.split('.')[0];
			if (rootSegment) {
				childDirectories.add(rootSegment);
			}
			continue;
		}

		const remainder = op.slice(prefix.length);
		if (!remainder) continue;
		const parts = remainder.split('.');
		if (parts.length > 1) {
			childDirectories.add(`${path}.${parts[0]}`);
			continue;
		}

		const entry = ops[op];
		if (!entry) continue;
		childOps.push({
			type: 'op',
			name: op,
			summary: summarizeDescription(entry.description),
			kind: entry.kind
		});
	}

	const directories = Array.from(childDirectories)
		.sort()
		.map((name) => ({
			type: 'directory',
			name,
			summary: `Inspect ${name} operations.`
		}));

	return [...directories, ...childOps];
}

function buildRootHelp(
	registry: ExternalGatewayRegistry,
	format: ToolHelpFormat,
	includeExamples: boolean
) {
	const rootHelp: Record<string, unknown> = {
		type: 'directory',
		path: 'root',
		format,
		version: registry.version,
		groups: ['onto'],
		command_contract: {
			skill_load: {
				required: ['skill'],
				shape: { skill: '<skill_id>', format: 'short|full', include_examples: true }
			},
			tool_search: {
				required: [],
				shape: { query: '<what you need>', group: 'onto|util|cal', kind: 'read|write' }
			},
			tool_schema: {
				required: ['op'],
				shape: { op: '<canonical op>', include_schema: true, include_examples: true }
			},
			buildos_call: {
				required: ['op', 'args'],
				shape: {
					op: '<canonical op>',
					args: {
						/* required fields */
					}
				},
				critical_rules: [
					'Use tool_search when the exact op is unknown.',
					'Use tool_schema before first-time or uncertain writes.',
					'Discover exact IDs with list/search ops before get/update flows.',
					'If buildos_call returns FORBIDDEN, inspect the granted scope mode and allowed ops before retrying.'
				]
			}
		},
		items: listDirectoryChildren('root', registry.ops),
		workflow: [
			'1) Use tool_search to discover candidate ops when the exact op is not already known.',
			'2) Inspect the chosen exact op with tool_schema({ op: "<exact op>", include_schema: true }).',
			'3) Execute with buildos_call({ op: "<exact op>", args: { ... } }).'
		]
	};

	if (includeExamples) {
		const examples: Array<Record<string, unknown>> = [
			{
				description: 'Find task list operations',
				tool_search: { query: 'list tasks for a project', group: 'onto', kind: 'read' }
			},
			{
				description: 'List tasks for a project',
				buildos_call: {
					op: 'onto.task.list',
					args: { project_id: '<project_id_uuid>', limit: 20 }
				}
			}
		];

		if (Object.values(registry.ops).some((entry) => entry.kind === 'write')) {
			examples.push({
				description: 'Inspect a write op before mutating tasks',
				tool_schema: {
					op: 'onto.task.update',
					include_schema: true,
					include_examples: true
				}
			});
		}

		rootHelp.examples = examples;
	}

	return rootHelp;
}

function getExternalToolHelp(
	scope: AgentCallScope,
	path: string,
	options: ExternalToolHelpOptions = {}
): Record<string, unknown> {
	const registry = buildExternalGatewayRegistry(scope);
	const format: ToolHelpFormat = options.format ?? 'short';
	const includeExamples = options.include_examples !== false;
	const includeSchemas = Boolean(options.include_schemas);
	const normalized = normalizeGatewayHelpPath(normalizePath(path));

	if (!normalized || normalized === 'root') {
		return buildRootHelp(registry, format, includeExamples);
	}

	const exactEntry = registry.ops[normalized];
	if (exactEntry) {
		return buildExternalOpHelp(exactEntry, format, includeSchemas, includeExamples);
	}

	if (isSupportedOp(normalized)) {
		return {
			type: 'forbidden',
			path: normalized,
			format,
			version: registry.version,
			message: 'This op exists, but it is not available in the current BuildOS call scope.',
			required_scope_mode: requiredScopeModeForOp(normalized),
			granted_scope_mode: scope.mode,
			allowed_ops: scope.allowed_ops ?? defaultAllowedOpsForMode(scope.mode)
		};
	}

	const items = listDirectoryChildren(normalized, registry.ops);
	if (items.length === 0) {
		return {
			type: 'not_found',
			path: normalized,
			format,
			version: registry.version,
			message: 'No commands found for this path.'
		};
	}

	return {
		type: 'directory',
		path: normalized,
		format,
		version: registry.version,
		items,
		next_step:
			'Call tool_help({ path: "<exact op>", format: "full", include_schemas: true }) before tool_exec if the exact args are unclear.'
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
		warnings.push('dry_run ignored for read-only external gateway operations.');
	}
	if (
		typeof input.idempotency_key === 'string' &&
		input.idempotency_key.trim() &&
		!isWriteOp(canonicalOp)
	) {
		warnings.push('idempotency_key ignored for read-only external gateway operations.');
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
				idempotencyKey
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
					entityId: entityMeta.entityId
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
					errorPayload: response.error
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
	return GATEWAY_TOOL_DEFINITIONS.filter((tool) =>
		EXTERNAL_GATEWAY_TOOL_NAMES.has(tool.function.name as BuildosAgentGatewayToolName)
	).map((tool) => ({
		name: tool.function.name as BuildosAgentGatewayToolName,
		description: tool.function.description,
		inputSchema: tool.function.parameters ?? { type: 'object', properties: {} }
	}));
}

export async function executeBuildosAgentGatewayTool(params: {
	admin: any;
	userId: string;
	callerId?: string;
	callSessionId?: string;
	scope: AgentCallScope;
	toolName: BuildosAgentGatewayToolName;
	arguments?: Record<string, unknown>;
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
				...rewriteGatewayRecordPayloadForBuildosCall(
					buildExternalOpHelp(
						entry,
						'full',
						params.arguments?.include_schema !== false,
						params.arguments?.include_examples !== false
					)
				),
				type: 'tool_schema'
			} as Record<string, unknown>;
		}
		case 'buildos_call':
			return executeGatewayOp({
				...params,
				arguments: {
					...(params.arguments ?? {})
				}
			});
		case 'tool_help':
			return getExternalToolHelp(
				params.scope,
				typeof params.arguments?.path === 'string' ? params.arguments.path : 'root',
				{
					format: params.arguments?.format === 'full' ? 'full' : 'short',
					include_examples: params.arguments?.include_examples !== false,
					include_schemas: Boolean(params.arguments?.include_schemas)
				}
			);
		case 'tool_exec':
			return executeGatewayOp(params);
		default:
			return buildExecError(
				params.toolName,
				'NOT_FOUND',
				`Unsupported gateway tool: ${params.toolName}`,
				'root'
			);
	}
}
