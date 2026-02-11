// apps/web/src/lib/services/agentic-chat-v2/context-loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, Database } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { createLogger } from '$lib/utils/logger';
import type { DocStructure } from '$lib/types/onto-api';
import type {
	EntityContextData,
	GlobalContextData,
	LightEvent,
	LightGoal,
	LightMilestone,
	LightPlan,
	LightProject,
	LightRecentActivity,
	LightTask,
	ProjectContextData,
	LinkedEdge
} from './context-models';
import { buildDocStructureSummary } from './context-models';
import type { MasterPromptContext } from './master-prompt-builder';

const logger = createLogger('FastChatContext');

const PROJECT_CONTEXTS = new Set<ChatContextType>(['project', 'project_audit', 'project_forecast']);

const RECENT_ACTIVITY_PER_PROJECT = 6;
const GLOBAL_DOC_STRUCTURE_DEPTH = 2;
const FASTCHAT_CONTEXT_RPC = 'load_fastchat_context';

type ProjectRow = Database['public']['Tables']['onto_projects']['Row'];
type ProjectSelectRow = Pick<
	ProjectRow,
	| 'id'
	| 'name'
	| 'state_key'
	| 'description'
	| 'start_at'
	| 'end_at'
	| 'next_step_short'
	| 'updated_at'
	| 'doc_structure'
>;
type GoalRow = Database['public']['Tables']['onto_goals']['Row'];
type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];
type PlanRow = Database['public']['Tables']['onto_plans']['Row'];
type TaskRow = Database['public']['Tables']['onto_tasks']['Row'];
type DocumentRow = Database['public']['Tables']['onto_documents']['Row'];
type EventRow = Database['public']['Tables']['onto_events']['Row'];
type ProjectLogRow = Database['public']['Tables']['onto_project_logs']['Row'];
type EdgeRow = Database['public']['Tables']['onto_edges']['Row'];

type LoadContextParams = {
	supabase: SupabaseClient<Database>;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
};

type FastChatContextRpcResponse = {
	projects?: ProjectSelectRow[];
	project?: ProjectSelectRow | null;
	goals?: Array<GoalRow & { project_id?: string }>;
	milestones?: Array<MilestoneRow & { project_id?: string }>;
	plans?: Array<PlanRow & { project_id?: string }>;
	tasks?: Array<TaskRow & { project_id?: string }>;
	events?: Array<EventRow & { project_id?: string }>;
	project_logs?: ProjectLogRow[];
	focus_entity_full?: Record<string, unknown> | null;
	focus_entity_type?: string | null;
	focus_entity_id?: string | null;
	linked_entities?: Record<string, Array<Record<string, unknown>>>;
	linked_edges?: LinkedEdge[];
};

type LinkedEntityConfig = {
	table: keyof Database['public']['Tables'];
	select: string;
	map: (row: any) => Record<string, unknown>;
};

const LINKED_ENTITY_CONFIG: Record<string, LinkedEntityConfig> = {
	project: {
		table: 'onto_projects',
		select: 'id, name, state_key, description, start_at, end_at, next_step_short, updated_at',
		map: (row: ProjectRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			start_at: row.start_at,
			end_at: row.end_at,
			updated_at: row.updated_at
		})
	},
	task: {
		table: 'onto_tasks',
		select: 'id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at',
		map: (row: TaskRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			priority: row.priority,
			start_at: row.start_at,
			due_at: row.due_at,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	plan: {
		table: 'onto_plans',
		select: 'id, name, description, state_key, updated_at',
		map: (row: PlanRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			updated_at: row.updated_at
		})
	},
	goal: {
		table: 'onto_goals',
		select: 'id, name, description, state_key, target_date, completed_at, updated_at',
		map: (row: GoalRow) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			state_key: row.state_key,
			target_date: row.target_date,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, title, description, state_key, due_at, completed_at, updated_at',
		map: (row: MilestoneRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			due_at: row.due_at,
			completed_at: row.completed_at,
			updated_at: row.updated_at
		})
	},
	document: {
		table: 'onto_documents',
		select: 'id, title, description, state_key, updated_at',
		map: (row: DocumentRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			updated_at: row.updated_at
		})
	},
	event: {
		table: 'onto_events',
		select: 'id, title, description, state_key, start_at, end_at, all_day, location, updated_at',
		map: (row: EventRow) => ({
			id: row.id,
			title: row.title,
			description: row.description,
			state_key: row.state_key,
			start_at: row.start_at,
			end_at: row.end_at,
			all_day: row.all_day,
			location: row.location,
			updated_at: row.updated_at
		})
	},
	risk: {
		table: 'onto_risks',
		select: 'id, title, content, state_key, impact, probability, updated_at',
		map: (row: any) => ({
			id: row.id,
			title: row.title,
			content: row.content,
			state_key: row.state_key,
			impact: row.impact,
			probability: row.probability,
			updated_at: row.updated_at
		})
	},
	requirement: {
		table: 'onto_requirements',
		select: 'id, text, priority, updated_at',
		map: (row: any) => ({
			id: row.id,
			text: row.text,
			priority: row.priority,
			updated_at: row.updated_at
		})
	}
};

function isProjectContext(contextType: ChatContextType): boolean {
	return PROJECT_CONTEXTS.has(contextType);
}

function resolveProjectId(
	contextType: ChatContextType,
	entityId?: string | null,
	projectFocus?: ProjectFocus | null
): string | null {
	if (projectFocus?.projectId) return projectFocus.projectId;
	if (isProjectContext(contextType)) return entityId ?? null;
	return null;
}

function resolveRpcContextType(
	contextType: ChatContextType,
	projectFocus?: ProjectFocus | null
): 'global' | 'project' | null {
	if (contextType === 'global') return 'global';
	if (isProjectContext(contextType)) return 'project';
	if (contextType === 'ontology' && projectFocus?.projectId) return 'project';
	return null;
}

function asArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}

function resolveEntityName(entity: Record<string, unknown> | null | undefined): string | null {
	if (!entity) return null;
	const candidate =
		entity.title ??
		entity.name ??
		entity.text ??
		entity.goal ??
		entity.milestone ??
		entity.summary;
	return typeof candidate === 'string' ? candidate : null;
}

const STRIP_ENTITY_FIELDS = new Set([
	'type_key',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'progress_percent',
	'plan_ids',
	'goal_ids'
]);

function stripEntityFields(
	entity: Record<string, unknown> | null | undefined
): Record<string, unknown> {
	if (!entity) return {};
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entity)) {
		if (STRIP_ENTITY_FIELDS.has(key)) continue;
		result[key] = value;
	}
	return result;
}

function mapProject(
	row: ProjectSelectRow,
	options?: {
		includeDocStructure?: boolean;
		truncateDepth?: number;
	}
): LightProject {
	return {
		id: row.id,
		name: row.name,
		state_key: row.state_key,
		description: row.description,
		start_at: row.start_at,
		end_at: row.end_at,
		next_step_short: row.next_step_short,
		updated_at: row.updated_at,
		doc_structure: options?.includeDocStructure
			? buildDocStructureSummary(
					row.doc_structure as DocStructure | null,
					undefined,
					options?.truncateDepth
				)
			: undefined
	};
}

function mapGoal(row: GoalRow): LightGoal {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		state_key: row.state_key,
		target_date: row.target_date,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapMilestone(row: MilestoneRow): LightMilestone {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		state_key: row.state_key,
		due_at: row.due_at,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapPlan(row: PlanRow): LightPlan {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		state_key: row.state_key,
		task_count: null,
		completed_task_count: null,
		updated_at: row.updated_at
	};
}

function mapTask(row: TaskRow): LightTask {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		state_key: row.state_key,
		priority: row.priority,
		start_at: row.start_at,
		due_at: row.due_at,
		completed_at: row.completed_at,
		updated_at: row.updated_at
	};
}

function mapEvent(row: EventRow): LightEvent {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		state_key: row.state_key,
		start_at: row.start_at,
		end_at: row.end_at,
		all_day: row.all_day,
		location: row.location,
		updated_at: row.updated_at
	};
}

function extractTitle(payload: unknown): string | null {
	if (!payload || typeof payload !== 'object') return null;
	const record = payload as Record<string, unknown>;
	const candidate = record.title ?? record.name ?? record.text ?? record.summary;
	return typeof candidate === 'string' ? candidate : null;
}

function mapRecentActivity(rows: ProjectLogRow[]): Record<string, LightRecentActivity[]> {
	const result: Record<string, LightRecentActivity[]> = {};

	for (const row of rows) {
		if (row.action !== 'created' && row.action !== 'updated') continue;
		const action = row.action as 'created' | 'updated';
		const bucket = (result[row.project_id] ??= []);
		if (bucket.length >= RECENT_ACTIVITY_PER_PROJECT) continue;

		const title = extractTitle(row.after_data) ?? extractTitle(row.before_data);
		bucket.push({
			entity_type: row.entity_type,
			entity_id: row.entity_id,
			title,
			action,
			updated_at: row.created_at
		});
	}

	return result;
}

function groupByProject<T extends { project_id: string }, U>(
	rows: T[],
	mapper: (row: T) => U
): Record<string, U[]> {
	const result: Record<string, U[]> = {};
	for (const row of rows) {
		const bucket = (result[row.project_id] ??= []);
		bucket.push(mapper(row));
	}
	return result;
}

function buildGlobalContextFromRpc(payload: FastChatContextRpcResponse): GlobalContextData {
	const projects = asArray<ProjectSelectRow>(payload.projects);
	const lightProjects = projects.map((row) =>
		mapProject(row, {
			includeDocStructure: true,
			truncateDepth: GLOBAL_DOC_STRUCTURE_DEPTH
		})
	);

	if (lightProjects.length === 0) {
		return {
			projects: lightProjects,
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const goals = asArray<GoalRow & { project_id?: string }>(payload.goals).filter(
		(row): row is GoalRow & { project_id: string } => typeof row.project_id === 'string'
	);
	const milestones = asArray<MilestoneRow & { project_id?: string }>(payload.milestones).filter(
		(row): row is MilestoneRow & { project_id: string } => typeof row.project_id === 'string'
	);
	const plans = asArray<PlanRow & { project_id?: string }>(payload.plans).filter(
		(row): row is PlanRow & { project_id: string } => typeof row.project_id === 'string'
	);

	return {
		projects: lightProjects,
		project_recent_activity: mapRecentActivity(asArray<ProjectLogRow>(payload.project_logs)),
		project_goals: groupByProject(goals, mapGoal),
		project_milestones: groupByProject(milestones, mapMilestone),
		project_plans: groupByProject(plans, mapPlan)
	};
}

function buildProjectContextFromRpc(
	payload: FastChatContextRpcResponse
): ProjectContextData | null {
	const projectRow = payload.project;
	if (!projectRow) return null;

	const doc_structure = buildDocStructureSummary(
		projectRow.doc_structure as DocStructure | null | undefined
	);

	return {
		project: mapProject(projectRow, { includeDocStructure: false }),
		doc_structure,
		goals: asArray<GoalRow>(payload.goals).map(mapGoal),
		milestones: asArray<MilestoneRow>(payload.milestones).map(mapMilestone),
		plans: asArray<PlanRow>(payload.plans).map(mapPlan),
		tasks: asArray<TaskRow>(payload.tasks).map(mapTask),
		events: asArray<EventRow>(payload.events).map(mapEvent)
	};
}

function buildEntityContextFromRpc(params: {
	payload: FastChatContextRpcResponse;
	projectContext: ProjectContextData;
	focusType: ProjectFocus['focusType'];
	focusEntityId: string;
}): { data: EntityContextData; focusEntityName?: string | null } {
	const { payload, projectContext, focusType, focusEntityId } = params;
	const rawFocus =
		payload.focus_entity_full && typeof payload.focus_entity_full === 'object'
			? (payload.focus_entity_full as Record<string, unknown>)
			: null;
	const focusEntityFull = stripEntityFields(rawFocus);
	const focusEntityName = resolveEntityName(focusEntityFull);
	const linked_entities =
		payload.linked_entities && typeof payload.linked_entities === 'object'
			? (payload.linked_entities as Record<string, Array<Record<string, unknown>>>)
			: {};
	const linked_edges = asArray<LinkedEdge>(payload.linked_edges);

	return {
		data: {
			...projectContext,
			focus_entity_type: focusType,
			focus_entity_id: focusEntityId,
			focus_entity_full: focusEntityFull ?? {},
			linked_entities,
			linked_edges
		},
		focusEntityName
	};
}

async function loadFastChatContextViaRpc(
	params: LoadContextParams
): Promise<FastChatContextRpcResponse | null> {
	const { supabase, userId, contextType, entityId, projectFocus } = params;
	const rpcContextType = resolveRpcContextType(contextType, projectFocus);
	if (!rpcContextType) return null;

	const projectId = resolveProjectId(contextType, entityId, projectFocus);
	if (rpcContextType === 'project' && !projectId) return null;

	const focusType =
		projectFocus?.focusType && projectFocus.focusType !== 'project-wide'
			? projectFocus.focusType
			: null;
	const focusEntityId = focusType ? (projectFocus?.focusEntityId ?? null) : null;

	const { data, error } = await supabase.rpc(FASTCHAT_CONTEXT_RPC, {
		p_context_type: rpcContextType,
		p_user_id: userId,
		p_project_id: projectId ?? undefined,
		p_focus_type: (focusEntityId ? focusType : null) ?? undefined,
		p_focus_entity_id: focusEntityId ?? undefined
	});

	if (error) {
		logger.warn('FastChat context RPC failed', {
			error,
			contextType,
			projectId,
			focusType
		});
		return null;
	}

	if (!data || typeof data !== 'object') return null;

	return data as FastChatContextRpcResponse;
}

async function loadGlobalContextData(
	supabase: SupabaseClient<Database>,
	userId: string
): Promise<GlobalContextData> {
	const { data: projects, error } = await supabase
		.from('onto_projects')
		.select(
			'id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure'
		)
		.eq('created_by', userId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });

	if (error) {
		logger.warn('Failed to load global projects', { error });
		return {
			projects: [],
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const projectRows = projects ?? [];
	const lightProjects = projectRows.map((row) =>
		mapProject(row, {
			includeDocStructure: true,
			truncateDepth: GLOBAL_DOC_STRUCTURE_DEPTH
		})
	);
	const projectIds = lightProjects.map((project) => project.id);

	if (projectIds.length === 0) {
		return {
			projects: lightProjects,
			project_recent_activity: {},
			project_goals: {},
			project_milestones: {},
			project_plans: {}
		};
	}

	const [goalsRes, milestonesRes, plansRes, logsRes] = await Promise.all([
		supabase
			.from('onto_goals')
			.select(
				'id, project_id, name, description, state_key, target_date, completed_at, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_milestones')
			.select(
				'id, project_id, title, description, state_key, due_at, completed_at, updated_at'
			)
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_plans')
			.select('id, project_id, name, description, state_key, updated_at')
			.in('project_id', projectIds)
			.is('deleted_at', null),
		supabase
			.from('onto_project_logs')
			.select(
				'project_id, entity_type, entity_id, action, created_at, after_data, before_data'
			)
			.in('project_id', projectIds)
			.order('created_at', { ascending: false })
			.limit(projectIds.length * RECENT_ACTIVITY_PER_PROJECT)
	]);

	if (goalsRes.error) logger.warn('Failed to load global goals', { error: goalsRes.error });
	if (milestonesRes.error)
		logger.warn('Failed to load global milestones', { error: milestonesRes.error });
	if (plansRes.error) logger.warn('Failed to load global plans', { error: plansRes.error });
	if (logsRes.error)
		logger.warn('Failed to load global project activity', { error: logsRes.error });

	const project_goals = groupByProject(
		(goalsRes.data ?? []) as Array<GoalRow & { project_id: string }>,
		mapGoal
	);
	const project_milestones = groupByProject(
		(milestonesRes.data ?? []) as Array<MilestoneRow & { project_id: string }>,
		mapMilestone
	);
	const project_plans = groupByProject(
		(plansRes.data ?? []) as Array<PlanRow & { project_id: string }>,
		mapPlan
	);
	const project_recent_activity = mapRecentActivity((logsRes.data ?? []) as ProjectLogRow[]);

	return {
		projects: lightProjects,
		project_recent_activity,
		project_goals,
		project_milestones,
		project_plans
	};
}

async function loadProjectContextData(
	supabase: SupabaseClient<Database>,
	projectId: string
): Promise<ProjectContextData | null> {
	const { data: projectRow, error } = await supabase
		.from('onto_projects')
		.select(
			'id, name, state_key, description, start_at, end_at, next_step_short, updated_at, doc_structure'
		)
		.eq('id', projectId)
		.maybeSingle();

	if (error || !projectRow) {
		logger.warn('Failed to load project context project', { error, projectId });
		return null;
	}

	const project = mapProject(projectRow, { includeDocStructure: false });

	const [goalsRes, milestonesRes, plansRes, tasksRes, eventsRes] = await Promise.all([
		supabase
			.from('onto_goals')
			.select('id, name, description, state_key, target_date, completed_at, updated_at')
			.eq('project_id', projectId)
			.is('deleted_at', null),
		supabase
			.from('onto_milestones')
			.select('id, title, description, state_key, due_at, completed_at, updated_at')
			.eq('project_id', projectId)
			.is('deleted_at', null),
		supabase
			.from('onto_plans')
			.select('id, name, description, state_key, updated_at')
			.eq('project_id', projectId)
			.is('deleted_at', null),
		supabase
			.from('onto_tasks')
			.select(
				'id, title, description, state_key, priority, start_at, due_at, completed_at, updated_at'
			)
			.eq('project_id', projectId)
			.is('deleted_at', null),
		supabase
			.from('onto_events')
			.select(
				'id, title, description, state_key, start_at, end_at, all_day, location, updated_at'
			)
			.eq('project_id', projectId)
			.is('deleted_at', null)
	]);

	if (goalsRes.error) logger.warn('Failed to load project goals', { error: goalsRes.error });
	if (milestonesRes.error)
		logger.warn('Failed to load project milestones', { error: milestonesRes.error });
	if (plansRes.error) logger.warn('Failed to load project plans', { error: plansRes.error });
	if (tasksRes.error) logger.warn('Failed to load project tasks', { error: tasksRes.error });
	if (eventsRes.error) logger.warn('Failed to load project events', { error: eventsRes.error });

	const doc_structure = buildDocStructureSummary(
		projectRow.doc_structure as DocStructure | null | undefined
	);

	return {
		project,
		doc_structure,
		goals: ((goalsRes.data ?? []) as GoalRow[]).map(mapGoal),
		milestones: ((milestonesRes.data ?? []) as MilestoneRow[]).map(mapMilestone),
		plans: ((plansRes.data ?? []) as PlanRow[]).map(mapPlan),
		tasks: ((tasksRes.data ?? []) as TaskRow[]).map(mapTask),
		events: ((eventsRes.data ?? []) as EventRow[]).map(mapEvent)
	};
}

async function loadLinkedEntities(
	supabase: SupabaseClient<Database>,
	projectId: string,
	focusEntityId: string
): Promise<{
	linked_entities: Record<string, Array<Record<string, unknown>>>;
	linked_edges: LinkedEdge[];
}> {
	const { data: edges, error } = await supabase
		.from('onto_edges')
		.select('src_id, src_kind, dst_id, dst_kind, rel')
		.eq('project_id', projectId)
		.or(`src_id.eq.${focusEntityId},dst_id.eq.${focusEntityId}`);

	if (error) {
		logger.warn('Failed to load linked entity edges', { error, projectId, focusEntityId });
		return { linked_entities: {}, linked_edges: [] };
	}

	const linkedEdges: LinkedEdge[] = ((edges ?? []) as EdgeRow[]).map((edge) => ({
		src_id: edge.src_id,
		src_kind: edge.src_kind,
		dst_id: edge.dst_id,
		dst_kind: edge.dst_kind,
		rel: edge.rel
	}));

	const linkedIdsByKind: Record<string, Set<string>> = {};
	for (const edge of edges ?? []) {
		if (edge.src_id === focusEntityId) {
			(linkedIdsByKind[edge.dst_kind] ??= new Set()).add(edge.dst_id);
		}
		if (edge.dst_id === focusEntityId) {
			(linkedIdsByKind[edge.src_kind] ??= new Set()).add(edge.src_id);
		}
	}

	const entries = Object.entries(linkedIdsByKind).filter(([kind, ids]) => ids.size > 0);
	if (entries.length === 0) {
		return { linked_entities: {}, linked_edges: linkedEdges };
	}

	const fetches = entries.map(
		async ([kind, ids]): Promise<readonly [string, Record<string, unknown>[]]> => {
			const config = LINKED_ENTITY_CONFIG[kind];
			if (!config) return [kind, []] as const;
			const { data, error } = await (supabase
				.from(config.table as any)
				.select(config.select)
				.in('id', Array.from(ids))
				.is('deleted_at', null) as any);
			if (error) {
				logger.warn('Failed to load linked entities', { error, kind });
				return [kind, []] as const;
			}
			return [kind, ((data ?? []) as any[]).map(config.map)] as const;
		}
	);

	const resolved = await Promise.all(fetches);
	const linked_entities: Record<string, Array<Record<string, unknown>>> = {};
	for (const [kind, items] of resolved) {
		if (items.length > 0) linked_entities[kind] = items;
	}

	return { linked_entities, linked_edges: linkedEdges };
}

async function loadEntityContextData(params: {
	supabase: SupabaseClient<Database>;
	projectId: string;
	focusType: ProjectFocus['focusType'];
	focusEntityId: string;
}): Promise<{ data: EntityContextData | null; focusEntityName?: string | null }> {
	const { supabase, projectId, focusType, focusEntityId } = params;
	const projectContext = await loadProjectContextData(supabase, projectId);
	if (!projectContext) return { data: null };

	const focusConfig = LINKED_ENTITY_CONFIG[focusType];
	let focusEntityFull: Record<string, unknown> | null = null;
	let focusEntityName: string | null = null;

	if (focusConfig) {
		const { data, error } = await (supabase
			.from(focusConfig.table as any)
			.select('*')
			.eq('id', focusEntityId)
			.maybeSingle() as any);
		if (error) {
			logger.warn('Failed to load focus entity', { error, focusType, focusEntityId });
		} else if (data) {
			focusEntityFull = stripEntityFields(data as Record<string, unknown>);
			focusEntityName = resolveEntityName(focusEntityFull);
		}
	}

	const { linked_entities, linked_edges } = await loadLinkedEntities(
		supabase,
		projectId,
		focusEntityId
	);

	return {
		data: {
			...projectContext,
			focus_entity_type: focusType,
			focus_entity_id: focusEntityId,
			focus_entity_full: focusEntityFull ?? {},
			linked_entities,
			linked_edges
		},
		focusEntityName
	};
}

export async function loadFastChatPromptContext(
	params: LoadContextParams
): Promise<MasterPromptContext> {
	const { supabase, userId, contextType, entityId, projectFocus } = params;

	const projectId = resolveProjectId(contextType, entityId, projectFocus);
	const focusType =
		projectFocus?.focusType && projectFocus.focusType !== 'project-wide'
			? projectFocus.focusType
			: null;
	const focusEntityId = focusType ? (projectFocus?.focusEntityId ?? null) : null;
	const focusEntityName = focusType ? (projectFocus?.focusEntityName ?? null) : null;

	const baseContext: MasterPromptContext = {
		contextType,
		entityId: entityId ?? null,
		projectId,
		projectName: projectFocus?.projectName ?? null,
		focusEntityType: focusType,
		focusEntityId,
		focusEntityName
	};

	const rpcContextType = resolveRpcContextType(contextType, projectFocus);
	if (rpcContextType) {
		const rpcPayload = await loadFastChatContextViaRpc(params);
		if (rpcPayload) {
			if (rpcContextType === 'global') {
				const data = buildGlobalContextFromRpc(rpcPayload);
				return { ...baseContext, data };
			}

			const projectContext = buildProjectContextFromRpc(rpcPayload);
			if (projectContext) {
				const resolvedProjectName =
					projectContext.project.name ?? baseContext.projectName ?? null;
				if (focusType && focusEntityId) {
					const { data, focusEntityName: resolvedFocusName } = buildEntityContextFromRpc({
						payload: rpcPayload,
						projectContext,
						focusType,
						focusEntityId
					});
					return {
						...baseContext,
						projectId,
						projectName: resolvedProjectName,
						focusEntityName: resolvedFocusName ?? baseContext.focusEntityName ?? null,
						data
					};
				}

				return {
					...baseContext,
					projectId,
					projectName: resolvedProjectName,
					data: projectContext
				};
			}
		}
	}

	if (contextType === 'global') {
		const data = await loadGlobalContextData(supabase, userId);
		return { ...baseContext, data };
	}

	if (isProjectContext(contextType)) {
		if (!projectId) {
			return { ...baseContext, data: null };
		}

		if (focusType && focusEntityId) {
			const { data, focusEntityName } = await loadEntityContextData({
				supabase,
				projectId,
				focusType,
				focusEntityId
			});
			return {
				...baseContext,
				projectId,
				projectName: projectFocus?.projectName ?? baseContext.projectName,
				focusEntityName: focusEntityName ?? baseContext.focusEntityName ?? null,
				data
			};
		}

		const data = await loadProjectContextData(supabase, projectId);
		const projectName = data?.project.name ?? baseContext.projectName ?? null;
		return {
			...baseContext,
			projectId,
			projectName,
			data
		};
	}

	if (contextType === 'ontology' && projectFocus?.projectId) {
		const resolvedProjectId = projectFocus.projectId;
		const data = await loadProjectContextData(supabase, resolvedProjectId);
		return {
			...baseContext,
			projectId: resolvedProjectId,
			projectName: projectFocus.projectName ?? data?.project.name ?? null,
			data
		};
	}

	return { ...baseContext, data: null };
}
