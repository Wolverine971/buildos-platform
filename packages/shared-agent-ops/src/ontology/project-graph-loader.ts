// packages/shared-agent-ops/src/ontology/project-graph-loader.ts
/**
 * Project Graph Loader Service
 *
 * Provides efficient loading of all ontology data for a project using parallel flat queries.
 * Uses denormalized project_id fields on all entities and edges for O(1) index lookups.
 *
 * Key benefits:
 * - All queries execute in parallel (no sequential dependencies)
 * - Single-column index lookups (no batching required)
 * - Consistent query pattern across all entity types
 *
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectGraphData, LoadProjectGraphOptions, EntityKind } from './project-graph.types';
import type {
	OntoProject,
	OntoPlan,
	OntoTask,
	OntoGoal,
	OntoMilestone,
	OntoDocument,
	OntoRisk,
	OntoRequirement,
	OntoMetric,
	OntoSource,
	OntoEdge
} from './onto-api';
import { sanitizeProjectForClient } from '../utils/project-props-sanitizer';

const COMPLETED_TASK_STATES = new Set(['done', 'complete', 'completed']);

const PROJECT_GRAPH_PROJECT_COLUMNS = [
	'id',
	'name',
	'description',
	'type_key',
	'state_key',
	'props',
	'start_at',
	'end_at',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'doc_structure',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at',
	'is_public',
	'org_id',
	'next_step_short',
	'next_step_long',
	'next_step_source',
	'next_step_updated_at'
].join(',');

const PROJECT_SUMMARY_PROJECT_COLUMNS = [
	PROJECT_GRAPH_PROJECT_COLUMNS,
	'icon_svg',
	'icon_concept',
	'icon_generated_at',
	'icon_generation_prompt',
	'icon_generation_source'
].join(',');

const PLAN_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'plan',
	'description',
	'state_key',
	'props',
	'facet_context',
	'facet_scale',
	'facet_stage',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at'
].join(',');

const TASK_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'description',
	'state_key',
	'priority',
	'props',
	'facet_scale',
	'created_by',
	'created_at',
	'updated_at',
	'start_at',
	'due_at',
	'completed_at',
	'archived_at',
	'deleted_at'
].join(',');

const GOAL_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'goal',
	'description',
	'state_key',
	'target_date',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'completed_at',
	'archived_at',
	'deleted_at'
].join(',');

const MILESTONE_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'milestone',
	'description',
	'state_key',
	'due_at',
	'completed_at',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at'
].join(',');

const DOCUMENT_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'state_key',
	'description',
	'props',
	'children',
	'created_by',
	'created_at',
	'updated_at',
	'archived_at',
	'deleted_at'
].join(',');

const REQUIREMENT_COLUMNS = [
	'id',
	'project_id',
	'text',
	'type_key',
	'priority',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'deleted_at'
].join(',');

const METRIC_COLUMNS = [
	'id',
	'project_id',
	'name',
	'definition',
	'unit',
	'type_key',
	'props',
	'created_by',
	'created_at'
].join(',');

const SOURCE_COLUMNS = [
	'id',
	'project_id',
	'uri',
	'snapshot_uri',
	'captured_at',
	'props',
	'created_by',
	'created_at'
].join(',');

const RISK_COLUMNS = [
	'id',
	'project_id',
	'title',
	'type_key',
	'probability',
	'impact',
	'state_key',
	'content',
	'props',
	'created_by',
	'created_at',
	'updated_at',
	'mitigated_at',
	'archived_at',
	'deleted_at'
].join(',');

const EDGE_COLUMNS = [
	'id',
	'project_id',
	'src_id',
	'src_kind',
	'dst_id',
	'dst_kind',
	'rel',
	'props',
	'created_at'
].join(',');

function isCompletedTask(task: OntoTask): boolean {
	const state = String(task.state_key ?? '').toLowerCase();
	return (
		COMPLETED_TASK_STATES.has(state) ||
		(typeof task.completed_at === 'string' && task.completed_at.length > 0)
	);
}

function asRows<T>(data: unknown): T[] {
	return (data ?? []) as T[];
}

function asRow<T>(data: unknown): T {
	return data as T;
}

/**
 * Load all ontology data for a single project in parallel.
 * Uses project_id index on all tables for O(1) lookups.
 *
 * @param supabase - Supabase client instance
 * @param projectId - UUID of the project to load
 * @param options - Optional configuration
 * @returns ProjectGraphData containing all entities and edges
 *
 * @example
 * ```typescript
 * const data = await loadProjectGraphData(supabase, projectId);
 * const graph = buildProjectGraph(data);
 *
 * // Now you can traverse the graph
 * const plans = graph.getPlansForProject();
 * ```
 */
export async function loadProjectGraphData(
	supabase: SupabaseClient,
	projectId: string,
	options: LoadProjectGraphOptions = {}
): Promise<ProjectGraphData> {
	const requestedKinds = new Set(options.entityKinds ?? []);
	const shouldFetch = (kind: EntityKind) => requestedKinds.size === 0 || requestedKinds.has(kind);
	const excludeCompletedTasks = options.excludeCompletedTasks === true;

	// Execute all queries in parallel - this is the key optimization!
	// Each query uses the project_id index for O(1) lookups.
	const [
		projectResult,
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		documentsResult,
		requirementsResult,
		metricsResult,
		sourcesResult,
		risksResult,
		edgesResult
	] = await Promise.all([
		supabase
			.from('onto_projects')
			.select(PROJECT_GRAPH_PROJECT_COLUMNS)
			.eq('id', projectId)
			.is('deleted_at', null)
			.single(),
		shouldFetch('plan')
			? supabase
					.from('onto_plans')
					.select(PLAN_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('task')
			? (() => {
					const query = supabase
						.from('onto_tasks')
						.select(TASK_COLUMNS)
						.eq('project_id', projectId)
						.is('deleted_at', null);
					return excludeCompletedTasks ? query.neq('state_key', 'done') : query;
				})()
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('goal')
			? supabase
					.from('onto_goals')
					.select(GOAL_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('milestone')
			? supabase
					.from('onto_milestones')
					.select(MILESTONE_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('document')
			? supabase
					.from('onto_documents')
					.select(DOCUMENT_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('requirement')
			? supabase
					.from('onto_requirements')
					.select(REQUIREMENT_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('metric')
			? supabase.from('onto_metrics').select(METRIC_COLUMNS).eq('project_id', projectId)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('source')
			? supabase.from('onto_sources').select(SOURCE_COLUMNS).eq('project_id', projectId)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select(RISK_COLUMNS)
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		// This is the key improvement - edges now have project_id!
		supabase.from('onto_edges').select(EDGE_COLUMNS).eq('project_id', projectId)
	]);

	// Handle project not found
	if (projectResult.error) {
		throw new Error(`Failed to load project ${projectId}: ${projectResult.error.message}`);
	}

	if (!projectResult.data) {
		throw new Error(`Project not found: ${projectId}`);
	}

	// Log any non-critical errors but continue
	const logError = (name: string, error: { message: string } | null) => {
		if (error) {
			console.warn(`[ProjectGraphLoader] Warning loading ${name}:`, error.message);
		}
	};

	logError('plans', plansResult.error);
	logError('tasks', tasksResult.error);
	logError('goals', goalsResult.error);
	logError('milestones', milestonesResult.error);
	logError('documents', documentsResult.error);
	logError('requirements', requirementsResult.error);
	logError('metrics', metricsResult.error);
	logError('sources', sourcesResult.error);
	logError('risks', risksResult.error);
	logError('edges', edgesResult.error);

	const taskRows = asRows<OntoTask>(tasksResult.data);
	const edgeRows = asRows<OntoEdge>(edgesResult.data);
	const filteredTasks =
		shouldFetch('task') && excludeCompletedTasks
			? taskRows.filter((task) => !isCompletedTask(task))
			: taskRows;

	const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
	const filteredEdges =
		shouldFetch('task') && excludeCompletedTasks
			? edgeRows.filter((edge) => {
					if (edge.src_kind === 'task' && !filteredTaskIds.has(edge.src_id)) return false;
					if (edge.dst_kind === 'task' && !filteredTaskIds.has(edge.dst_id)) return false;
					return true;
				})
			: edgeRows;

	return {
		project: sanitizeProjectForClient(asRow<OntoProject>(projectResult.data)),
		plans: asRows<OntoPlan>(plansResult.data),
		tasks: filteredTasks,
		goals: asRows<OntoGoal>(goalsResult.data),
		milestones: asRows<OntoMilestone>(milestonesResult.data),
		documents: asRows<OntoDocument>(documentsResult.data),
		requirements: asRows<OntoRequirement>(requirementsResult.data),
		metrics: asRows<OntoMetric>(metricsResult.data),
		sources: asRows<OntoSource>(sourcesResult.data),
		risks: asRows<OntoRisk>(risksResult.data),
		edges: filteredEdges
	};
}

/**
 * Load graph data for multiple projects in parallel.
 * More efficient than calling loadProjectGraphData multiple times
 * because it batches queries by entity type.
 *
 * @param supabase - Supabase client instance
 * @param projectIds - Array of project UUIDs to load
 * @returns Map from projectId to ProjectGraphData
 *
 * @example
 * ```typescript
 * const graphs = await loadMultipleProjectGraphs(supabase, ['proj-1', 'proj-2']);
 * for (const [projectId, data] of graphs) {
 *   const graph = buildProjectGraph(data);
 *   console.log(`Project ${projectId} has ${graph.getAllOfKind('task').length} tasks`);
 * }
 * ```
 */
export async function loadMultipleProjectGraphs(
	supabase: SupabaseClient,
	projectIds: string[],
	options: LoadProjectGraphOptions = {}
): Promise<Map<string, ProjectGraphData>> {
	if (projectIds.length === 0) {
		return new Map();
	}

	const requestedKinds = new Set(options.entityKinds ?? []);
	const shouldFetch = (kind: EntityKind) => requestedKinds.size === 0 || requestedKinds.has(kind);
	const excludeCompletedTasks = options.excludeCompletedTasks === true;

	// Batch load with single query per entity type
	const [
		projectsResult,
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		documentsResult,
		requirementsResult,
		metricsResult,
		sourcesResult,
		risksResult,
		edgesResult
	] = await Promise.all([
		supabase
			.from('onto_projects')
			.select(PROJECT_GRAPH_PROJECT_COLUMNS)
			.in('id', projectIds)
			.is('deleted_at', null),
		shouldFetch('plan')
			? supabase
					.from('onto_plans')
					.select(PLAN_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('task')
			? (() => {
					const query = supabase
						.from('onto_tasks')
						.select(TASK_COLUMNS)
						.in('project_id', projectIds)
						.is('deleted_at', null);
					return excludeCompletedTasks ? query.neq('state_key', 'done') : query;
				})()
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('goal')
			? supabase
					.from('onto_goals')
					.select(GOAL_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('milestone')
			? supabase
					.from('onto_milestones')
					.select(MILESTONE_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('document')
			? supabase
					.from('onto_documents')
					.select(DOCUMENT_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('requirement')
			? supabase
					.from('onto_requirements')
					.select(REQUIREMENT_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('metric')
			? supabase.from('onto_metrics').select(METRIC_COLUMNS).in('project_id', projectIds)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('source')
			? supabase.from('onto_sources').select(SOURCE_COLUMNS).in('project_id', projectIds)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select(RISK_COLUMNS)
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		supabase.from('onto_edges').select(EDGE_COLUMNS).in('project_id', projectIds)
	]);

	// Group entities by project_id
	const projectsById = new Map<string, OntoProject>();
	for (const project of asRows<OntoProject>(projectsResult.data)) {
		projectsById.set(project.id, sanitizeProjectForClient(project));
	}

	const groupByProjectId = <T extends { project_id: string }>(items: T[]): Map<string, T[]> => {
		const grouped = new Map<string, T[]>();
		for (const projectId of projectIds) {
			grouped.set(projectId, []);
		}
		for (const item of items) {
			const list = grouped.get(item.project_id);
			if (list) {
				list.push(item);
			}
		}
		return grouped;
	};

	const tasksData = asRows<OntoTask>(tasksResult.data);
	const edgesData = asRows<OntoEdge>(edgesResult.data);

	const filteredTasks =
		shouldFetch('task') && excludeCompletedTasks
			? tasksData.filter((task) => !isCompletedTask(task))
			: tasksData;

	const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
	const filteredEdges =
		shouldFetch('task') && excludeCompletedTasks
			? edgesData.filter((edge) => {
					if (edge.src_kind === 'task' && !filteredTaskIds.has(edge.src_id)) return false;
					if (edge.dst_kind === 'task' && !filteredTaskIds.has(edge.dst_id)) return false;
					return true;
				})
			: edgesData;

	const plansByProject = groupByProjectId(asRows<OntoPlan>(plansResult.data));
	const tasksByProject = groupByProjectId(filteredTasks);
	const goalsByProject = groupByProjectId(asRows<OntoGoal>(goalsResult.data));
	const milestonesByProject = groupByProjectId(asRows<OntoMilestone>(milestonesResult.data));
	const documentsByProject = groupByProjectId(asRows<OntoDocument>(documentsResult.data));
	const requirementsByProject = groupByProjectId(
		asRows<OntoRequirement>(requirementsResult.data)
	);
	const metricsByProject = groupByProjectId(asRows<OntoMetric>(metricsResult.data));
	const sourcesByProject = groupByProjectId(asRows<OntoSource>(sourcesResult.data));
	const risksByProject = groupByProjectId(asRows<OntoRisk>(risksResult.data));
	const edgesByProject = groupByProjectId(filteredEdges);

	// Build result map
	const result = new Map<string, ProjectGraphData>();

	for (const projectId of projectIds) {
		const project = projectsById.get(projectId);
		if (!project) {
			console.warn(`[ProjectGraphLoader] Project not found: ${projectId}`);
			continue;
		}

		result.set(projectId, {
			project,
			plans: plansByProject.get(projectId) ?? [],
			tasks: tasksByProject.get(projectId) ?? [],
			goals: goalsByProject.get(projectId) ?? [],
			milestones: milestonesByProject.get(projectId) ?? [],
			documents: documentsByProject.get(projectId) ?? [],
			requirements: requirementsByProject.get(projectId) ?? [],
			metrics: metricsByProject.get(projectId) ?? [],
			sources: sourcesByProject.get(projectId) ?? [],
			risks: risksByProject.get(projectId) ?? [],
			edges: edgesByProject.get(projectId) ?? []
		});
	}

	return result;
}

/**
 * Load all projects for a user along with summary counts.
 * This is useful for project list views where you need basic stats.
 *
 * @param supabase - Supabase client instance
 * @param actorId - The actor ID for the user
 * @returns Array of projects with task/edge counts
 */
export async function loadUserProjectSummaries(
	supabase: SupabaseClient,
	actorId: string
): Promise<
	Array<{
		project: OntoProject;
		taskCount: number;
		planCount: number;
		edgeCount: number;
	}>
> {
	// First get all projects for the user
	const { data: projects, error: projectsError } = await supabase
		.from('onto_projects')
		.select(PROJECT_SUMMARY_PROJECT_COLUMNS)
		.eq('created_by', actorId)
		.order('created_at', { ascending: false });

	if (projectsError || !projects) {
		console.error('[ProjectGraphLoader] Failed to load projects:', projectsError);
		return [];
	}

	const projectRows = asRows<OntoProject>(projects);

	if (projectRows.length === 0) {
		return [];
	}

	const projectIds = projectRows.map((p) => p.id);

	// Get counts in parallel
	const [taskCounts, planCounts, edgeCounts] = await Promise.all([
		supabase
			.from('onto_tasks')
			.select('project_id', { count: 'exact', head: false })
			.in('project_id', projectIds),
		supabase
			.from('onto_plans')
			.select('project_id', { count: 'exact', head: false })
			.in('project_id', projectIds),
		supabase
			.from('onto_edges')
			.select('project_id', { count: 'exact', head: false })
			.in('project_id', projectIds)
	]);

	// Count by project_id
	const countByProject = (items: { project_id: string }[] | null): Map<string, number> => {
		const counts = new Map<string, number>();
		for (const item of items ?? []) {
			counts.set(item.project_id, (counts.get(item.project_id) ?? 0) + 1);
		}
		return counts;
	};

	const taskCountsByProject = countByProject(taskCounts.data);
	const planCountsByProject = countByProject(planCounts.data);
	const edgeCountsByProject = countByProject(edgeCounts.data);

	return projectRows.map((project) => ({
		project: sanitizeProjectForClient(project),
		taskCount: taskCountsByProject.get(project.id) ?? 0,
		planCount: planCountsByProject.get(project.id) ?? 0,
		edgeCount: edgeCountsByProject.get(project.id) ?? 0
	}));
}
