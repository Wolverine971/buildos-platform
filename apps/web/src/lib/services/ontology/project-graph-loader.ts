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
	OntoOutput,
	OntoDocument,
	OntoRisk,
	OntoDecision,
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

	// Execute all queries in parallel - this is the key optimization!
	// Each query uses the project_id index for O(1) lookups.
	const [
		projectResult,
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		outputsResult,
		documentsResult,
		risksResult,
		decisionsResult,
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
			? supabase
					.from('onto_tasks')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
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
		shouldFetch('output')
			? supabase
					.from('onto_outputs')
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
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select('*')
					.eq('project_id', projectId)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('decision')
			? supabase
					.from('onto_decisions')
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
	logError('outputs', outputsResult.error);
	logError('documents', documentsResult.error);
	logError('risks', risksResult.error);
	logError('decisions', decisionsResult.error);
	logError('edges', edgesResult.error);

	return {
		project: projectResult.data as OntoProject,
		plans: (plansResult.data ?? []) as OntoPlan[],
		tasks: (tasksResult.data ?? []) as OntoTask[],
		goals: (goalsResult.data ?? []) as OntoGoal[],
		milestones: (milestonesResult.data ?? []) as OntoMilestone[],
		outputs: (outputsResult.data ?? []) as OntoOutput[],
		documents: (documentsResult.data ?? []) as OntoDocument[],
		risks: (risksResult.data ?? []) as OntoRisk[],
		decisions: (decisionsResult.data ?? []) as OntoDecision[],
		edges: (edgesResult.data ?? []) as OntoEdge[]
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

	// Batch load with single query per entity type
	const [
		projectsResult,
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		outputsResult,
		documentsResult,
		risksResult,
		decisionsResult,
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
			? supabase
					.from('onto_tasks')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
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
		shouldFetch('output')
			? supabase
					.from('onto_outputs')
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
		shouldFetch('risk')
			? supabase
					.from('onto_risks')
					.select('*')
					.in('project_id', projectIds)
					.is('deleted_at', null)
			: Promise.resolve({ data: [], error: null }),
		shouldFetch('decision')
			? supabase
					.from('onto_decisions')
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

	const plansByProject = groupByProjectId((plansResult.data ?? []) as OntoPlan[]);
	const tasksByProject = groupByProjectId((tasksResult.data ?? []) as OntoTask[]);
	const goalsByProject = groupByProjectId((goalsResult.data ?? []) as OntoGoal[]);
	const milestonesByProject = groupByProjectId((milestonesResult.data ?? []) as OntoMilestone[]);
	const outputsByProject = groupByProjectId((outputsResult.data ?? []) as OntoOutput[]);
	const documentsByProject = groupByProjectId((documentsResult.data ?? []) as OntoDocument[]);
	const risksByProject = groupByProjectId((risksResult.data ?? []) as OntoRisk[]);
	const decisionsByProject = groupByProjectId((decisionsResult.data ?? []) as OntoDecision[]);
	const edgesByProject = groupByProjectId((edgesResult.data ?? []) as OntoEdge[]);

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
			outputs: outputsByProject.get(projectId) ?? [],
			documents: documentsByProject.get(projectId) ?? [],
			risks: risksByProject.get(projectId) ?? [],
			decisions: decisionsByProject.get(projectId) ?? [],
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
