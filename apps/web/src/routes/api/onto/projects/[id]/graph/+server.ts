// apps/web/src/routes/api/onto/projects/[id]/graph/+server.ts
/**
 * GET /api/onto/projects/[id]/graph
 * Returns a graph dataset scoped to a single ontology project.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';

const DEFAULT_NODE_LIMIT = 600;
const VIEW_MODES: ViewMode[] = ['full', 'templates', 'projects'];

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

		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

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

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Project Graph API] Failed to resolve actor', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const { data: project, error: projectError } = await supabase
			.from('onto_projects')
			.select('*')
			.eq('id', id)
			.single();

		if (projectError) {
			console.error('[Project Graph API] Failed to fetch project', projectError);
			return ApiResponse.databaseError(projectError);
		}

		if (!project) {
			return ApiResponse.notFound('Project not found');
		}

		if (project.created_by !== actorId) {
			return ApiResponse.forbidden('You do not have permission to access this project');
		}

		const [tasksRes, outputsRes, documentsRes] = await Promise.all([
			supabase.from('onto_tasks').select('*').eq('project_id', id),
			supabase.from('onto_outputs').select('*').eq('project_id', id),
			supabase.from('onto_documents').select('*').eq('project_id', id)
		]);

		if (tasksRes.error) {
			console.error('[Project Graph API] Failed to fetch tasks', tasksRes.error);
			return ApiResponse.databaseError(tasksRes.error);
		}

		if (outputsRes.error) {
			console.error('[Project Graph API] Failed to fetch outputs', outputsRes.error);
			return ApiResponse.databaseError(outputsRes.error);
		}

		if (documentsRes.error) {
			console.error('[Project Graph API] Failed to fetch documents', documentsRes.error);
			return ApiResponse.databaseError(documentsRes.error);
		}

		const tasks = (tasksRes.data ?? []) as GraphSourceData['tasks'];
		const outputs = (outputsRes.data ?? []) as GraphSourceData['outputs'];
		const documents = (documentsRes.data ?? []) as GraphSourceData['documents'];

		const nodeIds = new Set<string>([project.id]);
		tasks.forEach((task) => task?.id && nodeIds.add(task.id));
		outputs.forEach((output) => output?.id && nodeIds.add(output.id));
		documents.forEach((document) => document?.id && nodeIds.add(document.id));

		let edges: GraphSourceData['edges'] = [];

		if (nodeIds.size > 0) {
			const idList = Array.from(nodeIds);
			const [edgesFromSource, edgesFromDest] = await Promise.all([
				supabase.from('onto_edges').select('*').in('src_id', idList),
				supabase.from('onto_edges').select('*').in('dst_id', idList)
			]);

			if (edgesFromSource.error) {
				console.error(
					'[Project Graph API] Failed to fetch edges (source)',
					edgesFromSource.error
				);
				return ApiResponse.databaseError(edgesFromSource.error);
			}

			if (edgesFromDest.error) {
				console.error(
					'[Project Graph API] Failed to fetch edges (destination)',
					edgesFromDest.error
				);
				return ApiResponse.databaseError(edgesFromDest.error);
			}

			const edgeMap = new Map<string, GraphSourceData['edges'][number]>();
			for (const edge of edgesFromSource.data ?? []) {
				if (edge?.id) {
					edgeMap.set(edge.id, edge as GraphSourceData['edges'][number]);
				}
			}
			for (const edge of edgesFromDest.data ?? []) {
				if (edge?.id) {
					edgeMap.set(edge.id, edge as GraphSourceData['edges'][number]);
				}
			}

			edges = Array.from(edgeMap.values());
		}

		const templateIds = new Set<string>();
		if (project.template_id) {
			templateIds.add(project.template_id);
		}

		for (const edge of edges) {
			if (edge.src_kind === 'template' && edge.src_id) {
				templateIds.add(edge.src_id);
			}
			if (edge.dst_kind === 'template' && edge.dst_id) {
				templateIds.add(edge.dst_id);
			}
		}

		let templates: GraphSourceData['templates'] = [];

		if (templateIds.size > 0) {
			const { data: templateRows, error: templatesError } = await supabase
				.from('onto_templates')
				.select('*')
				.in('id', Array.from(templateIds));

			if (templatesError) {
				console.error('[Project Graph API] Failed to fetch templates', templatesError);
				return ApiResponse.databaseError(templatesError);
			}

			templates = (templateRows ?? []) as GraphSourceData['templates'];
		}

		const allowedNodeIds = new Set<string>([
			...nodeIds,
			...templates.map((template) => template.id)
		]);

		const filteredEdges = edges.filter(
			(edge) =>
				Boolean(edge.src_id && allowedNodeIds.has(edge.src_id)) &&
				Boolean(edge.dst_id && allowedNodeIds.has(edge.dst_id))
		);

		const sourceData: GraphSourceData = {
			templates,
			projects: [project],
			edges: filteredEdges,
			tasks,
			outputs,
			documents
		};

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
			totalTemplates: templates.length,
			totalProjects: 1,
			activeProjects: project.state_key === 'active' ? 1 : 0,
			totalEdges: filteredEdges.length,
			totalTasks: tasks.length,
			totalOutputs: outputs.length,
			totalDocuments: documents.length
		};

		return ApiResponse.success({
			source: sourceData,
			graph: graphData,
			stats,
			metadata: {
				viewMode,
				projectId: project.id,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Project Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load project graph');
	}
};
