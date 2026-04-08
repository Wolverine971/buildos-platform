// apps/web/src/routes/api/public/projects/[id]/graph/+server.ts
/**
 * GET /api/public/projects/[id]/graph
 *
 * Returns graph data for a public project (is_public = true).
 * This endpoint does NOT require authentication.
 *
 * Used for displaying example projects on the homepage.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';

const DEFAULT_NODE_LIMIT = 600;
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

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}

		const viewMode = parseViewMode(url.searchParams.get('viewMode'));
		if (!viewMode) {
			return ApiResponse.badRequest('Invalid viewMode parameter');
		}

		const limit = parseLimit(url.searchParams.get('limit'));
		if (limit === null) {
			return ApiResponse.badRequest('Invalid limit parameter');
		}

		// Keep this route public-only even for authenticated users.
		const { data: project, error: projectError } = await locals.supabase
			.from('onto_projects')
			.select('id, is_public')
			.eq('id', id)
			.is('deleted_at', null)
			.maybeSingle();

		if (projectError || !project?.is_public) {
			return ApiResponse.notFound('Public project not found');
		}

		const data = await loadProjectGraphData(locals.supabase, id);

		// Build source data for graph service
		const sourceData: GraphSourceData = {
			projects: [data.project],
			edges: data.edges,
			tasks: data.tasks,
			documents: data.documents,
			plans: data.plans,
			goals: data.goals,
			milestones: data.milestones,
			risks: data.risks
		};

		// Filter out template edges
		sourceData.edges = sourceData.edges.filter(
			(edge) =>
				edge.src_kind !== 'template' &&
				edge.dst_kind !== 'template' &&
				edge.src_kind !== 'event' &&
				edge.dst_kind !== 'event'
		);

		const graphData = OntologyGraphService.buildGraphData(sourceData, viewMode);

		if (graphData.nodes.length > limit) {
			return ApiResponse.error(
				`Project graph exceeds node limit of ${limit}.`,
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
			totalRisks: data.risks.length
		};

		return ApiResponse.success({
			source: sourceData,
			graph: graphData,
			stats,
			project: {
				id: data.project.id,
				name: data.project.name,
				description: data.project.description,
				props: data.project.props,
				state_key: data.project.state_key,
				start_at: data.project.start_at,
				end_at: data.project.end_at
			},
			metadata: {
				viewMode,
				projectId: data.project.id,
				isPublic: true,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Public Project Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load public project graph');
	}
};
