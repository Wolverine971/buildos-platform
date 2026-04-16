// apps/web/src/lib/components/ontology/graph/lib/graph.filters.ts
import type { ViewMode } from './graph.types';

export interface GraphScopeFilters {
	showActiveTasks: boolean;
	showScheduledTasks: boolean;
	showBacklogTasks: boolean;
	showDoneTasks: boolean;
	showCompletedPlans: boolean;
	showAchievedGoals: boolean;
	showCompletedMilestones: boolean;
	showClosedRisks: boolean;
	showInactiveProjects: boolean;
	showArchived: boolean;
	showDeleted: boolean;
	showInferredProjectLinks: boolean;
}

export type GraphScopeFilterKey = keyof GraphScopeFilters;

export interface GraphScopeCount {
	total: number;
	included: number;
	returned: number;
	hidden: number;
	filteredOut: number;
	omitted: number;
}

export type GraphScopeCounts = Record<GraphScopeFilterKey, GraphScopeCount>;

export const GRAPH_REQUEST_SCOPE_VERSION = 'actor-project-scope-v2';

export const DEFAULT_GRAPH_SCOPE_FILTERS: GraphScopeFilters = {
	showActiveTasks: true,
	showScheduledTasks: true,
	showBacklogTasks: false,
	showDoneTasks: false,
	showCompletedPlans: false,
	showAchievedGoals: false,
	showCompletedMilestones: false,
	showClosedRisks: false,
	showInactiveProjects: false,
	showArchived: false,
	showDeleted: false,
	showInferredProjectLinks: true
};

export const GRAPH_SCOPE_FILTER_KEYS: GraphScopeFilterKey[] = [
	'showActiveTasks',
	'showScheduledTasks',
	'showBacklogTasks',
	'showDoneTasks',
	'showCompletedPlans',
	'showAchievedGoals',
	'showCompletedMilestones',
	'showClosedRisks',
	'showInactiveProjects',
	'showArchived',
	'showDeleted',
	'showInferredProjectLinks'
];

function parseBooleanParam(value: string | null, fallback: boolean): boolean {
	if (value === null) return fallback;
	const normalized = value.trim().toLowerCase();
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

export function normalizeGraphScopeFilters(
	filters?: Partial<GraphScopeFilters> | null
): GraphScopeFilters {
	return {
		...DEFAULT_GRAPH_SCOPE_FILTERS,
		...(filters ?? {})
	};
}

export function parseGraphScopeFilters(searchParams: URLSearchParams): GraphScopeFilters {
	const filters = { ...DEFAULT_GRAPH_SCOPE_FILTERS };

	for (const key of GRAPH_SCOPE_FILTER_KEYS) {
		filters[key] = parseBooleanParam(searchParams.get(key), DEFAULT_GRAPH_SCOPE_FILTERS[key]);
	}

	return filters;
}

export function appendGraphScopeFilterParams(
	params: URLSearchParams,
	filters?: Partial<GraphScopeFilters> | null
): URLSearchParams {
	const normalized = normalizeGraphScopeFilters(filters);

	params.set('scopeVersion', GRAPH_REQUEST_SCOPE_VERSION);

	for (const key of GRAPH_SCOPE_FILTER_KEYS) {
		params.set(key, normalized[key] ? 'true' : 'false');
	}

	return params;
}

export function buildGraphScopeFilterKey(filters?: Partial<GraphScopeFilters> | null): string {
	const normalized = normalizeGraphScopeFilters(filters);
	return GRAPH_SCOPE_FILTER_KEYS.map((key) => `${key}:${normalized[key] ? '1' : '0'}`).join('|');
}

export function buildGraphRequestKey(
	viewMode: ViewMode,
	filters?: Partial<GraphScopeFilters> | null
): string {
	return `${GRAPH_REQUEST_SCOPE_VERSION}|${viewMode}|${buildGraphScopeFilterKey(filters)}`;
}
