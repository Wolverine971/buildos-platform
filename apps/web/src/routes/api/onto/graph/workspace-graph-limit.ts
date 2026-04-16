// apps/web/src/routes/api/onto/graph/workspace-graph-limit.ts
import { OntologyGraphService } from '$lib/components/ontology/graph/lib/graph.service';
import type {
	GraphData,
	GraphSourceData,
	GraphStats,
	ViewMode
} from '$lib/components/ontology/graph/lib/graph.types';
import {
	DEFAULT_GRAPH_SCOPE_FILTERS,
	GRAPH_SCOPE_FILTER_KEYS,
	normalizeGraphScopeFilters,
	type GraphScopeCounts,
	type GraphScopeFilterKey,
	type GraphScopeFilters
} from '$lib/components/ontology/graph/lib/graph.filters';

type SourceKey = 'projects' | 'tasks' | 'documents' | 'plans' | 'goals' | 'milestones' | 'risks';
type RankedEntity = {
	id: string;
	degree: number;
	stateRank: number;
	updatedAt: number;
};

export interface WorkspaceGraphLimitMetadata {
	truncated: boolean;
	filters: GraphScopeFilters;
	scopeCounts: GraphScopeCounts;
	requestedNodeLimit: number;
	originalNodeCount: number;
	originalEdgeCount: number;
	returnedNodeCount: number;
	returnedEdgeCount: number;
	omittedNodeCount: number;
	omittedEdgeCount: number;
	inferredProjectEdgeCount: number;
}

export interface WorkspaceGraphPayload {
	source: GraphSourceData;
	graph: GraphData;
	stats: GraphStats;
	limitMetadata: WorkspaceGraphLimitMetadata;
}

const CHILD_SOURCE_KEYS: Array<Exclude<SourceKey, 'projects'>> = [
	'tasks',
	'documents',
	'plans',
	'goals',
	'milestones',
	'risks'
];

const CHILD_KIND_BY_SOURCE_KEY: Record<Exclude<SourceKey, 'projects'>, string> = {
	tasks: 'task',
	documents: 'document',
	plans: 'plan',
	goals: 'goal',
	milestones: 'milestone',
	risks: 'risk'
};

const CHILD_TYPE_WEIGHTS: Record<SourceKey, number> = {
	projects: 0,
	tasks: 0.35,
	documents: 0.16,
	plans: 0.13,
	goals: 0.12,
	milestones: 0.16,
	risks: 0.08
};

const STATE_RANKS: Record<string, number> = {
	blocked: 100,
	occurred: 95,
	in_progress: 90,
	active: 85,
	review: 75,
	pending: 70,
	todo: 65,
	draft: 55,
	deferred: 45,
	done: 20,
	complete: 20,
	completed: 20,
	achieved: 20,
	archived: 5
};

const TASK_DONE_STATES = new Set(['done', 'complete', 'completed']);
const TASK_ACTIVE_STATES = new Set(['in_progress', 'active', 'blocked']);
const PROJECT_INACTIVE_STATES = new Set(['completed', 'complete', 'cancelled', 'canceled']);
const ARCHIVED_STATES = new Set(['archived']);
const PLAN_COMPLETED_STATES = new Set(['completed', 'complete']);
const GOAL_TERMINAL_STATES = new Set(['achieved', 'abandoned']);
const MILESTONE_COMPLETED_STATES = new Set(['completed', 'complete']);
const RISK_CLOSED_STATES = new Set(['mitigated', 'closed']);

export type GraphScopeCountTotals = Partial<Record<GraphScopeFilterKey, number>>;

function getItems(source: GraphSourceData, key: SourceKey): Record<string, unknown>[] {
	return (source[key] ?? []) as unknown[] as Record<string, unknown>[];
}

function hasDeletedAt(item: Record<string, unknown>): boolean {
	return typeof item.deleted_at === 'string' && item.deleted_at.length > 0;
}

function getEntityState(item: Record<string, unknown>, key: SourceKey): string {
	if (key === 'milestones') {
		const props = item.props;
		if (props && typeof props === 'object' && 'state_key' in props) {
			return String((props as Record<string, unknown>).state_key ?? '').toLowerCase();
		}
	}

	return String(item.state_key ?? '').toLowerCase();
}

function hasSchedule(item: Record<string, unknown>): boolean {
	return (
		(typeof item.start_at === 'string' && item.start_at.length > 0) ||
		(typeof item.due_at === 'string' && item.due_at.length > 0)
	);
}

function isTaskDone(item: Record<string, unknown>): boolean {
	return (
		TASK_DONE_STATES.has(getEntityState(item, 'tasks')) ||
		(typeof item.completed_at === 'string' && item.completed_at.length > 0)
	);
}

function isTaskActive(item: Record<string, unknown>): boolean {
	return TASK_ACTIVE_STATES.has(getEntityState(item, 'tasks'));
}

function isTaskScheduled(item: Record<string, unknown>): boolean {
	return !isTaskDone(item) && !isTaskActive(item) && hasSchedule(item);
}

function isTaskBacklog(item: Record<string, unknown>): boolean {
	return !isTaskDone(item) && !isTaskActive(item) && !hasSchedule(item);
}

function shouldIncludeProject(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;

	const state = getEntityState(item, 'projects');
	if (ARCHIVED_STATES.has(state)) return filters.showArchived || filters.showInactiveProjects;
	if (PROJECT_INACTIVE_STATES.has(state)) return filters.showInactiveProjects;

	return true;
}

function shouldIncludeTask(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;

	if (isTaskDone(item)) return filters.showDoneTasks;
	if (isTaskActive(item)) return filters.showActiveTasks;
	if (isTaskScheduled(item)) return filters.showScheduledTasks;

	return filters.showBacklogTasks;
}

function shouldIncludeDocument(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;
	const state = getEntityState(item, 'documents');
	if (ARCHIVED_STATES.has(state)) return filters.showArchived;
	return true;
}

function shouldIncludePlan(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;
	const state = getEntityState(item, 'plans');
	if (ARCHIVED_STATES.has(state)) return filters.showArchived;
	if (PLAN_COMPLETED_STATES.has(state)) return filters.showCompletedPlans;
	return true;
}

function shouldIncludeGoal(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;
	const state = getEntityState(item, 'goals');
	if (GOAL_TERMINAL_STATES.has(state)) return filters.showAchievedGoals;
	return true;
}

function shouldIncludeMilestone(
	item: Record<string, unknown>,
	filters: GraphScopeFilters
): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;
	const state = getEntityState(item, 'milestones');
	if (MILESTONE_COMPLETED_STATES.has(state) || item.completed_at) {
		return filters.showCompletedMilestones;
	}
	return true;
}

function shouldIncludeRisk(item: Record<string, unknown>, filters: GraphScopeFilters): boolean {
	if (hasDeletedAt(item) && !filters.showDeleted) return false;
	const state = getEntityState(item, 'risks');
	if (RISK_CLOSED_STATES.has(state)) return filters.showClosedRisks;
	return true;
}

function filterByScope<T extends { id: string }>(
	items: T[],
	key: SourceKey,
	filters: GraphScopeFilters
): T[] {
	const predicateByKey: Record<
		SourceKey,
		(item: Record<string, unknown>, filters: GraphScopeFilters) => boolean
	> = {
		projects: shouldIncludeProject,
		tasks: shouldIncludeTask,
		documents: shouldIncludeDocument,
		plans: shouldIncludePlan,
		goals: shouldIncludeGoal,
		milestones: shouldIncludeMilestone,
		risks: shouldIncludeRisk
	};

	return items.filter((item) =>
		predicateByKey[key](item as unknown as Record<string, unknown>, filters)
	);
}

function getProjectId(item: Record<string, unknown>): string | null {
	const projectId = item.project_id;
	return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

function isInferredProjectEdge(edge: GraphSourceData['edges'][number]): boolean {
	return (
		edge.rel === 'project_contains' &&
		typeof edge.props === 'object' &&
		edge.props !== null &&
		(edge.props as Record<string, unknown>).inferred === true
	);
}

function getDirectProjectEdgeKey(projectId: string, entityId: string): string {
	return `${projectId}:${entityId}`;
}

export function buildInferredProjectEdges(source: GraphSourceData): GraphSourceData['edges'] {
	const projectIds = new Set(source.projects.map((project) => project.id));
	const existingDirectProjectEdges = new Set<string>();

	for (const edge of source.edges) {
		if (edge.src_kind === 'project' && projectIds.has(edge.src_id)) {
			existingDirectProjectEdges.add(getDirectProjectEdgeKey(edge.src_id, edge.dst_id));
		}
		if (edge.dst_kind === 'project' && projectIds.has(edge.dst_id)) {
			existingDirectProjectEdges.add(getDirectProjectEdgeKey(edge.dst_id, edge.src_id));
		}
	}

	const inferredEdges: GraphSourceData['edges'] = [];

	for (const key of CHILD_SOURCE_KEYS) {
		const childKind = CHILD_KIND_BY_SOURCE_KEY[key];
		for (const item of getItems(source, key)) {
			const id = String(item.id ?? '');
			const projectId = getProjectId(item);

			if (!id || !projectId || !projectIds.has(projectId)) continue;
			if (existingDirectProjectEdges.has(getDirectProjectEdgeKey(projectId, id))) continue;

			inferredEdges.push({
				id: `inferred-project-link:${projectId}:${childKind}:${id}`,
				project_id: projectId,
				src_kind: 'project',
				src_id: projectId,
				dst_kind: childKind,
				dst_id: id,
				rel: 'project_contains',
				props: {
					inferred: true,
					source: 'project_id'
				},
				created_at: ''
			});
		}
	}

	return inferredEdges;
}

function withInferredProjectEdges(source: GraphSourceData): GraphSourceData {
	const inferredEdges = buildInferredProjectEdges(source);
	if (inferredEdges.length === 0) return source;

	return {
		...source,
		edges: [...source.edges, ...inferredEdges]
	};
}

export function filterGraphSourceData(
	source: GraphSourceData,
	filters: GraphScopeFilters = DEFAULT_GRAPH_SCOPE_FILTERS
): GraphSourceData {
	const normalized = normalizeGraphScopeFilters(filters);
	const filteredSource: GraphSourceData = {
		projects: filterByScope(source.projects, 'projects', normalized),
		tasks: filterByScope(source.tasks, 'tasks', normalized),
		documents: filterByScope(source.documents, 'documents', normalized),
		plans: filterByScope(source.plans, 'plans', normalized),
		goals: filterByScope(source.goals, 'goals', normalized),
		milestones: filterByScope(source.milestones, 'milestones', normalized),
		risks: filterByScope(source.risks ?? [], 'risks', normalized),
		edges: []
	};

	const selectedIds = new Set<string>();
	for (const key of [
		'projects',
		'tasks',
		'documents',
		'plans',
		'goals',
		'milestones',
		'risks'
	] satisfies SourceKey[]) {
		for (const item of getItems(filteredSource, key)) {
			selectedIds.add(String(item.id));
		}
	}

	filteredSource.edges = source.edges.filter(
		(edge) => selectedIds.has(edge.src_id) && selectedIds.has(edge.dst_id)
	);

	return normalized.showInferredProjectLinks
		? withInferredProjectEdges(filteredSource)
		: filteredSource;
}

function getTimestamp(item: Record<string, unknown>): number {
	for (const key of ['updated_at', 'due_at', 'created_at']) {
		const value = item[key];
		if (typeof value !== 'string') continue;
		const timestamp = Date.parse(value);
		if (!Number.isNaN(timestamp)) return timestamp;
	}

	return 0;
}

function compareRankedEntities(a: RankedEntity, b: RankedEntity): number {
	return (
		b.stateRank - a.stateRank ||
		b.degree - a.degree ||
		b.updatedAt - a.updatedAt ||
		a.id.localeCompare(b.id)
	);
}

function buildDegreeMap(graph: GraphData): Map<string, number> {
	const degreeById = new Map<string, number>();

	for (const edge of graph.edges) {
		degreeById.set(edge.data.source, (degreeById.get(edge.data.source) ?? 0) + 1);
		degreeById.set(edge.data.target, (degreeById.get(edge.data.target) ?? 0) + 1);
	}

	return degreeById;
}

function rankItems(
	source: GraphSourceData,
	key: SourceKey,
	degreeById: Map<string, number>
): RankedEntity[] {
	return getItems(source, key)
		.map((item) => {
			const id = String(item.id ?? '');
			return {
				id,
				degree: degreeById.get(id) ?? 0,
				stateRank: STATE_RANKS[getEntityState(item, key)] ?? 50,
				updatedAt: getTimestamp(item)
			};
		})
		.filter((item) => item.id.length > 0)
		.sort(compareRankedEntities);
}

function allocateChildLimits(
	source: GraphSourceData,
	remainingLimit: number
): Map<SourceKey, number> {
	const limits = new Map<SourceKey, number>();

	if (remainingLimit <= 0) {
		for (const key of CHILD_SOURCE_KEYS) {
			limits.set(key, 0);
		}
		return limits;
	}

	let assigned = 0;
	for (const key of CHILD_SOURCE_KEYS) {
		const available = getItems(source, key).length;
		const weightedLimit = Math.floor(remainingLimit * CHILD_TYPE_WEIGHTS[key]);
		const limit = Math.min(available, weightedLimit);
		limits.set(key, limit);
		assigned += limit;
	}

	let unassigned = remainingLimit - assigned;
	while (unassigned > 0) {
		let didAssign = false;

		for (const key of CHILD_SOURCE_KEYS) {
			const current = limits.get(key) ?? 0;
			const available = getItems(source, key).length;
			if (current >= available) continue;

			limits.set(key, current + 1);
			unassigned -= 1;
			didAssign = true;

			if (unassigned === 0) break;
		}

		if (!didAssign) break;
	}

	return limits;
}

function sourceWithSelectedIds(source: GraphSourceData, selectedIds: Set<string>): GraphSourceData {
	const filterById = <T extends { id: string }>(items: T[] | undefined): T[] =>
		(items ?? []).filter((item) => selectedIds.has(item.id));

	return {
		projects: filterById(source.projects),
		tasks: filterById(source.tasks),
		documents: filterById(source.documents),
		plans: filterById(source.plans),
		goals: filterById(source.goals),
		milestones: filterById(source.milestones),
		risks: filterById(source.risks),
		edges: source.edges.filter(
			(edge) => selectedIds.has(edge.src_id) && selectedIds.has(edge.dst_id)
		)
	};
}

function limitWorkspaceSource(
	source: GraphSourceData,
	fullGraph: GraphData,
	limit: number
): GraphSourceData {
	const degreeById = buildDegreeMap(fullGraph);
	const selectedIds = new Set<string>();

	for (const project of rankItems(source, 'projects', degreeById).slice(0, limit)) {
		selectedIds.add(project.id);
	}

	const remainingLimit = Math.max(0, limit - selectedIds.size);
	const childLimits = allocateChildLimits(source, remainingLimit);

	for (const key of CHILD_SOURCE_KEYS) {
		const keyLimit = childLimits.get(key) ?? 0;
		for (const entity of rankItems(source, key, degreeById).slice(0, keyLimit)) {
			selectedIds.add(entity.id);
		}
	}

	return sourceWithSelectedIds(source, selectedIds);
}

function matchesScopeCountKey(
	item: Record<string, unknown>,
	key: SourceKey,
	countKey: GraphScopeFilterKey
): boolean {
	switch (countKey) {
		case 'showActiveTasks':
			return key === 'tasks' && isTaskActive(item) && !isTaskDone(item);
		case 'showScheduledTasks':
			return key === 'tasks' && isTaskScheduled(item);
		case 'showBacklogTasks':
			return key === 'tasks' && isTaskBacklog(item);
		case 'showDoneTasks':
			return key === 'tasks' && isTaskDone(item);
		case 'showCompletedPlans':
			return key === 'plans' && PLAN_COMPLETED_STATES.has(getEntityState(item, 'plans'));
		case 'showAchievedGoals':
			return key === 'goals' && GOAL_TERMINAL_STATES.has(getEntityState(item, 'goals'));
		case 'showCompletedMilestones':
			return (
				key === 'milestones' &&
				(MILESTONE_COMPLETED_STATES.has(getEntityState(item, 'milestones')) ||
					Boolean(item.completed_at))
			);
		case 'showClosedRisks':
			return key === 'risks' && RISK_CLOSED_STATES.has(getEntityState(item, 'risks'));
		case 'showInactiveProjects':
			return (
				key === 'projects' && PROJECT_INACTIVE_STATES.has(getEntityState(item, 'projects'))
			);
		case 'showArchived':
			return (
				(key === 'projects' || key === 'documents' || key === 'plans') &&
				ARCHIVED_STATES.has(getEntityState(item, key))
			);
		case 'showDeleted':
			return hasDeletedAt(item);
		case 'showInferredProjectLinks':
			return false;
	}
}

function countSourceItemsForScopeKey(
	source: GraphSourceData,
	countKey: GraphScopeFilterKey
): number {
	if (countKey === 'showInferredProjectLinks') {
		return source.edges.filter(isInferredProjectEdge).length;
	}

	let count = 0;
	for (const key of [
		'projects',
		'tasks',
		'documents',
		'plans',
		'goals',
		'milestones',
		'risks'
	] satisfies SourceKey[]) {
		for (const item of getItems(source, key)) {
			if (matchesScopeCountKey(item, key, countKey)) {
				count += 1;
			}
		}
	}
	return count;
}

export function buildGraphScopeCounts(
	totalSource: GraphSourceData,
	includedSource: GraphSourceData,
	returnedSource: GraphSourceData,
	totalOverrides: GraphScopeCountTotals = {}
): GraphScopeCounts {
	const counts = {} as GraphScopeCounts;
	const totalSourceWithInferredLinks = withInferredProjectEdges(totalSource);

	for (const key of GRAPH_SCOPE_FILTER_KEYS) {
		const computedTotal = countSourceItemsForScopeKey(totalSourceWithInferredLinks, key);
		const total = totalOverrides[key] ?? computedTotal;
		const included = countSourceItemsForScopeKey(includedSource, key);
		const returned = countSourceItemsForScopeKey(returnedSource, key);

		counts[key] = {
			total,
			included,
			returned,
			hidden: Math.max(0, total - returned),
			filteredOut: Math.max(0, total - included),
			omitted: Math.max(0, included - returned)
		};
	}

	return counts;
}

export function buildGraphStats(source: GraphSourceData): GraphStats {
	return {
		totalProjects: source.projects.length,
		activeProjects: source.projects.filter((project) => project.state_key === 'active').length,
		totalEdges: source.edges.length,
		totalTasks: source.tasks.length,
		totalDocuments: source.documents.length,
		totalPlans: source.plans.length,
		totalGoals: source.goals.length,
		totalMilestones: source.milestones.length,
		totalRisks: source.risks?.length ?? 0,
		totalInferredEdges: source.edges.filter(isInferredProjectEdge).length
	};
}

export function buildWorkspaceGraphPayload(
	source: GraphSourceData,
	viewMode: ViewMode,
	limit: number,
	filters: GraphScopeFilters = DEFAULT_GRAPH_SCOPE_FILTERS,
	scopeCountTotals: GraphScopeCountTotals = {}
): WorkspaceGraphPayload {
	const normalizedFilters = normalizeGraphScopeFilters(filters);
	const filteredSource = filterGraphSourceData(source, normalizedFilters);
	const fullGraph = OntologyGraphService.buildGraphData(filteredSource, viewMode);

	if (fullGraph.nodes.length <= limit) {
		const scopeCounts = buildGraphScopeCounts(
			source,
			filteredSource,
			filteredSource,
			scopeCountTotals
		);
		return {
			source: filteredSource,
			graph: fullGraph,
			stats: buildGraphStats(filteredSource),
			limitMetadata: {
				truncated: false,
				filters: normalizedFilters,
				scopeCounts,
				requestedNodeLimit: limit,
				originalNodeCount: fullGraph.nodes.length,
				originalEdgeCount: fullGraph.edges.length,
				returnedNodeCount: fullGraph.nodes.length,
				returnedEdgeCount: fullGraph.edges.length,
				omittedNodeCount: 0,
				omittedEdgeCount: 0,
				inferredProjectEdgeCount: scopeCounts.showInferredProjectLinks.returned
			}
		};
	}

	const limitedSource = limitWorkspaceSource(filteredSource, fullGraph, limit);
	const limitedGraph = OntologyGraphService.buildGraphData(limitedSource, viewMode);
	const scopeCounts = buildGraphScopeCounts(
		source,
		filteredSource,
		limitedSource,
		scopeCountTotals
	);

	return {
		source: limitedSource,
		graph: limitedGraph,
		stats: buildGraphStats(limitedSource),
		limitMetadata: {
			truncated: true,
			filters: normalizedFilters,
			scopeCounts,
			requestedNodeLimit: limit,
			originalNodeCount: fullGraph.nodes.length,
			originalEdgeCount: fullGraph.edges.length,
			returnedNodeCount: limitedGraph.nodes.length,
			returnedEdgeCount: limitedGraph.edges.length,
			omittedNodeCount: Math.max(0, fullGraph.nodes.length - limitedGraph.nodes.length),
			omittedEdgeCount: Math.max(0, fullGraph.edges.length - limitedGraph.edges.length),
			inferredProjectEdgeCount: scopeCounts.showInferredProjectLinks.returned
		}
	};
}
