// apps/web/src/lib/server/agent-call/external-tool-gateway.ts
import { isValidUUID } from '@buildos/shared-types';
import type {
	AgentCallScope,
	BuildosAgentGatewayToolName,
	BuildosAgentToolDefinition
} from '@buildos/shared-types';
import { buildSearchFilter } from '$lib/utils/api-helpers';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';
import { GATEWAY_TOOL_DEFINITIONS } from '$lib/services/agentic-chat/tools/core/definitions/gateway';
import { getToolHelp } from '$lib/services/agentic-chat/tools/registry/tool-help';
import {
	getToolRegistry,
	type RegistryOp
} from '$lib/services/agentic-chat/tools/registry/tool-registry';
import {
	normalizeGatewayHelpPath,
	normalizeGatewayOpName
} from '$lib/services/agentic-chat/tools/registry/gateway-op-aliases';

type ToolExecutionContext = {
	admin: any;
	userId: string;
	scope: AgentCallScope;
};

type VisibleProjectContext = {
	projects: OntologyProjectSummary[];
	projectMap: Map<string, OntologyProjectSummary>;
};

type ExternalGatewayRegistryEntry = RegistryOp & {
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
	'tool_help',
	'tool_exec'
]);

const EXTERNAL_READ_ONLY_OPS = [
	'onto.project.list',
	'onto.project.search',
	'onto.project.get',
	'onto.task.list',
	'onto.task.search',
	'onto.task.get',
	'onto.document.list',
	'onto.document.search',
	'onto.document.get',
	'onto.search'
] as const;

const EXTERNAL_OP_HANDLERS: Record<
	(string & (typeof EXTERNAL_READ_ONLY_OPS)[number]) | (typeof EXTERNAL_READ_ONLY_OPS)[number],
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
		throw new Error('project_id must be a valid UUID');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new Error('Project is outside the allowed call scope');
	}

	return project;
}

function assertVisibleEntityProject(
	projectMap: Map<string, OntologyProjectSummary>,
	projectId: unknown
): OntologyProjectSummary {
	if (typeof projectId !== 'string' || !isValidUUID(projectId)) {
		throw new Error('Entity project_id is invalid');
	}

	const project = projectMap.get(projectId);
	if (!project) {
		throw new Error('Entity is outside the allowed call scope');
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
		throw new Error('query is required');
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
		throw new Error(error.message || 'Failed to load project snapshot');
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
		throw new Error(error.message || 'Failed to list tasks');
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
		throw new Error('task_id must be a valid UUID');
	}

	const visible = await loadVisibleProjects(context);
	if (visible.projects.length === 0) {
		throw new Error('Task not found');
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
		throw new Error(error.message || 'Failed to load task');
	}

	if (!data) {
		throw new Error('Task not found');
	}

	const project = assertVisibleEntityProject(visible.projectMap, data.project_id);

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
		throw new Error(error.message || 'Failed to list documents');
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
		throw new Error('document_id must be a valid UUID');
	}

	const maxChars = normalizeMaxChars(args.max_chars);
	const visible = await loadVisibleProjects(context);

	if (visible.projects.length === 0) {
		throw new Error('Document not found');
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
		throw new Error(error.message || 'Failed to load document');
	}

	if (!data) {
		throw new Error('Document not found');
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
		throw new Error('query is required');
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
			throw new Error(result.error.message || 'Failed to search ontology');
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
	const allowedOps = scope.mode === 'read_only' ? EXTERNAL_READ_ONLY_OPS : [];
	const ops: Record<string, ExternalGatewayRegistryEntry> = {};

	for (const op of allowedOps) {
		const entry = internalRegistry.ops[op];
		const handler = EXTERNAL_OP_HANDLERS[op];
		if (!entry || !handler) continue;
		ops[op] = {
			...entry,
			handler
		};
	}

	return {
		version: buildRegistryVersion(Object.keys(ops).sort()),
		ops
	};
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
			tool_help: {
				required: ['path'],
				shape: { path: '<help path>', format: 'short|full', include_schemas: false }
			},
			tool_exec: {
				required: ['op', 'args'],
				shape: {
					op: '<canonical op>',
					args: {
						/* required fields */
					}
				},
				critical_rules: [
					'Use tool_help before first-time or uncertain operations.',
					'Use canonical op names from tool_help.',
					'Discover exact IDs with list/search ops before get/update flows.'
				]
			}
		},
		items: listDirectoryChildren('root', registry.ops),
		workflow: [
			'1) Start with tool_help("root") or a narrow namespace like "onto.task".',
			'2) If an exact op is needed, inspect it with tool_help({ path: "<exact op>", format: "full", include_schemas: true }).',
			'3) Execute with tool_exec({ op: "<exact op>", args: { ... } }).'
		]
	};

	if (includeExamples) {
		rootHelp.examples = [
			{
				description: 'Inspect task list operations',
				tool_help: { path: 'onto.task', format: 'short' }
			},
			{
				description: 'List tasks for a project',
				tool_exec: {
					op: 'onto.task.list',
					args: { project_id: '<project_id_uuid>', limit: 20 }
				}
			}
		];
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

	if (registry.ops[normalized]) {
		return getToolHelp(normalized, {
			format,
			include_examples: includeExamples,
			include_schemas: includeSchemas
		});
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

function buildExecError(
	requestedOp: string,
	code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'FORBIDDEN' | 'INTERNAL',
	message: string,
	helpPath?: string
) {
	return {
		op: requestedOp,
		ok: false,
		error: {
			code,
			message,
			...(helpPath ? { help_path: helpPath } : {})
		}
	};
}

async function executeGatewayOp(params: {
	admin: any;
	userId: string;
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
	const entry = registry.ops[canonicalOp];
	if (!entry) {
		return buildExecError(
			requestedOp,
			'NOT_FOUND',
			`Unknown or disallowed op: ${requestedOp}`,
			'root'
		);
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

	const warnings: string[] = [];
	if (canonicalOp !== requestedOp) {
		warnings.push(`Normalized legacy op "${requestedOp}" to "${canonicalOp}".`);
	}
	if (input.dry_run === true) {
		warnings.push('dry_run ignored for read-only external gateway operations.');
	}
	if (typeof input.idempotency_key === 'string' && input.idempotency_key.trim()) {
		warnings.push('idempotency_key ignored for read-only external gateway operations.');
	}

	try {
		const result = await entry.handler(
			{
				admin: params.admin,
				userId: params.userId,
				scope: params.scope
			},
			opArgs
		);

		return {
			op: requestedOp,
			ok: true,
			result,
			meta: {
				...(canonicalOp !== requestedOp ? { executed_op: canonicalOp } : {}),
				...(warnings.length > 0 ? { warnings } : {})
			}
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tool execution failed';
		return buildExecError(requestedOp, 'INTERNAL', message, canonicalOp);
	}
}

export function getBuildosAgentGatewayTools(scope: AgentCallScope): BuildosAgentToolDefinition[] {
	if (scope.mode !== 'read_only') {
		return [];
	}

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
	scope: AgentCallScope;
	toolName: BuildosAgentGatewayToolName;
	arguments?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
	switch (params.toolName) {
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
