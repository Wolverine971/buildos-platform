// apps/web/src/routes/api/onto/graph/+server.ts
/**
 * GET /api/onto/graph
 * Returns ontology graph datasets scoped to the authenticated actor.
 *
 * Query Parameters:
 * - projectId: Optional. If provided, uses efficient single-project loading pattern
 * - viewMode: 'full' | 'projects' (default: 'full')
 * - limit: Maximum number of nodes (default: 1000)
 *
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';
import type { OntoProject } from '$lib/types/onto-api';
import {
	loadProjectGraphData,
	loadMultipleProjectGraphs
} from '$lib/services/ontology/project-graph-loader';

const DEFAULT_NODE_LIMIT = 1000;
const VIEW_MODES: ViewMode[] = ['full', 'projects'];

function parseViewMode(raw: string | null): ViewMode | null {
	if (!raw) return 'full';
	return VIEW_MODES.includes(raw as ViewMode) ? (raw as ViewMode) : null;
}

function parseLimit(raw: string | null): number | null {
	if (!raw) return DEFAULT_NODE_LIMIT;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

/**
 * Handle single-project graph loading using efficient parallel queries.
 * Uses project_id index on all tables for O(1) lookups.
 *
 * This is the new efficient path introduced by PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */
async function handleSingleProjectGraph(
	supabase: Parameters<typeof loadProjectGraphData>[0],
	projectId: string,
	viewMode: ViewMode,
	limit: number
): Promise<Response> {
	try {
		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: projectId,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Ontology Graph API] Failed to check access', accessError);
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!hasAccess) {
			return ApiResponse.forbidden('You do not have permission to view this project');
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Project');
		}

		// Load all project data in parallel using efficient pattern
		const data = await loadProjectGraphData(supabase, projectId, {
			excludeCompletedTasks: true
		});

		// Build source data for graph service
		const sourceData: GraphSourceData = {
			projects: [data.project],
			edges: data.edges,
			tasks: data.tasks,
			documents: data.documents,
			plans: data.plans,
			goals: data.goals,
			milestones: data.milestones
		};

		// Filter out template edges
		sourceData.edges = sourceData.edges.filter(
			(edge) => edge.src_kind !== 'template' && edge.dst_kind !== 'template'
		);

		const graphData = OntologyGraphService.buildGraphData(sourceData, viewMode);

		if (graphData.nodes.length > limit) {
			return ApiResponse.error(
				`Ontology graph exceeds node limit of ${limit}. Refine your data or contact support.`,
				413,
				'GRAPH_LIMIT_EXCEEDED',
				{
					nodeCount: graphData.nodes.length,
					edgeCount: graphData.edges.length
				}
			);
		}

		const stats: GraphStats = {
			totalProjects: 1,
			activeProjects: data.project.state_key === 'active' ? 1 : 0,
			totalEdges: sourceData.edges.length,
			totalTasks: data.tasks.length,
			totalDocuments: data.documents.length,
			totalPlans: data.plans.length,
			totalGoals: data.goals.length,
			totalMilestones: data.milestones.length,
			totalRisks: data.risks?.length ?? 0
		};

		return ApiResponse.success({
			source: sourceData,
			graph: graphData,
			stats,
			metadata: {
				viewMode,
				projectId,
				queryPattern: 'efficient-single-project',
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Ontology Graph API] Error loading single project graph', err);
		return ApiResponse.internalError(err, 'Failed to load project graph');
	}
}

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const { user } = await locals.safeGetSession();

		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const viewMode = parseViewMode(url.searchParams.get('viewMode'));
		if (!viewMode) {
			return ApiResponse.badRequest('Invalid viewMode parameter');
		}

		const limit = parseLimit(url.searchParams.get('limit'));
		if (limit === null) {
			return ApiResponse.badRequest('Invalid limit parameter');
		}

		const supabase = locals.supabase;

		const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

		if (actorResult.error || !actorResult.data) {
			console.error('[Ontology Graph API] Failed to resolve actor', actorResult.error);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Check for projectId parameter - use efficient single-project loading
		const projectId = url.searchParams.get('projectId');
		if (projectId) {
			return await handleSingleProjectGraph(supabase, projectId, viewMode, limit);
		}

		// Multi-project loading (legacy path)
		const { data: projects, error: projectsError } = await supabase
			.from('onto_projects')
			.select('*')
			.is('deleted_at', null)
			.order('updated_at', { ascending: false });

		if (projectsError) {
			console.error('[Ontology Graph API] Failed to fetch projects', projectsError);
			return ApiResponse.databaseError(projectsError);
		}

		const projectIds = (projects ?? []).map((project) => project.id);

		if (projectIds.length === 0) {
			const emptySource: GraphSourceData = {
				projects: [],
				edges: [],
				tasks: [],
				documents: [],
				plans: [],
				goals: [],
				milestones: []
			};

			return ApiResponse.success({
				source: emptySource,
				graph: OntologyGraphService.buildGraphData(emptySource, viewMode),
				stats: {
					totalProjects: 0,
					activeProjects: 0,
					totalEdges: 0,
					totalTasks: 0,
					totalDocuments: 0,
					totalPlans: 0,
					totalGoals: 0,
					totalMilestones: 0
				},
				metadata: {
					viewMode,
					generatedAt: new Date().toISOString()
				}
			});
		}

		const graphs = await loadMultipleProjectGraphs(supabase, projectIds, {
			excludeCompletedTasks: true
		});
		const missingGraphs = projectIds.filter((id) => !graphs.has(id));
		if (missingGraphs.length > 0) {
			console.warn('[Ontology Graph API] Missing graph data for projects', missingGraphs);
		}

		const sourceData: GraphSourceData = {
			projects: [],
			edges: [],
			tasks: [],
			documents: [],
			plans: [],
			goals: [],
			milestones: []
		};

		for (const project of projects ?? []) {
			const graph = graphs.get(project.id);
			if (!graph) continue;

			sourceData.projects.push(project as unknown as OntoProject);
			sourceData.tasks.push(...graph.tasks);
			sourceData.documents.push(...graph.documents);
			sourceData.plans.push(...graph.plans);
			sourceData.goals.push(...graph.goals);
			sourceData.milestones.push(...graph.milestones);
			sourceData.edges.push(...graph.edges);
		}

		// Filter out template edges
		sourceData.edges = sourceData.edges.filter(
			(edge) => edge.src_kind !== 'template' && edge.dst_kind !== 'template'
		);

		const graphData = OntologyGraphService.buildGraphData(sourceData, viewMode);

		if (graphData.nodes.length > limit) {
			return ApiResponse.error(
				`Ontology graph exceeds node limit of ${limit}. Refine your data or contact support.`,
				413,
				'GRAPH_LIMIT_EXCEEDED',
				{
					nodeCount: graphData.nodes.length,
					edgeCount: graphData.edges.length
				}
			);
		}

		const stats: GraphStats = {
			totalProjects: sourceData.projects.length,
			activeProjects: sourceData.projects.filter((project) => project.state_key === 'active')
				.length,
			totalEdges: sourceData.edges.length,
			totalTasks: sourceData.tasks.length,
			totalDocuments: sourceData.documents.length,
			totalPlans: sourceData.plans.length,
			totalGoals: sourceData.goals.length,
			totalMilestones: sourceData.milestones.length
		};

		return ApiResponse.success({
			source: sourceData,
			graph: graphData,
			stats,
			metadata: {
				viewMode,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Ontology Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load ontology graph');
	}
};
