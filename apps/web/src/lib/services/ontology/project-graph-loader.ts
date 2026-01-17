// apps/web/src/lib/services/ontology/project-graph-loader.ts
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
import type {
	ProjectGraphData,
	LoadProjectGraphOptions,
	EntityKind
} from '$lib/types/project-graph.types';
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
} from '$lib/types/onto-api';

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
			.select('*')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single(),
		shouldFetch('plan')
			? supabase
					.from('onto_plans')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('task')
			? (() => {
					const query = supabase
						.from('onto_tasks')
						.select('*')
						.eq('project_id', projectId)
						.is('deleted_at', null);
					return excludeCompletedTasks ? query.neq('state_key', 'done') : query;
				})()
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('goal')
			? supabase
					.from('onto_goals')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('milestone')
			? supabase
					.from('onto_milestones')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('document')
			? supabase
					.from('onto_documents')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('requirement')
			? supabase
					.from('onto_requirements')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('metric')
			? supabase.from('onto_metrics').select('*').eq('project_id', projectId)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('source')
			? supabase.from('onto_sources').select('*').eq('project_id', projectId)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		// This is the key improvement - edges now have project_id!
		supabase.from('onto_edges').select('*').eq('project_id', projectId)
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

	const filteredTasks =
		shouldFetch('task') && excludeCompletedTasks
			? ((tasksResult.data ?? []) as OntoTask[]).filter((task) => task.state_key !== 'done')
			: ((tasksResult.data ?? []) as OntoTask[]);

	const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
	const filteredEdges =
		shouldFetch('task') && excludeCompletedTasks
			? ((edgesResult.data ?? []) as OntoEdge[]).filter((edge) => {
					if (edge.src_kind === 'task' && !filteredTaskIds.has(edge.src_id)) return false;
					if (edge.dst_kind === 'task' && !filteredTaskIds.has(edge.dst_id)) return false;
					return true;
				})
			: ((edgesResult.data ?? []) as OntoEdge[]);

	return {
		project: projectResult.data as OntoProject,
		plans: (plansResult.data ?? []) as OntoPlan[],
		tasks: filteredTasks,
		goals: (goalsResult.data ?? []) as OntoGoal[],
		milestones: (milestonesResult.data ?? []) as OntoMilestone[],
		documents: (documentsResult.data ?? []) as OntoDocument[],
		requirements: (requirementsResult.data ?? []) as OntoRequirement[],
		metrics: (metricsResult.data ?? []) as OntoMetric[],
		sources: (sourcesResult.data ?? []) as OntoSource[],
		risks: (risksResult.data ?? []) as OntoRisk[],
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
		supabase.from('onto_projects').select('*').in('id', projectIds).is('deleted_at', null),
		shouldFetch('plan')
			? supabase
					.from('onto_plans')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('task')
			? (() => {
					const query = supabase
						.from('onto_tasks')
						.select('*')
						.in('project_id', projectIds)
						.is('deleted_at', null);
					return excludeCompletedTasks ? query.neq('state_key', 'done') : query;
				})()
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('goal')
			? supabase
					.from('onto_goals')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('milestone')
			? supabase
					.from('onto_milestones')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('document')
			? supabase
					.from('onto_documents')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('requirement')
			? supabase
					.from('onto_requirements')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('metric')
			? supabase.from('onto_metrics').select('*').in('project_id', projectIds)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('source')
			? supabase.from('onto_sources').select('*').in('project_id', projectIds)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		supabase.from('onto_edges').select('*').in('project_id', projectIds)
	]);

	// Group entities by project_id
	const projectsById = new Map<string, OntoProject>();
	for (const project of (projectsResult.data ?? []) as OntoProject[]) {
		projectsById.set(project.id, project);
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

	const tasksData = (tasksResult.data ?? []) as OntoTask[];
	const edgesData = (edgesResult.data ?? []) as OntoEdge[];

	const filteredTasks =
		shouldFetch('task') && excludeCompletedTasks
			? tasksData.filter((task) => task.state_key !== 'done')
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

	const plansByProject = groupByProjectId((plansResult.data ?? []) as OntoPlan[]);
	const tasksByProject = groupByProjectId(filteredTasks);
	const goalsByProject = groupByProjectId((goalsResult.data ?? []) as OntoGoal[]);
	const milestonesByProject = groupByProjectId((milestonesResult.data ?? []) as OntoMilestone[]);
	const documentsByProject = groupByProjectId((documentsResult.data ?? []) as OntoDocument[]);
	const requirementsByProject = groupByProjectId(
		(requirementsResult.data ?? []) as OntoRequirement[]
	);
	const metricsByProject = groupByProjectId((metricsResult.data ?? []) as OntoMetric[]);
	const sourcesByProject = groupByProjectId((sourcesResult.data ?? []) as OntoSource[]);
	const risksByProject = groupByProjectId((risksResult.data ?? []) as OntoRisk[]);
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
		.select('*')
		.eq('created_by', actorId)
		.order('updated_at', { ascending: false });

	if (projectsError || !projects) {
		console.error('[ProjectGraphLoader] Failed to load projects:', projectsError);
		return [];
	}

	if (projects.length === 0) {
		return [];
	}

	const projectIds = projects.map((p) => p.id);

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

	return (projects as OntoProject[]).map((project) => ({
		project,
		taskCount: taskCountsByProject.get(project.id) ?? 0,
		planCount: planCountsByProject.get(project.id) ?? 0,
		edgeCount: edgeCountsByProject.get(project.id) ?? 0
	}));
}
