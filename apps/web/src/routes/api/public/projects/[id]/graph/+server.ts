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
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';
import type {
	OntoProject,
	OntoPlan,
	OntoTask,
	OntoGoal,
	OntoMilestone,
	OntoDocument,
	OntoRisk,
	OntoEdge
} from '$lib/types/onto-api';

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

export const GET: RequestHandler = async ({ params, url }) => {
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

		// Use admin client to bypass RLS and fetch public projects
		const supabase = createAdminSupabaseClient();

		// Verify project exists and is public
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('*')
			.eq('id', id)
			.eq('is_public', true)
			.single();

		if (projectError || !project) {
			return ApiResponse.notFound('Public project not found');
		}

		// Load all project data using efficient parallel queries
		const [
			plansResult,
			tasksResult,
			goalsResult,
			milestonesResult,
			documentsResult,
			risksResult,
			edgesResult
		] = await Promise.all([
			supabase.from('onto_plans').select('*').eq('project_id', id),
			supabase.from('onto_tasks').select('*').eq('project_id', id),
			supabase.from('onto_goals').select('*').eq('project_id', id),
			supabase.from('onto_milestones').select('*').eq('project_id', id),
			supabase.from('onto_documents').select('*').eq('project_id', id),
			supabase.from('onto_risks').select('*').eq('project_id', id),
			supabase.from('onto_edges').select('*').eq('project_id', id)
		]);

		// Build source data for graph service
		const sourceData: GraphSourceData = {
			projects: [project as OntoProject],
			edges: (edgesResult.data ?? []) as OntoEdge[],
			tasks: (tasksResult.data ?? []) as OntoTask[],
			documents: (documentsResult.data ?? []) as OntoDocument[],
			plans: (plansResult.data ?? []) as OntoPlan[],
			goals: (goalsResult.data ?? []) as OntoGoal[],
			milestones: (milestonesResult.data ?? []) as OntoMilestone[],
			risks: (risksResult.data ?? []) as OntoRisk[]
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
			activeProjects: project.state_key === 'active' ? 1 : 0,
			totalEdges: sourceData.edges.length,
			totalTasks: (tasksResult.data ?? []).length,
			totalDocuments: (documentsResult.data ?? []).length,
			totalPlans: (plansResult.data ?? []).length,
			totalGoals: (goalsResult.data ?? []).length,
			totalMilestones: (milestonesResult.data ?? []).length,
			totalRisks: (risksResult.data ?? []).length
		};

		return ApiResponse.success({
			source: sourceData,
			graph: graphData,
			stats,
			project: {
				id: project.id,
				name: project.name,
				description: project.description,
				props: project.props,
				state_key: project.state_key,
				start_at: project.start_at,
				end_at: project.end_at
			},
			metadata: {
				viewMode,
				projectId: project.id,
				isPublic: true,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Public Project Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load public project graph');
	}
};
