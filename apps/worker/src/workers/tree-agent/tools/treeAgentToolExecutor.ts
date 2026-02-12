// apps/worker/src/workers/tree-agent/tools/treeAgentToolExecutor.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import { isToolAllowedForContext, type TreeAgentContextType } from './treeAgentToolRegistry';

export type TreeAgentToolCall = {
	name: string;
	args: Record<string, unknown>;
	purpose?: string;
};

export type TreeAgentToolResult = {
	name: string;
	ok: boolean;
	result?: Json;
	error?: string;
	artifacts?: Record<string, string[]>;
	meta?: Record<string, unknown>;
};

export type TreeAgentToolContext = {
	supabase: SupabaseClient<Database>;
	actorId: string;
	userId: string;
	runId: string;
	workspaceProjectId: string | null;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	allowedProjects: Set<string>;
	defaultProjectId: string | null;
	toolNames: string[];
};

const DEFAULT_DOC_STATE: Database['public']['Enums']['document_state'] = 'draft';
const DEFAULT_TASK_STATE: Database['public']['Enums']['task_state'] = 'todo';
const DEFAULT_PROJECT_STATE: Database['public']['Enums']['project_state'] = 'active';
const TASK_DOCUMENT_REL = 'task_has_document';
const MAX_TOOL_CALLS_PER_ITERATION = 8;
const PROJECT_GRAPH_MAX_PER_TYPE = 200;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DOCUMENT_STATES: Database['public']['Enums']['document_state'][] = [
	'draft',
	'review',
	'published',
	'in_review',
	'ready',
	'archived'
];
const TASK_STATES: Database['public']['Enums']['task_state'][] = [
	'todo',
	'in_progress',
	'blocked',
	'done'
];
const PROJECT_STATES: Database['public']['Enums']['project_state'][] = [
	'planning',
	'active',
	'completed',
	'cancelled'
];
const GOAL_STATES: Database['public']['Enums']['goal_state'][] = [
	'draft',
	'active',
	'achieved',
	'abandoned'
];
const PLAN_STATES: Database['public']['Enums']['plan_state'][] = ['draft', 'active', 'completed'];
const MILESTONE_STATES: Database['public']['Enums']['milestone_state'][] = [
	'pending',
	'in_progress',
	'completed',
	'missed'
];
const RISK_STATES: Database['public']['Enums']['risk_state'][] = [
	'identified',
	'mitigated',
	'occurred',
	'closed'
];
const TREE_AGENT_RUN_STATUSES: Database['public']['Enums']['tree_agent_run_status'][] = [
	'queued',
	'running',
	'waiting_on_user',
	'completed',
	'stopped',
	'canceled',
	'failed'
];
const TREE_AGENT_NODE_STATUSES: Database['public']['Enums']['tree_agent_node_status'][] = [
	'planning',
	'delegating',
	'executing',
	'waiting',
	'aggregating',
	'completed',
	'failed',
	'blocked'
];
const TREE_AGENT_ROLE_STATES: Database['public']['Enums']['tree_agent_role_state'][] = [
	'planner',
	'executor'
];
const TREE_AGENT_ARTIFACT_TYPES: Database['public']['Enums']['tree_agent_artifact_type'][] = [
	'document',
	'json',
	'summary',
	'other'
];

const runOwnershipCache = new Map<string, string>();

function isJsonObject(value: unknown): value is Record<string, Json> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLimit(value: unknown, fallback: number, max: number): number {
	if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
	return Math.min(Math.max(Math.floor(value), 1), max);
}

function isUuid(value: string): boolean {
	return UUID_REGEX.test(value);
}

function asDocumentState(
	value: unknown
): Database['public']['Enums']['document_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return DOCUMENT_STATES.includes(value as Database['public']['Enums']['document_state'])
		? (value as Database['public']['Enums']['document_state'])
		: undefined;
}

function asTaskState(value: unknown): Database['public']['Enums']['task_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return TASK_STATES.includes(value as Database['public']['Enums']['task_state'])
		? (value as Database['public']['Enums']['task_state'])
		: undefined;
}

function asProjectState(value: unknown): Database['public']['Enums']['project_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return PROJECT_STATES.includes(value as Database['public']['Enums']['project_state'])
		? (value as Database['public']['Enums']['project_state'])
		: undefined;
}

function asGoalState(value: unknown): Database['public']['Enums']['goal_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return GOAL_STATES.includes(value as Database['public']['Enums']['goal_state'])
		? (value as Database['public']['Enums']['goal_state'])
		: undefined;
}

function asPlanState(value: unknown): Database['public']['Enums']['plan_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return PLAN_STATES.includes(value as Database['public']['Enums']['plan_state'])
		? (value as Database['public']['Enums']['plan_state'])
		: undefined;
}

function asMilestoneState(
	value: unknown
): Database['public']['Enums']['milestone_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return MILESTONE_STATES.includes(value as Database['public']['Enums']['milestone_state'])
		? (value as Database['public']['Enums']['milestone_state'])
		: undefined;
}

function asRiskState(value: unknown): Database['public']['Enums']['risk_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return RISK_STATES.includes(value as Database['public']['Enums']['risk_state'])
		? (value as Database['public']['Enums']['risk_state'])
		: undefined;
}

function asTreeAgentRunStatus(
	value: unknown
): Database['public']['Enums']['tree_agent_run_status'] | undefined {
	if (typeof value !== 'string') return undefined;
	return TREE_AGENT_RUN_STATUSES.includes(
		value as Database['public']['Enums']['tree_agent_run_status']
	)
		? (value as Database['public']['Enums']['tree_agent_run_status'])
		: undefined;
}

function asTreeAgentNodeStatus(
	value: unknown
): Database['public']['Enums']['tree_agent_node_status'] | undefined {
	if (typeof value !== 'string') return undefined;
	return TREE_AGENT_NODE_STATUSES.includes(
		value as Database['public']['Enums']['tree_agent_node_status']
	)
		? (value as Database['public']['Enums']['tree_agent_node_status'])
		: undefined;
}

function asTreeAgentRoleState(
	value: unknown
): Database['public']['Enums']['tree_agent_role_state'] | undefined {
	if (typeof value !== 'string') return undefined;
	return TREE_AGENT_ROLE_STATES.includes(
		value as Database['public']['Enums']['tree_agent_role_state']
	)
		? (value as Database['public']['Enums']['tree_agent_role_state'])
		: undefined;
}

function asTreeAgentArtifactType(
	value: unknown
): Database['public']['Enums']['tree_agent_artifact_type'] | undefined {
	if (typeof value !== 'string') return undefined;
	return TREE_AGENT_ARTIFACT_TYPES.includes(
		value as Database['public']['Enums']['tree_agent_artifact_type']
	)
		? (value as Database['public']['Enums']['tree_agent_artifact_type'])
		: undefined;
}

function augmentProps(base: unknown, runId: string): Record<string, Json> {
	const props: Record<string, Json> = isJsonObject(base) ? { ...base } : {};
	props.tree_agent_run_id = runId;
	return props;
}

async function getAccessibleProjectIds(params: {
	supabase: SupabaseClient<Database>;
	actorId: string;
	workspaceProjectId: string | null;
	contextProjectId: string | null;
}): Promise<Set<string>> {
	const { supabase, actorId, workspaceProjectId, contextProjectId } = params;
	const allowed = new Set<string>();
	if (workspaceProjectId) allowed.add(workspaceProjectId);

	const { data: memberships } = await supabase
		.from('onto_project_members')
		.select('project_id, removed_at')
		.eq('actor_id', actorId)
		.is('removed_at', null);

	const membershipIds = new Set<string>();
	for (const row of memberships ?? []) {
		if (row.project_id) {
			allowed.add(row.project_id);
			membershipIds.add(row.project_id);
		}
	}

	// Only allow a context project if the actor is a member.
	if (contextProjectId && membershipIds.has(contextProjectId)) {
		allowed.add(contextProjectId);
	}

	return allowed;
}

export async function createTreeAgentToolContext(params: {
	supabase: SupabaseClient<Database>;
	actorId: string;
	userId: string;
	runId: string;
	workspaceProjectId: string | null;
	contextType: TreeAgentContextType;
	contextProjectId: string | null;
	toolNames: string[];
}): Promise<TreeAgentToolContext> {
	const allowedProjects = await getAccessibleProjectIds({
		supabase: params.supabase,
		actorId: params.actorId,
		workspaceProjectId: params.workspaceProjectId,
		contextProjectId: params.contextProjectId
	});

	const defaultProjectId =
		params.contextType === 'project' && params.contextProjectId
			? params.contextProjectId
			: params.workspaceProjectId;

	return {
		...params,
		allowedProjects,
		defaultProjectId
	};
}

function resolveProjectId(
	requested: unknown,
	defaultProjectId: string | null,
	allowedProjects: Set<string>
): { projectId: string | null; error?: string } {
	if (typeof requested === 'string' && requested.trim()) {
		const pid = requested.trim();
		if (!allowedProjects.has(pid)) {
			return { projectId: null, error: 'unauthorized project_id' };
		}
		return { projectId: pid };
	}

	if (defaultProjectId && allowedProjects.has(defaultProjectId)) {
		return { projectId: defaultProjectId };
	}

	return { projectId: null, error: 'project_id is required' };
}

function resolveReadProjectId(
	ctx: TreeAgentToolContext,
	requested: unknown
): { projectId: string | null; error?: string } {
	if (typeof requested === 'string' && requested.trim()) {
		const pid = requested.trim();
		if (!ctx.allowedProjects.has(pid)) {
			return { projectId: null, error: 'unauthorized project_id' };
		}
		return { projectId: pid };
	}

	if (
		ctx.contextType === 'project' &&
		ctx.contextProjectId &&
		ctx.allowedProjects.has(ctx.contextProjectId)
	) {
		return { projectId: ctx.contextProjectId };
	}

	return { projectId: null };
}

async function ensureRunOwnedByUser(
	supabase: SupabaseClient<Database>,
	runId: string,
	userId: string
): Promise<boolean> {
	const cachedOwner = runOwnershipCache.get(runId);
	if (cachedOwner) return cachedOwner === userId;

	const { data } = await supabase
		.from('tree_agent_runs')
		.select('id, user_id')
		.eq('id', runId)
		.maybeSingle();
	if (!data?.user_id) return false;
	runOwnershipCache.set(runId, data.user_id);
	return data.user_id === userId;
}

async function getRunIdForNode(
	supabase: SupabaseClient<Database>,
	nodeId: string
): Promise<string | null> {
	const { data } = await supabase
		.from('tree_agent_nodes')
		.select('run_id')
		.eq('id', nodeId)
		.maybeSingle();
	return data?.run_id ?? null;
}

type EntityKind =
	| 'project'
	| 'task'
	| 'document'
	| 'goal'
	| 'plan'
	| 'milestone'
	| 'risk'
	| 'requirement';

const ENTITY_KIND_CONFIG: Record<
	EntityKind,
	{ table: string; projectField?: string; select: string; labelField: string }
> = {
	project: {
		table: 'onto_projects',
		select: 'id, name, description, state_key, type_key, updated_at',
		labelField: 'name'
	},
	task: {
		table: 'onto_tasks',
		projectField: 'project_id',
		select: 'id, project_id, title, description, state_key, type_key, priority, due_at, updated_at',
		labelField: 'title'
	},
	document: {
		table: 'onto_documents',
		projectField: 'project_id',
		select: 'id, project_id, title, description, state_key, type_key, updated_at',
		labelField: 'title'
	},
	goal: {
		table: 'onto_goals',
		projectField: 'project_id',
		select: 'id, project_id, name, description, state_key, target_date, updated_at',
		labelField: 'name'
	},
	plan: {
		table: 'onto_plans',
		projectField: 'project_id',
		select: 'id, project_id, name, description, state_key, type_key, updated_at',
		labelField: 'name'
	},
	milestone: {
		table: 'onto_milestones',
		projectField: 'project_id',
		select: 'id, project_id, title, description, state_key, due_at, updated_at',
		labelField: 'title'
	},
	risk: {
		table: 'onto_risks',
		projectField: 'project_id',
		select: 'id, project_id, title, impact, state_key, probability, updated_at',
		labelField: 'title'
	},
	requirement: {
		table: 'onto_requirements',
		projectField: 'project_id',
		select: 'id, project_id, text, type_key, priority, updated_at',
		labelField: 'text'
	}
};

function normalizeEntityKind(value: unknown): EntityKind | null {
	if (typeof value !== 'string') return null;
	const lowered = value.trim().toLowerCase();
	return lowered in ENTITY_KIND_CONFIG ? (lowered as EntityKind) : null;
}

async function getEntityProjectId(
	ctx: TreeAgentToolContext,
	kind: EntityKind,
	entityId: string
): Promise<string | null> {
	if (kind === 'project') return entityId;
	const config = ENTITY_KIND_CONFIG[kind];
	if (!config.projectField) return null;
	const projectField = config.projectField;
	const adminSb = ctx.supabase as any;

	const { data } = await adminSb
		.from(config.table)
		.select(projectField)
		.eq('id', entityId)
		.maybeSingle();

	return (data as Record<string, unknown> | null)?.[projectField] as string | null;
}

async function fetchEntitiesByKind(
	ctx: TreeAgentToolContext,
	kind: EntityKind,
	ids: string[]
): Promise<Array<Record<string, unknown>>> {
	if (!ids.length) return [];
	const config = ENTITY_KIND_CONFIG[kind];
	const adminSb = ctx.supabase as any;
	const { data, error } = await adminSb
		.from(config.table)
		.select(config.select)
		.in('id', ids)
		.limit(Math.min(ids.length, 200));
	if (error) throw error;

	const rows = (data ?? []) as Array<Record<string, unknown>>;
	const projectField = config.projectField;
	if (!projectField) return rows;
	return rows.filter((row) => {
		const pid = row[projectField] as string | null;
		return pid ? ctx.allowedProjects.has(pid) : false;
	});
}

function summarizeResult(result: Json | undefined): string {
	if (result === undefined || result === null) return 'no_result';
	if (Array.isArray(result)) return `array(${result.length})`;
	if (typeof result === 'object') return 'object';
	return typeof result;
}

// --------------------------------------------
// Tavily web search helper
// --------------------------------------------

type TavilySearchDepth = 'basic' | 'advanced';

type TavilySearchRequest = {
	query: string;
	search_depth?: TavilySearchDepth;
	max_results?: number;
	include_answer?: boolean;
	include_domains?: string[];
	exclude_domains?: string[];
	include_raw_content?: boolean;
	include_images?: boolean;
};

type TavilySearchResponse = {
	query: string;
	answer?: string;
	results?: Array<{
		title: string;
		url: string;
		content?: string;
		raw_content?: string;
		score?: number;
		published_date?: string;
	}>;
	follow_up_questions?: string[];
};

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS_CAP = 10;

function getTavilyApiKey(): string | null {
	return process.env.PRIVATE_TAVILY_API_KEY?.trim() || process.env.TAVILY_API_KEY?.trim() || null;
}

function normalizeDepth(depth: unknown): TavilySearchDepth {
	return depth === 'basic' || depth === 'advanced' ? depth : 'advanced';
}

function summarizeContent(content?: string): string | undefined {
	if (!content) return undefined;
	const compact = content.replace(/\s+/g, ' ').trim();
	return compact.length > 400 ? `${compact.slice(0, 400)}...` : compact;
}

async function tavilySearch(request: TavilySearchRequest): Promise<TavilySearchResponse> {
	const apiKey = getTavilyApiKey();
	if (!apiKey) {
		throw new Error('Tavily API key not configured (PRIVATE_TAVILY_API_KEY).');
	}

	const response = await fetch(TAVILY_SEARCH_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ ...request, api_key: apiKey })
	});

	if (!response.ok) {
		let errorPayload: unknown;
		try {
			errorPayload = await response.json();
		} catch {
			errorPayload = await response.text();
		}
		throw new Error(
			`Tavily search failed (${response.status} ${response.statusText}): ${JSON.stringify(errorPayload)}`
		);
	}

	return (await response.json()) as TavilySearchResponse;
}

// --------------------------------------------
// Tool execution
// --------------------------------------------

async function executeToolCall(
	ctx: TreeAgentToolContext,
	tool: TreeAgentToolCall
): Promise<TreeAgentToolResult> {
	if (
		!ctx.toolNames.includes(tool.name) ||
		!isToolAllowedForContext(tool.name, ctx.contextType)
	) {
		return { name: tool.name, ok: false, error: 'tool not allowed in this context' };
	}

	const args = tool.args ?? {};

	try {
		switch (tool.name) {
			// -------------------------
			// Ontology read
			// -------------------------
			case 'list_onto_projects': {
				const limit = safeLimit(args.limit, 20, 60);
				const stateKey = asProjectState(args.state_key);
				const typeKey = typeof args.type_key === 'string' ? args.type_key : undefined;

				let query = ctx.supabase
					.from('onto_projects')
					.select(
						'id, name, description, state_key, type_key, updated_at, facet_scale, facet_stage, facet_context'
					)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (ctx.allowedProjects.size) {
					query = query.in('id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);
				if (typeKey) query = query.eq('type_key', typeKey);

				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'search_onto_projects': {
				const search = typeof args.search === 'string' ? args.search.trim() : '';
				if (!search) return { name: tool.name, ok: false, error: 'search is required' };
				const limit = safeLimit(args.limit, 15, 50);
				const stateKey = asProjectState(args.state_key);
				const typeKey = typeof args.type_key === 'string' ? args.type_key : undefined;

				let query = ctx.supabase
					.from('onto_projects')
					.select('id, name, description, state_key, type_key, updated_at')
					.is('deleted_at', null)
					.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (ctx.allowedProjects.size) {
					query = query.in('id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);
				if (typeKey) query = query.eq('type_key', typeKey);

				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_project_details': {
				const projectId = typeof args.project_id === 'string' ? args.project_id : '';
				if (!projectId)
					return { name: tool.name, ok: false, error: 'project_id is required' };
				if (!ctx.allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized project_id' };
				}

				const { data: project, error: projectError } = await ctx.supabase
					.from('onto_projects')
					.select('*')
					.eq('id', projectId)
					.maybeSingle();
				if (projectError) throw projectError;
				if (!project) return { name: tool.name, ok: false, error: 'project not found' };

				const countTables = [
					'onto_tasks',
					'onto_documents',
					'onto_goals',
					'onto_plans',
					'onto_milestones',
					'onto_risks',
					'onto_requirements'
				] as const;

				const counts: Record<string, number> = {};
				for (const table of countTables) {
					const { count } = await ctx.supabase
						.from(table)
						.select('id', { count: 'exact', head: true })
						.eq('project_id', projectId)
						.is('deleted_at', null);
					counts[table] = count ?? 0;
				}

				return {
					name: tool.name,
					ok: true,
					result: {
						project,
						counts,
						message: `Loaded project ${projectId} with entity counts.`
					} as Json
				};
			}
			case 'get_onto_project_graph': {
				const projectId = typeof args.project_id === 'string' ? args.project_id : '';
				if (!projectId)
					return { name: tool.name, ok: false, error: 'project_id is required' };
				if (!ctx.allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized project_id' };
				}

				const maxPerType = PROJECT_GRAPH_MAX_PER_TYPE;

				const [
					projectRes,
					tasksRes,
					docsRes,
					goalsRes,
					plansRes,
					milestonesRes,
					risksRes,
					reqsRes,
					edgesRes
				] = await Promise.all([
					ctx.supabase
						.from('onto_projects')
						.select('*')
						.eq('id', projectId)
						.maybeSingle(),
					ctx.supabase
						.from('onto_tasks')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.order('updated_at', { ascending: false })
						.limit(maxPerType),
					ctx.supabase
						.from('onto_documents')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.order('updated_at', { ascending: false })
						.limit(maxPerType),
					ctx.supabase
						.from('onto_goals')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.limit(maxPerType),
					ctx.supabase
						.from('onto_plans')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.limit(maxPerType),
					ctx.supabase
						.from('onto_milestones')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.limit(maxPerType),
					ctx.supabase
						.from('onto_risks')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.limit(maxPerType),
					ctx.supabase
						.from('onto_requirements')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null)
						.limit(maxPerType),
					ctx.supabase
						.from('onto_edges')
						.select('*')
						.eq('project_id', projectId)
						.limit(maxPerType * 2)
				]);

				if (projectRes.error) throw projectRes.error;
				if (!projectRes.data) {
					return { name: tool.name, ok: false, error: 'project not found' };
				}

				for (const res of [
					tasksRes,
					docsRes,
					goalsRes,
					plansRes,
					milestonesRes,
					risksRes,
					reqsRes,
					edgesRes
				]) {
					if (res.error) throw res.error;
				}

				return {
					name: tool.name,
					ok: true,
					result: {
						project: projectRes.data,
						tasks: tasksRes.data ?? [],
						documents: docsRes.data ?? [],
						goals: goalsRes.data ?? [],
						plans: plansRes.data ?? [],
						milestones: milestonesRes.data ?? [],
						risks: risksRes.data ?? [],
						requirements: reqsRes.data ?? [],
						edges: edgesRes.data ?? [],
						truncated: true,
						limit_per_type: maxPerType
					} as Json
				};
			}
			case 'list_onto_documents': {
				const limit = safeLimit(args.limit, 20, 80);
				const stateKey = asDocumentState(args.state_key);
				const typeKey = typeof args.type_key === 'string' ? args.type_key : undefined;
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_documents')
					.select('id, project_id, title, description, type_key, state_key, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);
				if (typeKey) query = query.eq('type_key', typeKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'search_onto_documents': {
				const search = typeof args.search === 'string' ? args.search.trim() : '';
				if (!search) return { name: tool.name, ok: false, error: 'search is required' };
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asDocumentState(args.state_key);
				const typeKey = typeof args.type_key === 'string' ? args.type_key : undefined;
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_documents')
					.select('id, project_id, title, description, type_key, state_key, updated_at')
					.is('deleted_at', null)
					.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);
				if (typeKey) query = query.eq('type_key', typeKey);

				const { data, error: searchError } = await query;
				if (searchError) throw searchError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_document_details': {
				const documentId = typeof args.document_id === 'string' ? args.document_id : '';
				if (!documentId)
					return { name: tool.name, ok: false, error: 'document_id is required' };

				const { data, error } = await ctx.supabase
					.from('onto_documents')
					.select('*')
					.eq('id', documentId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'document not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized document' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_tasks': {
				const limit = safeLimit(args.limit, 20, 80);
				const stateKey = asTaskState(args.state_key);
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_tasks')
					.select(
						'id, project_id, title, description, state_key, type_key, priority, due_at, updated_at'
					)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'search_onto_tasks': {
				const search = typeof args.search === 'string' ? args.search.trim() : '';
				if (!search) return { name: tool.name, ok: false, error: 'search is required' };
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asTaskState(args.state_key);
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_tasks')
					.select(
						'id, project_id, title, description, state_key, type_key, priority, due_at, updated_at'
					)
					.is('deleted_at', null)
					.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
					.order('updated_at', { ascending: false })
					.limit(limit);

				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);

				const { data, error: searchError } = await query;
				if (searchError) throw searchError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_task_details': {
				const taskId = typeof args.task_id === 'string' ? args.task_id : '';
				if (!taskId) return { name: tool.name, ok: false, error: 'task_id is required' };
				if (!isUuid(taskId))
					return { name: tool.name, ok: false, error: 'Invalid task_id: expected UUID' };

				const { data, error } = await ctx.supabase
					.from('onto_tasks')
					.select('*')
					.eq('id', taskId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'task not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized task' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_goals': {
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asGoalState(args.state_key);
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_goals')
					.select('id, project_id, name, description, state_key, target_date, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_goal_details': {
				const goalId = typeof args.goal_id === 'string' ? args.goal_id : '';
				if (!goalId) return { name: tool.name, ok: false, error: 'goal_id is required' };

				const { data, error } = await ctx.supabase
					.from('onto_goals')
					.select('*')
					.eq('id', goalId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'goal not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized goal' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_plans': {
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asPlanState(args.state_key);
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_plans')
					.select('id, project_id, name, description, state_key, type_key, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_plan_details': {
				const planId = typeof args.plan_id === 'string' ? args.plan_id : '';
				if (!planId) return { name: tool.name, ok: false, error: 'plan_id is required' };

				const { data, error } = await ctx.supabase
					.from('onto_plans')
					.select('*')
					.eq('id', planId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'plan not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized plan' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_milestones': {
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asMilestoneState(args.state_key);
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_milestones')
					.select('id, project_id, title, description, state_key, due_at, updated_at')
					.is('deleted_at', null)
					.order('due_at', { ascending: true })
					.limit(limit);
				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_milestone_details': {
				const milestoneId = typeof args.milestone_id === 'string' ? args.milestone_id : '';
				if (!milestoneId) {
					return { name: tool.name, ok: false, error: 'milestone_id is required' };
				}

				const { data, error } = await ctx.supabase
					.from('onto_milestones')
					.select('*')
					.eq('id', milestoneId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'milestone not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized milestone' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_risks': {
				const limit = safeLimit(args.limit, 15, 60);
				const stateKey = asRiskState(args.state_key);
				const impact = typeof args.impact === 'string' ? args.impact : undefined;
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_risks')
					.select('id, project_id, title, impact, state_key, probability, updated_at')
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
					.limit(limit);
				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (stateKey) query = query.eq('state_key', stateKey);
				if (impact) query = query.eq('impact', impact);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_risk_details': {
				const riskId = typeof args.risk_id === 'string' ? args.risk_id : '';
				if (!riskId) return { name: tool.name, ok: false, error: 'risk_id is required' };

				const { data, error } = await ctx.supabase
					.from('onto_risks')
					.select('*')
					.eq('id', riskId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'risk not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized risk' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_onto_requirements': {
				const limit = safeLimit(args.limit, 20, 80);
				const typeKey = typeof args.type_key === 'string' ? args.type_key : undefined;
				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };

				let query = ctx.supabase
					.from('onto_requirements')
					.select('id, project_id, text, type_key, priority, updated_at')
					.is('deleted_at', null)
					.order('priority', { ascending: true })
					.limit(limit);
				if (projectId) {
					query = query.eq('project_id', projectId);
				} else if (ctx.allowedProjects.size) {
					query = query.in('project_id', Array.from(ctx.allowedProjects));
				}
				if (typeKey) query = query.eq('type_key', typeKey);

				const { data, error: listError } = await query;
				if (listError) throw listError;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_onto_requirement_details': {
				const requirementId =
					typeof args.requirement_id === 'string' ? args.requirement_id : '';
				if (!requirementId) {
					return { name: tool.name, ok: false, error: 'requirement_id is required' };
				}

				const { data, error } = await ctx.supabase
					.from('onto_requirements')
					.select('*')
					.eq('id', requirementId)
					.maybeSingle();
				if (error) throw error;
				if (!data) return { name: tool.name, ok: false, error: 'requirement not found' };
				if (!ctx.allowedProjects.has(data.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized requirement' };
				}
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'list_task_documents': {
				const taskId = typeof args.task_id === 'string' ? args.task_id : '';
				if (!taskId) return { name: tool.name, ok: false, error: 'task_id is required' };
				if (!isUuid(taskId))
					return { name: tool.name, ok: false, error: 'Invalid task_id: expected UUID' };
				const limit = safeLimit(args.limit, 20, 80);

				const { data: task, error: taskError } = await ctx.supabase
					.from('onto_tasks')
					.select('project_id')
					.eq('id', taskId)
					.maybeSingle();
				if (taskError) throw taskError;
				if (!task?.project_id || !ctx.allowedProjects.has(task.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized task' };
				}

				const { data: edges, error: edgeError } = await ctx.supabase
					.from('onto_edges')
					.select('*')
					.eq('src_kind', 'task')
					.eq('src_id', taskId)
					.eq('rel', TASK_DOCUMENT_REL)
					.limit(limit);
				if (edgeError) throw edgeError;

				const docIds = (edges ?? []).map((e) => e.dst_id);
				if (!docIds.length) return { name: tool.name, ok: true, result: [] };

				const { data: docs, error: docError } = await ctx.supabase
					.from('onto_documents')
					.select('*')
					.in('id', docIds)
					.is('deleted_at', null);
				if (docError) throw docError;

				const docMap = new Map((docs ?? []).map((d) => [d.id, d]));
				const combined = (edges ?? [])
					.map((edge) => ({ edge, document: docMap.get(edge.dst_id) }))
					.filter((row) => Boolean(row.document));

				return { name: tool.name, ok: true, result: combined as unknown as Json };
			}
			case 'get_entity_relationships': {
				const entityKind = normalizeEntityKind(args.entity_kind);
				const entityId = typeof args.entity_id === 'string' ? args.entity_id : '';
				if (!entityKind || !entityId) {
					return {
						name: tool.name,
						ok: false,
						error: 'entity_kind and entity_id are required'
					};
				}

				const projectId = await getEntityProjectId(ctx, entityKind, entityId);
				if (!projectId || !ctx.allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized entity' };
				}

				const rel = typeof args.rel === 'string' ? args.rel : undefined;
				const direction =
					args.direction === 'in' || args.direction === 'out' ? args.direction : 'both';

				let query = ctx.supabase.from('onto_edges').select('*').eq('project_id', projectId);
				if (rel) query = query.eq('rel', rel);
				if (direction === 'out') query = query.eq('src_id', entityId);
				else if (direction === 'in') query = query.eq('dst_id', entityId);
				else query = query.or(`src_id.eq.${entityId},dst_id.eq.${entityId}`);

				const { data, error } = await query.limit(200);
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_linked_entities': {
				const entityKind = normalizeEntityKind(args.entity_kind);
				const entityId = typeof args.entity_id === 'string' ? args.entity_id : '';
				if (!entityKind || !entityId) {
					return {
						name: tool.name,
						ok: false,
						error: 'entity_kind and entity_id are required'
					};
				}

				const projectId = await getEntityProjectId(ctx, entityKind, entityId);
				if (!projectId || !ctx.allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized entity' };
				}

				const rel = typeof args.rel === 'string' ? args.rel : undefined;
				const direction =
					args.direction === 'in' || args.direction === 'out' ? args.direction : 'both';
				const entityTypes = Array.isArray(args.entity_types)
					? args.entity_types.map((t) => normalizeEntityKind(t)).filter(Boolean)
					: null;
				const limit = safeLimit(args.limit, 40, 120);

				let edgeQuery = ctx.supabase
					.from('onto_edges')
					.select('*')
					.eq('project_id', projectId)
					.limit(limit);
				if (rel) edgeQuery = edgeQuery.eq('rel', rel);
				if (direction === 'out') edgeQuery = edgeQuery.eq('src_id', entityId);
				else if (direction === 'in') edgeQuery = edgeQuery.eq('dst_id', entityId);
				else edgeQuery = edgeQuery.or(`src_id.eq.${entityId},dst_id.eq.${entityId}`);

				const { data: edges, error: edgeError } = await edgeQuery;
				if (edgeError) throw edgeError;

				const linksByKind = new Map<EntityKind, Set<string>>();
				for (const edge of edges ?? []) {
					const otherKind =
						edge.src_id === entityId
							? normalizeEntityKind(edge.dst_kind)
							: normalizeEntityKind(edge.src_kind);
					const otherId = edge.src_id === entityId ? edge.dst_id : edge.src_id;
					if (!otherKind) continue;
					if (entityTypes && !entityTypes.includes(otherKind)) continue;
					if (!linksByKind.has(otherKind)) linksByKind.set(otherKind, new Set());
					linksByKind.get(otherKind)?.add(otherId);
				}

				const linked: Record<string, Array<Record<string, unknown>>> = {};
				for (const [kind, ids] of linksByKind.entries()) {
					linked[kind] = await fetchEntitiesByKind(ctx, kind, Array.from(ids));
				}

				return {
					name: tool.name,
					ok: true,
					result: {
						project_id: projectId,
						edges: edges ?? [],
						linked
					} as Json
				};
			}
			case 'search_ontology': {
				const search = typeof args.search === 'string' ? args.search.trim() : '';
				if (!search) return { name: tool.name, ok: false, error: 'search is required' };
				const limit = safeLimit(args.limit, 12, 40);
				const entityTypes = Array.isArray(args.entity_types)
					? args.entity_types.map((t) => normalizeEntityKind(t)).filter(Boolean)
					: null;

				const { projectId, error } = resolveReadProjectId(ctx, args.project_id);
				if (error) return { name: tool.name, ok: false, error };
				const projectIds = projectId ? [projectId] : Array.from(ctx.allowedProjects);
				if (!projectIds.length)
					return { name: tool.name, ok: false, error: 'no accessible projects' };

				const includeKind = (kind: EntityKind) =>
					!entityTypes || entityTypes.includes(kind);

				const [tasksRes, docsRes, goalsRes, plansRes, milestonesRes, risksRes, reqsRes] =
					await Promise.all([
						includeKind('task')
							? ctx.supabase
									.from('onto_tasks')
									.select(
										'id, project_id, title, description, state_key, type_key, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('document')
							? ctx.supabase
									.from('onto_documents')
									.select(
										'id, project_id, title, description, state_key, type_key, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('goal')
							? ctx.supabase
									.from('onto_goals')
									.select(
										'id, project_id, name, description, state_key, target_date, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('plan')
							? ctx.supabase
									.from('onto_plans')
									.select(
										'id, project_id, name, description, state_key, type_key, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`name.ilike.%${search}%,description.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('milestone')
							? ctx.supabase
									.from('onto_milestones')
									.select(
										'id, project_id, title, description, state_key, due_at, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('risk')
							? ctx.supabase
									.from('onto_risks')
									.select(
										'id, project_id, title, content, impact, state_key, updated_at'
									)
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.or(`title.ilike.%${search}%,content.ilike.%${search}%`)
									.order('updated_at', { ascending: false })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null }),
						includeKind('requirement')
							? ctx.supabase
									.from('onto_requirements')
									.select('id, project_id, text, type_key, priority, updated_at')
									.in('project_id', projectIds)
									.is('deleted_at', null)
									.ilike('text', `%${search}%`)
									.order('priority', { ascending: true })
									.limit(limit)
							: Promise.resolve({ data: [] as unknown[], error: null })
					]);

				for (const res of [
					tasksRes,
					docsRes,
					goalsRes,
					plansRes,
					milestonesRes,
					risksRes,
					reqsRes
				]) {
					if (res.error) throw res.error;
				}

				return {
					name: tool.name,
					ok: true,
					result: {
						search,
						project_ids: projectIds,
						results: {
							tasks: tasksRes.data ?? [],
							documents: docsRes.data ?? [],
							goals: goalsRes.data ?? [],
							plans: plansRes.data ?? [],
							milestones: milestonesRes.data ?? [],
							risks: risksRes.data ?? [],
							requirements: reqsRes.data ?? []
						}
					} as Json
				};
			}

			// -------------------------
			// Ontology write
			// -------------------------
			case 'create_onto_project': {
				const name = typeof args.name === 'string' ? args.name.trim() : '';
				if (!name) return { name: tool.name, ok: false, error: 'name is required' };
				const stateKey = asProjectState(args.state_key) ?? DEFAULT_PROJECT_STATE;
				const typeKey =
					typeof args.type_key === 'string' ? args.type_key : 'project.general';
				const props = augmentProps(args.props, ctx.runId);

				const { data: project, error: projectError } = await ctx.supabase
					.from('onto_projects')
					.insert({
						name,
						description: typeof args.description === 'string' ? args.description : null,
						state_key: stateKey,
						type_key: typeKey,
						created_by: ctx.actorId,
						props
					})
					.select('*')
					.single();
				if (projectError || !project?.id) {
					throw new Error(projectError?.message ?? 'Failed to create project');
				}

				const { error: memberError } = await ctx.supabase
					.from('onto_project_members')
					.insert({
						project_id: project.id,
						actor_id: ctx.actorId,
						role_key: 'owner',
						access: 'admin',
						added_by_actor_id: ctx.actorId
					});
				if (memberError) throw memberError;

				ctx.allowedProjects.add(project.id);

				return {
					name: tool.name,
					ok: true,
					result: project as Json,
					artifacts: { created_projects: [project.id] }
				};
			}
			case 'update_onto_project': {
				const projectId = typeof args.project_id === 'string' ? args.project_id : '';
				if (!projectId)
					return { name: tool.name, ok: false, error: 'project_id is required' };
				if (!ctx.allowedProjects.has(projectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized project_id' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.name === 'string' && args.name.trim())
					updatePayload.name = args.name.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				const stateKey = asProjectState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_projects')
					.update(updatePayload)
					.eq('id', projectId)
					.select('*')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? null) as Json };
			}
			case 'create_onto_document': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };

				const title =
					typeof args.title === 'string' && args.title.trim()
						? args.title.trim()
						: 'Untitled Document';
				const stateKey = asDocumentState(args.state_key) ?? DEFAULT_DOC_STATE;
				const typeKey =
					typeof args.type_key === 'string' ? args.type_key : 'document.general';
				const props = augmentProps(args.props, ctx.runId);

				if (typeof args.parent_document_id === 'string' && args.parent_document_id) {
					const { data: parent } = await ctx.supabase
						.from('onto_documents')
						.select('id, project_id')
						.eq('id', args.parent_document_id)
						.maybeSingle();
					if (!parent?.id || parent.project_id !== projectId) {
						return {
							name: tool.name,
							ok: false,
							error: 'parent_document_id must belong to the same project'
						};
					}
					props.parent_document_id = parent.id;
				}

				const payload = {
					project_id: projectId,
					title,
					description: typeof args.description === 'string' ? args.description : null,
					content: typeof args.content === 'string' ? args.content : null,
					state_key: stateKey,
					type_key: typeKey,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_documents')
					.insert(payload)
					.select('id, title, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_documents: [data.id] }
				};
			}
			case 'update_onto_document': {
				const documentId = typeof args.document_id === 'string' ? args.document_id : '';
				if (!documentId)
					return { name: tool.name, ok: false, error: 'document_id is required' };

				const { data: doc } = await ctx.supabase
					.from('onto_documents')
					.select('project_id')
					.eq('id', documentId)
					.maybeSingle();
				if (!doc?.project_id || !ctx.allowedProjects.has(doc.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized document' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.title === 'string' && args.title.trim())
					updatePayload.title = args.title.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				if (args.content !== undefined) updatePayload.content = args.content;
				const stateKey = asDocumentState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_documents')
					.update(updatePayload)
					.eq('id', documentId)
					.select('id, title, updated_at')
					.maybeSingle();
				if (error) throw error;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { updated_documents: data?.id ? [data.id] : [] }
				};
			}
			case 'create_onto_task': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };

				const stateKey = asTaskState(args.state_key) ?? DEFAULT_TASK_STATE;
				const typeKey = typeof args.type_key === 'string' ? args.type_key : 'task.execute';
				const props = augmentProps(args.props, ctx.runId);
				const payload = {
					project_id: projectId,
					title:
						typeof args.title === 'string' && args.title.trim()
							? args.title.trim()
							: 'Untitled Task',
					description: typeof args.description === 'string' ? args.description : null,
					state_key: stateKey,
					type_key: typeKey,
					priority: typeof args.priority === 'number' ? args.priority : null,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_tasks')
					.insert(payload)
					.select('id, title, project_id')
					.single();
				if (insertError) throw insertError;

				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_tasks: [data.id] }
				};
			}
			case 'update_onto_task': {
				const taskId = typeof args.task_id === 'string' ? args.task_id : '';
				if (!taskId) return { name: tool.name, ok: false, error: 'task_id is required' };
				if (!isUuid(taskId))
					return { name: tool.name, ok: false, error: 'Invalid task_id: expected UUID' };

				const { data: task } = await ctx.supabase
					.from('onto_tasks')
					.select('project_id')
					.eq('id', taskId)
					.maybeSingle();
				if (!task?.project_id || !ctx.allowedProjects.has(task.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized task' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.title === 'string' && args.title.trim())
					updatePayload.title = args.title.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				const stateKey = asTaskState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (typeof args.priority === 'number') updatePayload.priority = args.priority;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_tasks')
					.update(updatePayload)
					.eq('id', taskId)
					.select('id, title, updated_at')
					.maybeSingle();
				if (error) throw error;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { updated_tasks: data?.id ? [data.id] : [] }
				};
			}
			case 'create_onto_goal': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };

				const name =
					typeof args.name === 'string' && args.name.trim() ? args.name.trim() : '';
				if (!name) return { name: tool.name, ok: false, error: 'name is required' };
				const stateKey = asGoalState(args.state_key) ?? 'active';
				const props = augmentProps(args.props, ctx.runId);

				const payload = {
					project_id: projectId,
					name,
					description: typeof args.description === 'string' ? args.description : null,
					goal: typeof args.goal === 'string' ? args.goal : null,
					state_key: stateKey,
					target_date: typeof args.target_date === 'string' ? args.target_date : null,
					created_by: ctx.actorId,
					props,
					type_key: typeof args.type_key === 'string' ? args.type_key : null
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_goals')
					.insert(payload)
					.select('id, name, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_goals: [data.id] }
				};
			}
			case 'update_onto_goal': {
				const goalId = typeof args.goal_id === 'string' ? args.goal_id : '';
				if (!goalId) return { name: tool.name, ok: false, error: 'goal_id is required' };

				const { data: goal } = await ctx.supabase
					.from('onto_goals')
					.select('project_id')
					.eq('id', goalId)
					.maybeSingle();
				if (!goal?.project_id || !ctx.allowedProjects.has(goal.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized goal' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.name === 'string' && args.name.trim())
					updatePayload.name = args.name.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				if (args.goal !== undefined) updatePayload.goal = args.goal;
				const stateKey = asGoalState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.target_date === 'string')
					updatePayload.target_date = args.target_date;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_goals')
					.update(updatePayload)
					.eq('id', goalId)
					.select('id, name, updated_at')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_onto_plan': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };
				const name =
					typeof args.name === 'string' && args.name.trim() ? args.name.trim() : '';
				if (!name) return { name: tool.name, ok: false, error: 'name is required' };

				const stateKey = asPlanState(args.state_key) ?? 'active';
				const typeKey = typeof args.type_key === 'string' ? args.type_key : 'plan.general';
				const props = augmentProps(args.props, ctx.runId);

				const payload = {
					project_id: projectId,
					name,
					description: typeof args.description === 'string' ? args.description : null,
					plan: typeof args.plan === 'string' ? args.plan : null,
					state_key: stateKey,
					type_key: typeKey,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_plans')
					.insert(payload)
					.select('id, name, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_plans: [data.id] }
				};
			}
			case 'update_onto_plan': {
				const planId = typeof args.plan_id === 'string' ? args.plan_id : '';
				if (!planId) return { name: tool.name, ok: false, error: 'plan_id is required' };

				const { data: plan } = await ctx.supabase
					.from('onto_plans')
					.select('project_id')
					.eq('id', planId)
					.maybeSingle();
				if (!plan?.project_id || !ctx.allowedProjects.has(plan.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized plan' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.name === 'string' && args.name.trim())
					updatePayload.name = args.name.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				if (args.plan !== undefined) updatePayload.plan = args.plan;
				const stateKey = asPlanState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_plans')
					.update(updatePayload)
					.eq('id', planId)
					.select('id, name, updated_at')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_onto_milestone': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };
				const title =
					typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '';
				if (!title) return { name: tool.name, ok: false, error: 'title is required' };

				const stateKey = asMilestoneState(args.state_key) ?? 'pending';
				const props = augmentProps(args.props, ctx.runId);

				const payload = {
					project_id: projectId,
					title,
					description: typeof args.description === 'string' ? args.description : null,
					milestone: typeof args.milestone === 'string' ? args.milestone : null,
					due_at: typeof args.due_at === 'string' ? args.due_at : null,
					state_key: stateKey,
					type_key: typeof args.type_key === 'string' ? args.type_key : null,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_milestones')
					.insert(payload)
					.select('id, title, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_milestones: [data.id] }
				};
			}
			case 'update_onto_milestone': {
				const milestoneId = typeof args.milestone_id === 'string' ? args.milestone_id : '';
				if (!milestoneId) {
					return { name: tool.name, ok: false, error: 'milestone_id is required' };
				}

				const { data: milestone } = await ctx.supabase
					.from('onto_milestones')
					.select('project_id')
					.eq('id', milestoneId)
					.maybeSingle();
				if (!milestone?.project_id || !ctx.allowedProjects.has(milestone.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized milestone' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.title === 'string' && args.title.trim())
					updatePayload.title = args.title.trim();
				if (args.description !== undefined) updatePayload.description = args.description;
				if (args.milestone !== undefined) updatePayload.milestone = args.milestone;
				if (typeof args.due_at === 'string') updatePayload.due_at = args.due_at;
				const stateKey = asMilestoneState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_milestones')
					.update(updatePayload)
					.eq('id', milestoneId)
					.select('id, title, updated_at')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_onto_risk': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };
				const title =
					typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '';
				if (!title) return { name: tool.name, ok: false, error: 'title is required' };

				const stateKey = asRiskState(args.state_key) ?? 'identified';
				const props = augmentProps(args.props, ctx.runId);
				const payload = {
					project_id: projectId,
					title,
					content: typeof args.content === 'string' ? args.content : null,
					impact: typeof args.impact === 'string' ? args.impact : 'medium',
					probability: typeof args.probability === 'number' ? args.probability : null,
					state_key: stateKey,
					type_key: typeof args.type_key === 'string' ? args.type_key : null,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_risks')
					.insert(payload)
					.select('id, title, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_risks: [data.id] }
				};
			}
			case 'update_onto_risk': {
				const riskId = typeof args.risk_id === 'string' ? args.risk_id : '';
				if (!riskId) return { name: tool.name, ok: false, error: 'risk_id is required' };

				const { data: risk } = await ctx.supabase
					.from('onto_risks')
					.select('project_id')
					.eq('id', riskId)
					.maybeSingle();
				if (!risk?.project_id || !ctx.allowedProjects.has(risk.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized risk' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.title === 'string' && args.title.trim())
					updatePayload.title = args.title.trim();
				if (args.content !== undefined) updatePayload.content = args.content;
				if (typeof args.impact === 'string') updatePayload.impact = args.impact;
				if (typeof args.probability === 'number')
					updatePayload.probability = args.probability;
				const stateKey = asRiskState(args.state_key);
				if (stateKey) updatePayload.state_key = stateKey;
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_risks')
					.update(updatePayload)
					.eq('id', riskId)
					.select('id, title, updated_at')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_onto_requirement': {
				const { projectId, error } = resolveProjectId(
					args.project_id,
					ctx.defaultProjectId,
					ctx.allowedProjects
				);
				if (!projectId || error) return { name: tool.name, ok: false, error };
				const text =
					typeof args.text === 'string' && args.text.trim() ? args.text.trim() : '';
				if (!text) return { name: tool.name, ok: false, error: 'text is required' };

				const props = augmentProps(args.props, ctx.runId);
				const payload = {
					project_id: projectId,
					text,
					type_key:
						typeof args.type_key === 'string' ? args.type_key : 'requirement.general',
					priority: typeof args.priority === 'number' ? args.priority : null,
					created_by: ctx.actorId,
					props
				};

				const { data, error: insertError } = await ctx.supabase
					.from('onto_requirements')
					.insert(payload)
					.select('id, text, project_id')
					.single();
				if (insertError) throw insertError;
				return {
					name: tool.name,
					ok: true,
					result: data as Json,
					artifacts: { created_requirements: [data.id] }
				};
			}
			case 'update_onto_requirement': {
				const requirementId =
					typeof args.requirement_id === 'string' ? args.requirement_id : '';
				if (!requirementId) {
					return { name: tool.name, ok: false, error: 'requirement_id is required' };
				}

				const { data: requirement } = await ctx.supabase
					.from('onto_requirements')
					.select('project_id')
					.eq('id', requirementId)
					.maybeSingle();
				if (!requirement?.project_id || !ctx.allowedProjects.has(requirement.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized requirement' };
				}

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.text === 'string' && args.text.trim())
					updatePayload.text = args.text.trim();
				if (typeof args.type_key === 'string') updatePayload.type_key = args.type_key;
				if (typeof args.priority === 'number') updatePayload.priority = args.priority;
				if (isJsonObject(args.props))
					updatePayload.props = augmentProps(args.props, ctx.runId);

				const { data, error } = await ctx.supabase
					.from('onto_requirements')
					.update(updatePayload)
					.eq('id', requirementId)
					.select('id, text, updated_at')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_task_document': {
				const taskId = typeof args.task_id === 'string' ? args.task_id : '';
				if (!taskId) return { name: tool.name, ok: false, error: 'task_id is required' };
				if (!isUuid(taskId))
					return { name: tool.name, ok: false, error: 'Invalid task_id: expected UUID' };

				const { data: task, error: taskError } = await ctx.supabase
					.from('onto_tasks')
					.select('id, project_id, title')
					.eq('id', taskId)
					.maybeSingle();
				if (taskError) throw taskError;
				if (!task?.project_id || !ctx.allowedProjects.has(task.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized task' };
				}

				let documentId = typeof args.document_id === 'string' ? args.document_id : '';
				if (documentId) {
					if (!isUuid(documentId)) {
						return {
							name: tool.name,
							ok: false,
							error: 'Invalid document_id: expected UUID'
						};
					}
					const { data: existingDoc } = await ctx.supabase
						.from('onto_documents')
						.select('id, project_id')
						.eq('id', documentId)
						.maybeSingle();
					if (!existingDoc?.id || existingDoc.project_id !== task.project_id) {
						return {
							name: tool.name,
							ok: false,
							error: 'document_id must belong to the same project as the task'
						};
					}
				} else {
					const stateKey = asDocumentState(args.state_key) ?? DEFAULT_DOC_STATE;
					const typeKey =
						typeof args.type_key === 'string' ? args.type_key : 'document.task.note';
					const props = augmentProps(args.props, ctx.runId);
					const title =
						typeof args.title === 'string' && args.title.trim()
							? args.title.trim()
							: `Task Doc: ${task.title}`;

					const { data: doc, error: docError } = await ctx.supabase
						.from('onto_documents')
						.insert({
							project_id: task.project_id,
							title,
							description:
								typeof args.description === 'string' ? args.description : null,
							content: typeof args.content === 'string' ? args.content : null,
							state_key: stateKey,
							type_key: typeKey,
							created_by: ctx.actorId,
							props
						})
						.select('id, title')
						.single();
					if (docError || !doc?.id)
						throw new Error(docError?.message ?? 'Failed to create document');
					documentId = doc.id;
				}

				const edgeProps = isJsonObject(args.props) ? { ...args.props } : {};
				if (typeof args.role === 'string' && args.role) edgeProps.role = args.role;
				edgeProps.tree_agent_run_id = ctx.runId;

				const { data: edge, error: edgeError } = await ctx.supabase
					.from('onto_edges')
					.insert({
						project_id: task.project_id,
						src_kind: 'task',
						src_id: task.id,
						dst_kind: 'document',
						dst_id: documentId,
						rel: TASK_DOCUMENT_REL,
						props: edgeProps
					})
					.select('*')
					.single();
				if (edgeError) throw edgeError;

				return {
					name: tool.name,
					ok: true,
					result: { task_id: task.id, document_id: documentId, edge } as Json,
					artifacts: { created_documents: documentId ? [documentId] : [] }
				};
			}
			case 'link_onto_entities': {
				const srcKind = normalizeEntityKind(args.src_kind);
				const dstKind = normalizeEntityKind(args.dst_kind);
				const srcId = typeof args.src_id === 'string' ? args.src_id : '';
				const dstId = typeof args.dst_id === 'string' ? args.dst_id : '';
				const rel = typeof args.rel === 'string' ? args.rel : '';
				if (!srcKind || !dstKind || !srcId || !dstId || !rel) {
					return {
						name: tool.name,
						ok: false,
						error: 'src_kind, src_id, dst_kind, dst_id, and rel are required'
					};
				}

				const srcProjectId = await getEntityProjectId(ctx, srcKind, srcId);
				const dstProjectId = await getEntityProjectId(ctx, dstKind, dstId);
				if (!srcProjectId || !dstProjectId || srcProjectId !== dstProjectId) {
					return {
						name: tool.name,
						ok: false,
						error: 'entities must belong to the same project'
					};
				}
				if (!ctx.allowedProjects.has(srcProjectId)) {
					return { name: tool.name, ok: false, error: 'unauthorized project' };
				}

				const props = isJsonObject(args.props)
					? { ...args.props, tree_agent_run_id: ctx.runId }
					: { tree_agent_run_id: ctx.runId };
				const { data, error } = await ctx.supabase
					.from('onto_edges')
					.insert({
						project_id: srcProjectId,
						src_kind: srcKind,
						src_id: srcId,
						dst_kind: dstKind,
						dst_id: dstId,
						rel,
						props
					})
					.select('*')
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'unlink_onto_edge': {
				const edgeId = typeof args.edge_id === 'string' ? args.edge_id : '';
				if (!edgeId) return { name: tool.name, ok: false, error: 'edge_id is required' };

				const { data: edge } = await ctx.supabase
					.from('onto_edges')
					.select('id, project_id')
					.eq('id', edgeId)
					.maybeSingle();
				if (!edge?.project_id || !ctx.allowedProjects.has(edge.project_id)) {
					return { name: tool.name, ok: false, error: 'unauthorized edge' };
				}

				const { error } = await ctx.supabase.from('onto_edges').delete().eq('id', edgeId);
				if (error) throw error;
				return { name: tool.name, ok: true, result: { deleted: true, edge_id: edgeId } };
			}

			// -------------------------
			// External
			// -------------------------
			case 'web_search': {
				const query = typeof args.query === 'string' ? args.query.trim() : '';
				if (!query) return { name: tool.name, ok: false, error: 'query is required' };
				const maxResults = safeLimit(
					args.max_results,
					DEFAULT_MAX_RESULTS,
					MAX_RESULTS_CAP
				);
				const depth = normalizeDepth(args.search_depth);
				const includeAnswer = args.include_answer !== false;

				const response = await tavilySearch({
					query,
					search_depth: depth,
					include_answer: includeAnswer,
					max_results: maxResults,
					include_domains: Array.isArray(args.include_domains)
						? (args.include_domains as string[])
						: undefined,
					exclude_domains: Array.isArray(args.exclude_domains)
						? (args.exclude_domains as string[])
						: undefined,
					include_raw_content: false,
					include_images: false
				});

				const results = (response.results ?? []).map((item) => ({
					title: item.title,
					url: item.url,
					snippet: summarizeContent(item.content ?? item.raw_content),
					score: item.score,
					published_date: item.published_date
				}));

				return {
					name: tool.name,
					ok: true,
					result: {
						query,
						answer: response.answer,
						results,
						follow_up_questions: response.follow_up_questions,
						info: {
							provider: 'tavily',
							search_depth: depth,
							max_results: maxResults,
							include_answer: includeAnswer,
							fetched_at: new Date().toISOString()
						}
					} as Json
				};
			}

			// -------------------------
			// Tree agent tables
			// -------------------------
			case 'list_tree_agent_runs': {
				const limit = safeLimit(args.limit, 20, 100);
				let query = ctx.supabase
					.from('tree_agent_runs')
					.select('*')
					.eq('user_id', ctx.userId)
					.order('created_at', { ascending: false })
					.limit(limit);
				const requestedStatus = args.status;
				const status = asTreeAgentRunStatus(requestedStatus);
				if (requestedStatus && !status) {
					return { name: tool.name, ok: false, error: 'invalid status' };
				}
				if (status) query = query.eq('status', status);
				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_tree_agent_run': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				if (!runId) return { name: tool.name, ok: false, error: 'run_id is required' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				const { data, error } = await ctx.supabase
					.from('tree_agent_runs')
					.select('*')
					.eq('id', runId)
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? null) as Json };
			}
			case 'list_tree_agent_nodes': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				if (!runId) return { name: tool.name, ok: false, error: 'run_id is required' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				const limit = safeLimit(args.limit, 60, 400);

				let query = ctx.supabase
					.from('tree_agent_nodes')
					.select('*')
					.eq('run_id', runId)
					.order('created_at', { ascending: true })
					.limit(limit);

				if (typeof args.parent_node_id === 'string')
					query = query.eq('parent_node_id', args.parent_node_id);
				const requestedStatus = args.status;
				const status = asTreeAgentNodeStatus(requestedStatus);
				if (requestedStatus && !status) {
					return { name: tool.name, ok: false, error: 'invalid node status' };
				}
				if (status) query = query.eq('status', status);
				if (typeof args.depth === 'number') query = query.eq('depth', args.depth);

				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_tree_agent_node': {
				const nodeId = typeof args.node_id === 'string' ? args.node_id : '';
				if (!nodeId) return { name: tool.name, ok: false, error: 'node_id is required' };

				const runId = await getRunIdForNode(ctx.supabase, nodeId);
				if (!runId) return { name: tool.name, ok: false, error: 'node not found' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized node' };

				const { data, error } = await ctx.supabase
					.from('tree_agent_nodes')
					.select('*')
					.eq('id', nodeId)
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? null) as Json };
			}
			case 'list_tree_agent_events': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				if (!runId) return { name: tool.name, ok: false, error: 'run_id is required' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				const limit = safeLimit(args.limit, 200, 1000);

				let query = ctx.supabase
					.from('tree_agent_events')
					.select('*')
					.eq('run_id', runId)
					.order('seq', { ascending: true })
					.limit(limit);
				if (typeof args.since_seq === 'number') query = query.gt('seq', args.since_seq);

				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'get_tree_agent_artifacts': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				if (!runId) return { name: tool.name, ok: false, error: 'run_id is required' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				const limit = safeLimit(args.limit, 200, 1000);

				let query = ctx.supabase
					.from('tree_agent_artifacts')
					.select('*')
					.eq('run_id', runId)
					.order('created_at', { ascending: false })
					.limit(limit);
				if (typeof args.node_id === 'string') query = query.eq('node_id', args.node_id);

				const { data, error } = await query;
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? []) as Json };
			}
			case 'create_tree_agent_node': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				if (!runId) return { name: tool.name, ok: false, error: 'run_id is required' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };

				const title =
					typeof args.title === 'string' && args.title.trim() ? args.title.trim() : '';
				if (!title) return { name: tool.name, ok: false, error: 'title is required' };

				const nodeStatus = asTreeAgentNodeStatus(args.status) ?? 'planning';
				const roleState = asTreeAgentRoleState(args.role_state) ?? 'planner';

				const payload = {
					run_id: runId,
					parent_node_id:
						typeof args.parent_node_id === 'string' ? args.parent_node_id : null,
					title,
					reason: typeof args.reason === 'string' ? args.reason : '',
					success_criteria: Array.isArray(args.success_criteria)
						? args.success_criteria
						: [],
					band_index: typeof args.band_index === 'number' ? args.band_index : 0,
					step_index: typeof args.step_index === 'number' ? args.step_index : 0,
					depth: typeof args.depth === 'number' ? args.depth : 0,
					status: nodeStatus,
					role_state: roleState,
					context: isJsonObject(args.context) ? args.context : {}
				};

				const { data, error } = await ctx.supabase
					.from('tree_agent_nodes')
					.insert(payload)
					.select('*')
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'update_tree_agent_node': {
				const nodeId = typeof args.node_id === 'string' ? args.node_id : '';
				if (!nodeId) return { name: tool.name, ok: false, error: 'node_id is required' };
				const runId = await getRunIdForNode(ctx.supabase, nodeId);
				if (!runId) return { name: tool.name, ok: false, error: 'node not found' };
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized node' };

				const updatePayload: Record<string, unknown> = {
					updated_at: new Date().toISOString()
				};
				if (typeof args.title === 'string' && args.title.trim())
					updatePayload.title = args.title.trim();
				if (typeof args.reason === 'string') updatePayload.reason = args.reason;
				if (Array.isArray(args.success_criteria))
					updatePayload.success_criteria = args.success_criteria;
				const requestedStatus = args.status;
				const status = asTreeAgentNodeStatus(requestedStatus);
				if (requestedStatus && !status) {
					return { name: tool.name, ok: false, error: 'invalid node status' };
				}
				if (status) updatePayload.status = status;
				const requestedRoleState = args.role_state;
				const roleState = asTreeAgentRoleState(requestedRoleState);
				if (requestedRoleState && !roleState) {
					return { name: tool.name, ok: false, error: 'invalid role_state' };
				}
				if (roleState) updatePayload.role_state = roleState;
				if (isJsonObject(args.context)) updatePayload.context = args.context;
				if (isJsonObject(args.result)) updatePayload.result = args.result;
				if (typeof args.scratchpad_doc_id === 'string')
					updatePayload.scratchpad_doc_id = args.scratchpad_doc_id;
				if (typeof args.ended_at === 'string') updatePayload.ended_at = args.ended_at;

				const { data, error } = await ctx.supabase
					.from('tree_agent_nodes')
					.update(updatePayload)
					.eq('id', nodeId)
					.select('*')
					.maybeSingle();
				if (error) throw error;
				return { name: tool.name, ok: true, result: (data ?? null) as Json };
			}
			case 'create_tree_agent_plan': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				const nodeId = typeof args.node_id === 'string' ? args.node_id : '';
				if (!runId || !nodeId) {
					return { name: tool.name, ok: false, error: 'run_id and node_id are required' };
				}
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				if (!isJsonObject(args.plan_json)) {
					return { name: tool.name, ok: false, error: 'plan_json must be an object' };
				}

				const payload = {
					run_id: runId,
					node_id: nodeId,
					version: typeof args.version === 'number' ? args.version : 1,
					plan_json: args.plan_json
				};

				const { data, error } = await ctx.supabase
					.from('tree_agent_plans')
					.insert(payload)
					.select('*')
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'create_tree_agent_artifact': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				const nodeId = typeof args.node_id === 'string' ? args.node_id : '';
				if (!runId || !nodeId) {
					return { name: tool.name, ok: false, error: 'run_id and node_id are required' };
				}
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };
				const requestedArtifactType = args.artifact_type;
				const artifactType = asTreeAgentArtifactType(requestedArtifactType);
				if (requestedArtifactType && !artifactType) {
					return { name: tool.name, ok: false, error: 'invalid artifact_type' };
				}
				if (!artifactType)
					return { name: tool.name, ok: false, error: 'artifact_type is required' };

				const payload = {
					run_id: runId,
					node_id: nodeId,
					artifact_type: artifactType,
					label: typeof args.label === 'string' ? args.label : '',
					document_id: typeof args.document_id === 'string' ? args.document_id : null,
					json_payload: isJsonObject(args.json_payload) ? args.json_payload : null,
					is_primary: args.is_primary === true
				};

				const { data, error } = await ctx.supabase
					.from('tree_agent_artifacts')
					.insert(payload)
					.select('*')
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}
			case 'insert_tree_agent_event': {
				const runId = typeof args.run_id === 'string' ? args.run_id : '';
				const nodeId = typeof args.node_id === 'string' ? args.node_id : '';
				const eventType = typeof args.event_type === 'string' ? args.event_type : '';
				if (!runId || !nodeId || !eventType) {
					return {
						name: tool.name,
						ok: false,
						error: 'run_id, node_id, and event_type are required'
					};
				}
				const owned = await ensureRunOwnedByUser(ctx.supabase, runId, ctx.userId);
				if (!owned) return { name: tool.name, ok: false, error: 'unauthorized run_id' };

				const payload = {
					run_id: runId,
					node_id: nodeId,
					event_type: eventType,
					payload: isJsonObject(args.payload) ? args.payload : {},
					seq: typeof args.seq === 'number' ? args.seq : null
				};

				const { data, error } = await ctx.supabase
					.from('tree_agent_events')
					.insert(payload)
					.select('*')
					.single();
				if (error) throw error;
				return { name: tool.name, ok: true, result: data as Json };
			}

			default:
				return { name: tool.name, ok: false, error: 'Unsupported tool' };
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tool execution failed';
		return { name: tool.name, ok: false, error: message };
	}
}

export async function executeTreeAgentToolCalls(params: {
	ctx: TreeAgentToolContext;
	toolCalls: TreeAgentToolCall[];
	maxCalls?: number;
}): Promise<{
	results: TreeAgentToolResult[];
	artifacts: Record<string, string[]>;
}> {
	const { ctx, toolCalls } = params;
	const maxCalls = params.maxCalls ?? MAX_TOOL_CALLS_PER_ITERATION;
	const limited = toolCalls.slice(0, maxCalls);

	const artifacts: Record<string, string[]> = {};
	const results: TreeAgentToolResult[] = [];

	for (const call of limited) {
		const result = await executeToolCall(ctx, call);
		results.push(result);
		if (result.artifacts) {
			for (const [key, value] of Object.entries(result.artifacts)) {
				if (!artifacts[key]) artifacts[key] = [];
				artifacts[key].push(...value);
			}
		}
	}

	return { results, artifacts };
}

export function summarizeToolResults(results: TreeAgentToolResult[]): Array<{
	name: string;
	ok: boolean;
	summary: string;
	error?: string;
}> {
	return results.map((result) => ({
		name: result.name,
		ok: result.ok,
		summary: result.ok ? summarizeResult(result.result) : 'error',
		error: result.error
	}));
}
