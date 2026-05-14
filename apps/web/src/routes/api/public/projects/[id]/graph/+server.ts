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
import { parseDocStructure } from '$lib/services/ontology/doc-structure.service';
import type {
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';
import type { OntoEvent } from '$lib/types/onto';
import type {
	DocStructure,
	DocTreeNode,
	OntoDocument,
	OntoEdge,
	OntoGoal,
	OntoMilestone,
	OntoPlan,
	OntoProject,
	OntoRisk,
	OntoTask
} from '$lib/types/onto-api';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

const DEFAULT_NODE_LIMIT = 600;
const VIEW_MODES: ViewMode[] = ['full', 'projects'];
const PUBLIC_GRAPH_KINDS = new Set([
	'project',
	'task',
	'document',
	'plan',
	'goal',
	'milestone',
	'risk'
]);

const PUBLIC_PROJECT_COLUMNS = [
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
	'icon_svg',
	'icon_concept',
	'next_step_short'
].join(',');

const PUBLIC_PLAN_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'description',
	'state_key',
	'created_at',
	'updated_at'
].join(',');

const PUBLIC_TASK_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'description',
	'state_key',
	'priority',
	'created_at',
	'updated_at',
	'start_at',
	'due_at',
	'completed_at'
].join(',');

const PUBLIC_GOAL_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'name',
	'description',
	'state_key',
	'target_date',
	'created_at',
	'updated_at',
	'completed_at'
].join(',');

const PUBLIC_MILESTONE_COLUMNS = [
	'id',
	'project_id',
	'title',
	'type_key',
	'state_key',
	'due_at',
	'completed_at',
	'description',
	'created_at',
	'updated_at'
].join(',');

const PUBLIC_DOCUMENT_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'title',
	'state_key',
	'description',
	'created_at',
	'updated_at'
].join(',');

const PUBLIC_RISK_COLUMNS = [
	'id',
	'project_id',
	'title',
	'type_key',
	'probability',
	'impact',
	'state_key',
	'created_at',
	'updated_at',
	'mitigated_at'
].join(',');

const PUBLIC_EDGE_COLUMNS = [
	'id',
	'project_id',
	'src_id',
	'src_kind',
	'dst_id',
	'dst_kind',
	'rel',
	'props'
].join(',');

const PUBLIC_EVENT_COLUMNS = [
	'id',
	'project_id',
	'type_key',
	'state_key',
	'title',
	'description',
	'location',
	'start_at',
	'end_at',
	'all_day',
	'timezone'
].join(',');

type QueryResult = {
	data: unknown;
	error: { message?: string } | null;
};

type PublicProjectRow = Record<string, any>;

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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickPublicProjectProps(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {};
	const props: Record<string, unknown> = {};
	if (typeof value.commander === 'string') {
		props.commander = value.commander;
	}
	return props;
}

function pickPublicEdgeProps(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) return {};
	const props: Record<string, unknown> = {};
	if (value.inferred === true) props.inferred = true;
	if (typeof value.weight === 'number' && Number.isFinite(value.weight))
		props.weight = value.weight;
	return props;
}

function rowsOrEmpty<T>(name: string, result: QueryResult): T[] {
	if (result.error) {
		console.warn(`[Public Project Graph API] Failed to load ${name}:`, result.error.message);
		return [];
	}
	return Array.isArray(result.data) ? (result.data as T[]) : [];
}

function toPublicProject(row: PublicProjectRow, docStructure: DocStructure): OntoProject {
	return {
		id: row.id,
		name: row.name,
		description: row.description ?? null,
		type_key: row.type_key ?? 'project',
		state_key: row.state_key ?? 'active',
		props: pickPublicProjectProps(row.props),
		start_at: row.start_at ?? null,
		end_at: row.end_at ?? null,
		facet_context: row.facet_context ?? null,
		facet_scale: row.facet_scale ?? null,
		facet_stage: row.facet_stage ?? null,
		doc_structure: docStructure,
		next_step_short: row.next_step_short ?? null
	} as OntoProject;
}

function toPublicTasks(rows: PublicProjectRow[]): OntoTask[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id,
				type_key: row.type_key,
				title: row.title,
				description: row.description ?? null,
				state_key: row.state_key,
				priority: typeof row.priority === 'number' ? row.priority : 5,
				created_at: row.created_at,
				updated_at: row.updated_at,
				start_at: row.start_at ?? null,
				due_at: row.due_at ?? null,
				completed_at: row.completed_at ?? null
			}) as OntoTask
	);
}

function toPublicDocuments(rows: PublicProjectRow[]): OntoDocument[] {
	return rows
		.filter((row) => row.state_key !== 'archived')
		.map(
			(row) =>
				({
					id: row.id,
					project_id: row.project_id,
					type_key: row.type_key,
					title: row.title,
					state_key: row.state_key,
					description: row.description ?? null,
					created_at: row.created_at,
					updated_at: row.updated_at
				}) as OntoDocument
		);
}

function toPublicPlans(rows: PublicProjectRow[]): OntoPlan[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id,
				type_key: row.type_key,
				name: row.name,
				description: row.description ?? null,
				state_key: row.state_key,
				created_at: row.created_at,
				updated_at: row.updated_at
			}) as OntoPlan
	);
}

function toPublicGoals(rows: PublicProjectRow[]): OntoGoal[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id,
				type_key: row.type_key ?? null,
				name: row.name,
				description: row.description ?? null,
				state_key: row.state_key ?? null,
				target_date: row.target_date ?? null,
				created_at: row.created_at,
				updated_at: row.updated_at,
				completed_at: row.completed_at ?? null
			}) as OntoGoal
	);
}

function toPublicMilestones(rows: PublicProjectRow[]): OntoMilestone[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id,
				title: row.title,
				type_key: row.type_key ?? null,
				state_key: row.state_key ?? null,
				due_at: row.due_at ?? null,
				completed_at: row.completed_at ?? null,
				description: row.description ?? null,
				created_at: row.created_at,
				updated_at: row.updated_at
			}) as OntoMilestone
	);
}

function toPublicRisks(rows: PublicProjectRow[]): OntoRisk[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id,
				title: row.title,
				type_key: row.type_key ?? null,
				probability: row.probability ?? null,
				impact: row.impact,
				state_key: row.state_key,
				created_at: row.created_at,
				updated_at: row.updated_at,
				mitigated_at: row.mitigated_at ?? null
			}) as OntoRisk
	);
}

function toPublicEvents(rows: PublicProjectRow[]): OntoEvent[] {
	return rows.map(
		(row) =>
			({
				id: row.id,
				project_id: row.project_id ?? null,
				type_key: row.type_key,
				state_key: row.state_key,
				title: row.title,
				description: row.description ?? null,
				location: row.location ?? null,
				start_at: row.start_at,
				end_at: row.end_at ?? null,
				all_day: Boolean(row.all_day),
				timezone: row.timezone ?? null
			}) as OntoEvent
	);
}

function sanitizeDocTreeNode(
	node: DocTreeNode,
	documentsById: Map<string, OntoDocument>
): DocTreeNode | null {
	const children = (node.children ?? [])
		.map((child) => sanitizeDocTreeNode(child, documentsById))
		.filter((child): child is DocTreeNode => child !== null);
	const isFolder = node.type === 'folder' || children.length > 0;

	if (isFolder) {
		if (children.length === 0) return null;
		return {
			id: node.id,
			type: 'folder',
			title: node.title ?? null,
			order: node.order,
			children
		};
	}

	const document = documentsById.get(node.id);
	if (!document) return null;

	return {
		id: document.id,
		type: 'doc',
		title: document.title,
		description: document.description ?? null,
		order: node.order
	};
}

function sanitizePublicDocStructure(value: unknown, documents: OntoDocument[]): DocStructure {
	const parsed = parseDocStructure(value);
	const documentsById = new Map(documents.map((document) => [document.id, document]));

	return {
		version: parsed.version,
		root: parsed.root
			.map((node) => sanitizeDocTreeNode(node, documentsById))
			.filter((node): node is DocTreeNode => node !== null)
	};
}

function getVisibleEntityKeys(sourceData: Omit<GraphSourceData, 'edges'>): Set<string> {
	return new Set([
		...sourceData.projects.map((project) => `project:${project.id}`),
		...sourceData.tasks.map((task) => `task:${task.id}`),
		...sourceData.documents.map((document) => `document:${document.id}`),
		...sourceData.plans.map((plan) => `plan:${plan.id}`),
		...sourceData.goals.map((goal) => `goal:${goal.id}`),
		...sourceData.milestones.map((milestone) => `milestone:${milestone.id}`),
		...(sourceData.risks ?? []).map((risk) => `risk:${risk.id}`)
	]);
}

function toPublicEdges(rows: PublicProjectRow[], visibleEntityKeys: Set<string>): OntoEdge[] {
	return rows
		.filter(
			(row) =>
				PUBLIC_GRAPH_KINDS.has(row.src_kind) &&
				PUBLIC_GRAPH_KINDS.has(row.dst_kind) &&
				visibleEntityKeys.has(`${row.src_kind}:${row.src_id}`) &&
				visibleEntityKeys.has(`${row.dst_kind}:${row.dst_id}`)
		)
		.map(
			(row) =>
				({
					id: row.id,
					project_id: row.project_id,
					src_id: row.src_id,
					src_kind: row.src_kind,
					dst_id: row.dst_id,
					dst_kind: row.dst_kind,
					rel: row.rel,
					props: pickPublicEdgeProps(row.props)
				}) as OntoEdge
		);
}

async function loadPublicGraphSource(
	admin: ReturnType<typeof createAdminSupabaseClient>,
	project: PublicProjectRow
): Promise<GraphSourceData> {
	const [
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		documentsResult,
		risksResult,
		edgesResult
	] = await Promise.all([
		admin
			.from('onto_plans')
			.select(PUBLIC_PLAN_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin
			.from('onto_tasks')
			.select(PUBLIC_TASK_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin
			.from('onto_goals')
			.select(PUBLIC_GOAL_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin
			.from('onto_milestones')
			.select(PUBLIC_MILESTONE_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin
			.from('onto_documents')
			.select(PUBLIC_DOCUMENT_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin
			.from('onto_risks')
			.select(PUBLIC_RISK_COLUMNS)
			.eq('project_id', project.id)
			.is('deleted_at', null)
			.is('archived_at', null),
		admin.from('onto_edges').select(PUBLIC_EDGE_COLUMNS).eq('project_id', project.id)
	]);

	const tasks = toPublicTasks(rowsOrEmpty<PublicProjectRow>('tasks', tasksResult));
	const documents = toPublicDocuments(
		rowsOrEmpty<PublicProjectRow>('documents', documentsResult)
	);
	const plans = toPublicPlans(rowsOrEmpty<PublicProjectRow>('plans', plansResult));
	const goals = toPublicGoals(rowsOrEmpty<PublicProjectRow>('goals', goalsResult));
	const milestones = toPublicMilestones(
		rowsOrEmpty<PublicProjectRow>('milestones', milestonesResult)
	);
	const risks = toPublicRisks(rowsOrEmpty<PublicProjectRow>('risks', risksResult));
	const docStructure = sanitizePublicDocStructure(project.doc_structure, documents);
	const publicProject = toPublicProject(project, docStructure);

	const sourceWithoutEdges = {
		projects: [publicProject],
		tasks,
		documents,
		plans,
		goals,
		milestones,
		risks
	};
	const visibleEntityKeys = getVisibleEntityKeys(sourceWithoutEdges);
	const edges = toPublicEdges(
		rowsOrEmpty<PublicProjectRow>('edges', edgesResult),
		visibleEntityKeys
	);

	return {
		...sourceWithoutEdges,
		edges
	};
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

		// Keep this route public-only even for authenticated users.
		// Also pull the icon + doc_structure here so we don't need another roundtrip.
		const admin = createAdminSupabaseClient();
		const { data: project, error: projectError } = await admin
			.from('onto_projects')
			.select(PUBLIC_PROJECT_COLUMNS)
			.eq('id', id)
			.eq('is_public', true)
			.is('deleted_at', null)
			.is('archived_at', null)
			.maybeSingle();

		if (projectError || !project) {
			return ApiResponse.notFound('Public project not found');
		}

		const projectRow = project as unknown as PublicProjectRow;
		const [sourceData, eventsResult] = await Promise.all([
			loadPublicGraphSource(admin, projectRow),
			admin
				.from('onto_events')
				.select(PUBLIC_EVENT_COLUMNS)
				.eq('project_id', id)
				.is('deleted_at', null)
		]);

		const events = toPublicEvents(rowsOrEmpty<PublicProjectRow>('events', eventsResult)).filter(
			(event) => event.state_key !== 'cancelled' && event.state_key !== 'canceled'
		);

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
			activeProjects: sourceData.projects[0]?.state_key === 'active' ? 1 : 0,
			totalEdges: sourceData.edges.length,
			totalTasks: sourceData.tasks.length,
			totalDocuments: sourceData.documents.length,
			totalPlans: sourceData.plans.length,
			totalGoals: sourceData.goals.length,
			totalMilestones: sourceData.milestones.length,
			totalRisks: sourceData.risks?.length ?? 0
		};

		const publicProject = sourceData.projects[0];
		if (!publicProject) {
			return ApiResponse.notFound('Public project not found');
		}

		return ApiResponse.success({
			source: { ...sourceData, events },
			graph: graphData,
			stats,
			project: {
				id: publicProject.id,
				name: publicProject.name,
				description: publicProject.description ?? null,
				props:
					Object.keys(publicProject.props ?? {}).length > 0 ? publicProject.props : null,
				state_key: publicProject.state_key,
				start_at: publicProject.start_at ?? null,
				end_at: publicProject.end_at ?? null,
				type_key: publicProject.type_key,
				icon_svg: typeof projectRow.icon_svg === 'string' ? projectRow.icon_svg : null,
				icon_concept:
					typeof projectRow.icon_concept === 'string' ? projectRow.icon_concept : null,
				doc_structure: publicProject.doc_structure ?? null,
				next_step_short: publicProject.next_step_short ?? null
			},
			metadata: {
				viewMode,
				projectId: publicProject.id,
				isPublic: true,
				generatedAt: new Date().toISOString()
			}
		});
	} catch (err) {
		console.error('[Public Project Graph API] Unexpected error', err);
		return ApiResponse.internalError(err, 'Failed to load public project graph');
	}
};
