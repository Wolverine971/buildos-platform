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
import type { GraphSourceData, ViewMode } from '$lib/components/ontology/graph/lib/graph.types';
import {
	loadProjectGraphData,
	loadMultipleProjectGraphs
} from '$lib/services/ontology/project-graph-loader';
import { buildWorkspaceGraphPayload } from './workspace-graph-limit';
import { loadGraphScopeCountTotals } from './workspace-graph-counts';
import {
	parseGraphScopeFilters,
	type GraphScopeFilters
} from '$lib/components/ontology/graph/lib/graph.filters';

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

type SupabaseClient = Parameters<typeof loadProjectGraphData>[0];
type ProjectRow = {
	id: string;
	created_by?: string | null;
	created_at?: string | null;
	updated_at?: string | null;
};

type ActorProjectScopeMetadata = {
	type: 'actor-project-access';
	actorId: string;
	projectCount: number;
	ownedProjectCount: number;
	memberProjectCount: number;
};

type ActorProjectsResult = {
	projects: ProjectRow[];
	projectScope: ActorProjectScopeMetadata;
};

const READ_ACCESS_LEVELS = new Set(['read', 'write', 'admin']);

async function loadProjectsForActor(
	supabase: SupabaseClient,
	actorId: string
): Promise<ActorProjectsResult> {
	const { data: memberRows, error: memberError } = await supabase
		.from('onto_project_members')
		.select('project_id')
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (memberError) {
		throw memberError;
	}

	const memberProjectIds = Array.from(
		new Set(
			(memberRows ?? [])
				.map((row) => row?.project_id)
				.filter((value): value is string => typeof value === 'string' && value.length > 0)
		)
	);

	const ownedProjectsPromise = supabase
		.from('onto_projects')
		.select('id, created_by, created_at, updated_at')
		.eq('created_by', actorId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });

	const sharedProjectsPromise =
		memberProjectIds.length > 0
			? supabase
					.from('onto_projects')
					.select('id, created_by, created_at, updated_at')
					.in('id', memberProjectIds)
					.is('deleted_at', null)
					.order('updated_at', { ascending: false })
			: Promise.resolve({ data: [], error: null });

	const [ownedProjects, sharedProjects] = await Promise.all([
		ownedProjectsPromise,
		sharedProjectsPromise
	]);

	if (ownedProjects.error) throw ownedProjects.error;
	if (sharedProjects.error) throw sharedProjects.error;

	const projectsById = new Map<string, ProjectRow>();
	const ownedProjectRows = (ownedProjects.data ?? []) as ProjectRow[];
	const sharedProjectRows = (sharedProjects.data ?? []) as ProjectRow[];
	const ownedProjectIds = new Set(ownedProjectRows.map((project) => project.id).filter(Boolean));
	const memberOnlyProjectCount = sharedProjectRows.filter(
		(project) => !ownedProjectIds.has(project.id)
	).length;

	for (const project of [...ownedProjectRows, ...sharedProjectRows]) {
		if (!project?.id || projectsById.has(project.id)) continue;
		projectsById.set(project.id, project);
	}

	const projects = Array.from(projectsById.values()).sort((a, b) => {
		const bTime = Date.parse(b.updated_at ?? b.created_at ?? '');
		const aTime = Date.parse(a.updated_at ?? a.created_at ?? '');
		return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
	});

	return {
		projects,
		projectScope: {
			type: 'actor-project-access',
			actorId,
			projectCount: projects.length,
			ownedProjectCount: ownedProjectRows.length,
			memberProjectCount: memberOnlyProjectCount
		}
	};
}

async function currentActorHasExplicitProjectReadAccess(
	supabase: SupabaseClient,
	actorId: string,
	projectId: string
): Promise<{ hasAccess: boolean; projectExists: boolean; accessVia: 'owner' | 'member' | null }> {
	const { data: project, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, created_by')
		.eq('id', projectId)
		.is('deleted_at', null)
		.single();

	if (projectError || !project) {
		return { hasAccess: false, projectExists: false, accessVia: null };
	}

	if ((project as ProjectRow).created_by === actorId) {
		return { hasAccess: true, projectExists: true, accessVia: 'owner' };
	}

	const { data: memberRows, error: memberError } = await supabase
		.from('onto_project_members')
		.select('access')
		.eq('project_id', projectId)
		.eq('actor_id', actorId)
		.is('removed_at', null);

	if (memberError) {
		throw memberError;
	}

	const hasAccess = (memberRows ?? []).some((row) => READ_ACCESS_LEVELS.has(row?.access));
	return { hasAccess, projectExists: true, accessVia: hasAccess ? 'member' : null };
}

/**
 * Handle single-project graph loading using efficient parallel queries.
 * Uses project_id index on all tables for O(1) lookups.
 *
 * This is the new efficient path introduced by PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */
async function handleSingleProjectGraph(
	supabase: SupabaseClient,
	actorId: string,
	projectId: string,
	viewMode: ViewMode,
	limit: number,
	scopeFilters: GraphScopeFilters
): Promise<Response> {
	try {
		let explicitAccess: Awaited<ReturnType<typeof currentActorHasExplicitProjectReadAccess>>;
		try {
			explicitAccess = await currentActorHasExplicitProjectReadAccess(
				supabase,
				actorId,
				projectId
			);
		} catch (accessError) {
			console.error('[Ontology Graph API] Failed to check access', accessError);
			return ApiResponse.internalError(accessError, 'Failed to check project access');
		}

		if (!explicitAccess.projectExists) {
			return ApiResponse.notFound('Project');
		}

		if (!explicitAccess.hasAccess) {
			return ApiResponse.forbidden('You do not have permission to view this project');
		}

		// Load graph rows and count-only metadata in parallel.
		const [data, scopeCountTotals] = await Promise.all([
			loadProjectGraphData(supabase, projectId, {
				excludeCompletedTasks: !scopeFilters.showDoneTasks
			}),
			loadGraphScopeCountTotals(supabase, [projectId])
		]);

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

		const payload = buildWorkspaceGraphPayload(
			sourceData,
			viewMode,
			limit,
			scopeFilters,
			scopeCountTotals
		);

		return ApiResponse.success({
			source: payload.source,
			graph: payload.graph,
			stats: payload.stats,
			metadata: {
				viewMode,
				projectId,
				queryPattern: 'efficient-single-project',
				...payload.limitMetadata,
				projectScope: {
					type: 'actor-project-access',
					actorId,
					projectCount: 1,
					ownedProjectCount: explicitAccess.accessVia === 'owner' ? 1 : 0,
					memberProjectCount: explicitAccess.accessVia === 'member' ? 1 : 0
				},
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
		const scopeFilters = parseGraphScopeFilters(url.searchParams);

		const supabase = locals.supabase;

		const actorResult = await supabase.rpc('ensure_actor_for_user', { p_user_id: user.id });

		if (actorResult.error || !actorResult.data) {
			console.error('[Ontology Graph API] Failed to resolve actor', actorResult.error);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		// Check for projectId parameter - use efficient single-project loading
		const projectId = url.searchParams.get('projectId');
		if (projectId) {
			return await handleSingleProjectGraph(
				supabase,
				actorResult.data as string,
				projectId,
				viewMode,
				limit,
				scopeFilters
			);
		}

		let actorProjects: Awaited<ReturnType<typeof loadProjectsForActor>>;
		try {
			actorProjects = await loadProjectsForActor(supabase, actorResult.data as string);
		} catch (projectsError) {
			console.error('[Ontology Graph API] Failed to fetch actor projects', projectsError);
			return ApiResponse.databaseError(projectsError);
		}

		const { projects, projectScope } = actorProjects;
		const projectIds = projects.map((project) => project.id);

		if (projectIds.length === 0) {
			const emptySource: GraphSourceData = {
				projects: [],
				edges: [],
				tasks: [],
				documents: [],
				plans: [],
				goals: [],
				milestones: [],
				risks: []
			};
			const payload = buildWorkspaceGraphPayload(emptySource, viewMode, limit, scopeFilters);

			return ApiResponse.success({
				source: payload.source,
				graph: payload.graph,
				stats: payload.stats,
				metadata: {
					viewMode,
					...payload.limitMetadata,
					projectScope,
					generatedAt: new Date().toISOString()
				}
			});
		}

		const [graphs, scopeCountTotals] = await Promise.all([
			loadMultipleProjectGraphs(supabase, projectIds, {
				excludeCompletedTasks: !scopeFilters.showDoneTasks
			}),
			loadGraphScopeCountTotals(supabase, projectIds)
		]);
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
			milestones: [],
			risks: []
		};

		for (const project of projects) {
			const graph = graphs.get(project.id);
			if (!graph) continue;

			sourceData.projects.push(graph.project);
			sourceData.tasks.push(...graph.tasks);
			sourceData.documents.push(...graph.documents);
			sourceData.plans.push(...graph.plans);
			sourceData.goals.push(...graph.goals);
			sourceData.milestones.push(...graph.milestones);
			sourceData.risks?.push(...graph.risks);
			sourceData.edges.push(...graph.edges);
		}

		// Filter out template edges
		sourceData.edges = sourceData.edges.filter(
			(edge) => edge.src_kind !== 'template' && edge.dst_kind !== 'template'
		);

		const payload = buildWorkspaceGraphPayload(
			sourceData,
			viewMode,
			limit,
			scopeFilters,
			scopeCountTotals
		);

		return ApiResponse.success({
			source: payload.source,
			graph: payload.graph,
			stats: payload.stats,
			metadata: {
				viewMode,
				...payload.limitMetadata,
				projectScope,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Ontology Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load ontology graph');
	}
};
