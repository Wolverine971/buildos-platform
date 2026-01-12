// apps/web/src/routes/api/onto/projects/[id]/graph/+server.ts
/**
 * GET /api/onto/projects/[id]/graph
 * Returns a graph dataset scoped to a single ontology project.
 *
 * Uses the efficient project-scoped query pattern with project_id index.
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
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import { logOntologyApiError } from '../../../shared/error-logging';

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

export const GET: RequestHandler = async ({ params, locals, url }) => {
	try {
		const { user } = await locals.safeGetSession();

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

		const supabase = locals.supabase;

		if (user) {
			const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

			if (actorResult.error || !actorResult.data) {
				console.error('[Project Graph API] Failed to resolve actor', actorResult.error);
				await logOntologyApiError({
					supabase,
					error: actorResult.error || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}/graph`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_actor_resolve'
				});
				return ApiResponse.error('Failed to resolve user actor', 500);
			}
		}

		const { data: hasAccess, error: accessError } = await supabase.rpc(
			'current_actor_has_project_access',
			{
				p_project_id: id,
				p_required_access: 'read'
			}
		);

		if (accessError) {
			console.error('[Project Graph API] Failed to check access', accessError);
			await logOntologyApiError({
				supabase,
				error: accessError,
				endpoint: `/api/onto/projects/${id}/graph`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_graph_access'
			});
			return ApiResponse.error('Failed to check project access', 500);
		}

		if (!hasAccess) {
			return user
				? ApiResponse.forbidden('You do not have permission to access this project')
				: ApiResponse.notFound('Project not found');
		}

		// Verify project exists and user has permission
		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('id')
			.eq('id', id)
			.is('deleted_at', null)
			.single();

		if (projectError || !project) {
			if (projectError) {
				await logOntologyApiError({
					supabase,
					error: projectError,
					endpoint: `/api/onto/projects/${id}/graph`,
					method: 'GET',
					userId: user?.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_graph_access',
					tableName: 'onto_projects'
				});
			}
			return ApiResponse.notFound('Project not found');
		}

		// Load all project data using efficient parallel queries with project_id index
		const data = await loadProjectGraphData(supabase, id);

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
			(edge) => edge.src_kind !== 'template' && edge.dst_kind !== 'template'
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
			metadata: {
				viewMode,
				projectId: data.project.id,
				queryPattern: 'efficient-project-id-index',
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Project Graph API] Unexpected error', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/graph`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_graph_load'
		});
		return ApiResponse.internalError(err, 'Failed to load project graph');
	}
};
