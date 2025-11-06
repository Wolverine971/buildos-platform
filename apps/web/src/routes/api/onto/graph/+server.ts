// apps/web/src/routes/api/onto/graph/+server.ts
/**
 * GET /api/onto/graph
 * Returns ontology graph datasets scoped to the authenticated actor.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';

const DEFAULT_NODE_LIMIT = 1000;
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

		const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
			p_user_id: user.id
		});

		if (actorError || !actorId) {
			console.error('[Ontology Graph API] Failed to resolve actor', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		const [templatesRes, projectsRes] = await Promise.all([
			supabase.from('onto_templates').select('*').eq('status', 'active'),
			supabase
				.from('onto_projects')
				.select('*')
				.eq('created_by', actorId)
				.order('updated_at', { ascending: false })
		]);

		if (templatesRes.error) {
			console.error('[Ontology Graph API] Failed to fetch templates', templatesRes.error);
			return ApiResponse.databaseError(templatesRes.error);
		}

		if (projectsRes.error) {
			console.error('[Ontology Graph API] Failed to fetch projects', projectsRes.error);
			return ApiResponse.databaseError(projectsRes.error);
		}

		const templates = (templatesRes.data ?? []) as GraphSourceData['templates'];
		const projects = (projectsRes.data ?? []) as GraphSourceData['projects'];

		const projectIds = projects.map((project) => project.id);

		const [tasksRes, outputsRes, documentsRes] = projectIds.length
			? await Promise.all([
					supabase.from('onto_tasks').select('*').in('project_id', projectIds),
					supabase.from('onto_outputs').select('*').in('project_id', projectIds),
					supabase.from('onto_documents').select('*').in('project_id', projectIds)
				])
			: [
					{ data: [], error: null },
					{ data: [], error: null },
					{ data: [], error: null }
				];

		if (tasksRes.error) {
			console.error('[Ontology Graph API] Failed to fetch tasks', tasksRes.error);
			return ApiResponse.databaseError(tasksRes.error);
		}

		if (outputsRes.error) {
			console.error('[Ontology Graph API] Failed to fetch outputs', outputsRes.error);
			return ApiResponse.databaseError(outputsRes.error);
		}

		if (documentsRes.error) {
			console.error('[Ontology Graph API] Failed to fetch documents', documentsRes.error);
			return ApiResponse.databaseError(documentsRes.error);
		}

		const tasks = (tasksRes.data ?? []) as GraphSourceData['tasks'];
		const outputs = (outputsRes.data ?? []) as GraphSourceData['outputs'];
		const documents = (documentsRes.data ?? []) as GraphSourceData['documents'];

		const nodeIds = new Set<string>();
		templates.forEach((template) => nodeIds.add(template.id));
		projects.forEach((project) => nodeIds.add(project.id));
		tasks.forEach((task) => nodeIds.add(task.id));
		outputs.forEach((output) => nodeIds.add(output.id));
		documents.forEach((document) => nodeIds.add(document.id));

		let edges: GraphSourceData['edges'] = [];

		if (nodeIds.size > 0) {
			const idList = Array.from(nodeIds);

			const [edgesFromSource, edgesFromDest] = await Promise.all([
				supabase.from('onto_edges').select('*').in('src_id', idList),
				supabase.from('onto_edges').select('*').in('dst_id', idList)
			]);

			if (edgesFromSource.error) {
				console.error(
					'[Ontology Graph API] Failed to fetch edges (source)',
					edgesFromSource.error
				);
				return ApiResponse.databaseError(edgesFromSource.error);
			}

			if (edgesFromDest.error) {
				console.error(
					'[Ontology Graph API] Failed to fetch edges (destination)',
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

			edges = Array.from(edgeMap.values()).filter(
				(edge) =>
					Boolean(edge.src_id && nodeIds.has(edge.src_id)) &&
					Boolean(edge.dst_id && nodeIds.has(edge.dst_id))
			);
		}

		const sourceData: GraphSourceData = {
			templates,
			projects,
			edges,
			tasks,
			outputs,
			documents
		};

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
			totalTemplates: templates.length,
			totalProjects: projects.length,
			activeProjects: projects.filter((project) => project.state_key === 'active').length,
			totalEdges: edges.length,
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
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Ontology Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load ontology graph');
	}
};
