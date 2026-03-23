// apps/web/src/lib/server/agent-call/public-tool-executor.ts
import { isValidUUID } from '@buildos/shared-types';
import type { AgentCallScope, BuildosAgentPublicToolName } from '@buildos/shared-types';
import { buildSearchFilter } from '$lib/utils/api-helpers';
import {
	ensureActorId,
	fetchProjectSummaries,
	type OntologyProjectSummary
} from '$lib/services/ontology/ontology-projects.service';

type ToolExecutionContext = {
	admin: any;
	userId: string;
	scope: AgentCallScope;
};

type VisibleProjectContext = {
	projects: OntologyProjectSummary[];
	projectMap: Map<string, OntologyProjectSummary>;
};

function clampLimit(value: unknown, fallback: number, min = 1, max = 50): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.floor(value)));
}

function normalizeMaxChars(value: unknown, fallback = 20000): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(50000, Math.max(500, Math.floor(value)));
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

async function loadVisibleProjects(context: ToolExecutionContext): Promise<VisibleProjectContext> {
	const actorId = await ensureActorId(context.admin, context.userId);
	const projects = await fetchProjectSummaries(context.admin, actorId);
	const projectMap = buildAllowedProjectSet(context.scope, projects);

	return {
		projects: Array.from(projectMap.values()),
		projectMap
	};
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

async function listProjects(context: ToolExecutionContext) {
	const visible = await loadVisibleProjects(context);
	return {
		projects: visible.projects.map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description,
			state_key: project.state_key,
			type_key: project.type_key,
			updated_at: project.updated_at,
			task_count: project.task_count,
			goal_count: project.goal_count,
			plan_count: project.plan_count,
			document_count: project.document_count,
			access_role: project.access_role,
			access_level: project.access_level
		})),
		total: visible.projects.length
	};
}

async function getProjectSnapshot(context: ToolExecutionContext, args: Record<string, unknown>) {
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
		project_id: project.id,
		snapshot: data ?? null
	};
}

async function searchEntities(context: ToolExecutionContext, args: Record<string, unknown>) {
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

	const taskFilter = buildSearchFilter(query, ['title', 'description']);
	const planFilter = buildSearchFilter(query, ['name', 'description']);
	const goalFilter = buildSearchFilter(query, ['name', 'description']);
	const documentFilter = buildSearchFilter(query, ['title', 'content']);

	const perTypeLimit = Math.max(2, Math.min(8, Math.ceil(limit / 2)));

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
					.select('id, project_id, title, content, state_key, updated_at')
					.in('project_id', projectIds)
					.is('deleted_at', null)
					.or(documentFilter)
					.order('updated_at', { ascending: false })
					.limit(perTypeLimit)
			: Promise.resolve({ data: [], error: null })
	]);

	for (const result of [tasks, plans, goals, documents]) {
		if (result.error) {
			throw new Error(result.error.message || 'Failed to search entities');
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
				typeof item.content === 'string' ? item.content.replace(/\s+/g, ' ').trim() : '',
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

async function listProjectTasks(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const limit = clampLimit(args.limit, 20, 1, 50);

	let query = context.admin
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at'
		)
		.eq('project_id', project.id)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (typeof args.state_key === 'string' && args.state_key.trim()) {
		query = query.eq('state_key', args.state_key.trim());
	}

	const { data, error } = await query;
	if (error) {
		throw new Error(error.message || 'Failed to list project tasks');
	}

	return {
		project_id: project.id,
		tasks: data ?? []
	};
}

async function listProjectDocuments(context: ToolExecutionContext, args: Record<string, unknown>) {
	const visible = await loadVisibleProjects(context);
	const project = assertAccessibleProject(visible.projectMap, args.project_id);
	const limit = clampLimit(args.limit, 20, 1, 50);

	const { data, error } = await context.admin
		.from('onto_documents')
		.select('id, project_id, title, state_key, created_at, updated_at')
		.eq('project_id', project.id)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (error) {
		throw new Error(error.message || 'Failed to list project documents');
	}

	return {
		project_id: project.id,
		documents: data ?? []
	};
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
		.select('id, project_id, title, content, state_key, created_at, updated_at')
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

	const body = truncateText(data.content, maxChars);

	return {
		document: {
			id: data.id,
			project_id: data.project_id,
			title: data.title,
			state_key: data.state_key,
			content: body.content,
			content_truncated: body.truncated,
			created_at: data.created_at,
			updated_at: data.updated_at
		}
	};
}

export async function executeBuildosAgentPublicTool(params: {
	admin: any;
	userId: string;
	scope: AgentCallScope;
	toolName: BuildosAgentPublicToolName;
	arguments?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
	const context: ToolExecutionContext = {
		admin: params.admin,
		userId: params.userId,
		scope: params.scope
	};
	const args = params.arguments ?? {};

	switch (params.toolName) {
		case 'list_projects':
			return listProjects(context);
		case 'get_project_snapshot':
			return getProjectSnapshot(context, args);
		case 'search_entities':
			return searchEntities(context, args);
		case 'list_project_tasks':
			return listProjectTasks(context, args);
		case 'list_project_documents':
			return listProjectDocuments(context, args);
		case 'get_document':
			return getDocument(context, args);
		default:
			throw new Error(
				`Unsupported public BuildOS agent tool: ${params.toolName satisfies never}`
			);
	}
}
