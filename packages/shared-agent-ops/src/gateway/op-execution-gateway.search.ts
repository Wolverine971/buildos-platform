// packages/shared-agent-ops/src/gateway/op-execution-gateway.search.ts
import type { OntologyProjectSummary } from '../ontology/ontology-projects.service';
import { buildSearchFilter } from '../utils/search-filter';
import { assertAccessibleProject, loadVisibleProjects } from './op-execution-gateway.access';
import {
	applyArchivedReadFilter,
	normalizeEntityStateFilter,
	normalizeEntityTypeFilter,
	normalizeRiskImpactFilter
} from './op-execution-gateway.normalization';
import {
	buildPaginationForRows,
	clampLimit,
	normalizeOffset
} from './op-execution-gateway.pagination';
import { ExternalToolGatewayError } from './op-execution-gateway.responses';
import { truncateText } from './op-execution-gateway.text';
import type { ToolExecutionContext } from './op-execution-gateway.types';

export type SearchKind = 'task' | 'plan' | 'goal' | 'document' | 'milestone' | 'risk';

export async function searchOntology(context: ToolExecutionContext, args: Record<string, unknown>) {
	return searchEntitiesByType(context, args, [
		'task',
		'plan',
		'goal',
		'document',
		'milestone',
		'risk'
	]);
}

export async function searchEntitiesByType(
	context: ToolExecutionContext,
	args: Record<string, unknown>,
	allowedTypes: SearchKind[]
) {
	const query = typeof args.query === 'string' ? args.query.trim() : '';
	if (!query) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'query is required');
	}

	const limit = clampLimit(args.limit, 12, 1, 50);
	const offset = normalizeOffset(args.offset);
	const visible = await loadVisibleProjects(context);
	let projectIds = visible.projects.map((project) => project.id);

	if (args.project_id !== undefined) {
		const project = assertAccessibleProject(visible.projectMap, args.project_id);
		projectIds = [project.id];
	}

	if (projectIds.length === 0) {
		return {
			query,
			results: [],
			total: 0,
			pagination: buildPaginationForRows(offset, limit, 0, 0)
		};
	}

	const requestedTypes = Array.isArray(args.types)
		? args.types.filter(
				(value): value is SearchKind =>
					typeof value === 'string' && allowedTypes.includes(value as SearchKind)
			)
		: allowedTypes;
	const activeTypes = requestedTypes.length > 0 ? requestedTypes : allowedTypes;

	if (activeTypes.length === 1) {
		const result = await searchEntityKind({
			context,
			args,
			kind: activeTypes[0]!,
			query,
			projectIds,
			projectMap: visible.projectMap,
			offset,
			limit,
			strictFilters: true
		});
		return {
			query,
			results: result.results,
			total: result.total,
			pagination: buildPaginationForRows(offset, limit, result.total, result.results.length)
		};
	}

	const fetchLimit = offset + limit;
	const perKindResults = await Promise.all(
		activeTypes.map((kind) =>
			searchEntityKind({
				context,
				args,
				kind,
				query,
				projectIds,
				projectMap: visible.projectMap,
				offset: 0,
				limit: fetchLimit,
				strictFilters: false
			})
		)
	);
	const total = perKindResults.reduce((sum, result) => sum + result.total, 0);
	const merged = perKindResults
		.flatMap((result) => result.results)
		.sort(
			(a, b) =>
				Date.parse(String(b.updated_at ?? '')) - Date.parse(String(a.updated_at ?? ''))
		);
	const results = merged.slice(offset, offset + limit);

	return {
		query,
		results,
		total,
		pagination: buildPaginationForRows(offset, limit, total, results.length)
	};
}

const SEARCH_CONFIG: Record<
	SearchKind,
	{
		table: string;
		select: string;
		searchFields: string[];
		titleField: 'title' | 'name';
		snippetField?: 'description' | 'content';
	}
> = {
	task: {
		table: 'onto_tasks',
		select: 'id, project_id, title, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'description'],
		titleField: 'title',
		snippetField: 'description'
	},
	plan: {
		table: 'onto_plans',
		select: 'id, project_id, name, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['name', 'description'],
		titleField: 'name',
		snippetField: 'description'
	},
	goal: {
		table: 'onto_goals',
		select: 'id, project_id, name, description, type_key, state_key, archived_at, updated_at',
		searchFields: ['name', 'description'],
		titleField: 'name',
		snippetField: 'description'
	},
	document: {
		table: 'onto_documents',
		select: 'id, project_id, title, description, content, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'content', 'description'],
		titleField: 'title',
		snippetField: 'content'
	},
	milestone: {
		table: 'onto_milestones',
		select: 'id, project_id, title, description, type_key, state_key, due_at, archived_at, updated_at',
		searchFields: ['title', 'description'],
		titleField: 'title',
		snippetField: 'description'
	},
	risk: {
		table: 'onto_risks',
		select: 'id, project_id, title, content, impact, type_key, state_key, archived_at, updated_at',
		searchFields: ['title', 'content'],
		titleField: 'title',
		snippetField: 'content'
	}
};

function normalizeSearchStateFilter(
	value: unknown,
	kind: SearchKind,
	strict: boolean
): string | null | undefined {
	try {
		return normalizeEntityStateFilter(value, kind);
	} catch (error) {
		if (strict) throw error;
		return null;
	}
}

function normalizeSearchTypeFilter(
	value: unknown,
	kind: SearchKind,
	strict: boolean
): string | null | undefined {
	try {
		return normalizeEntityTypeFilter(value, kind);
	} catch (error) {
		if (strict) throw error;
		return null;
	}
}

async function searchEntityKind(params: {
	context: ToolExecutionContext;
	args: Record<string, unknown>;
	kind: SearchKind;
	query: string;
	projectIds: string[];
	projectMap: Map<string, OntologyProjectSummary>;
	offset: number;
	limit: number;
	strictFilters: boolean;
}): Promise<{ results: Array<Record<string, unknown>>; total: number }> {
	const { context, args, kind, query, projectIds, projectMap, offset, limit, strictFilters } =
		params;
	const config = SEARCH_CONFIG[kind];
	const stateKey = normalizeSearchStateFilter(args.state_key, kind, strictFilters);
	const typeKey = normalizeSearchTypeFilter(args.type_key, kind, strictFilters);
	const impact =
		kind === 'risk'
			? (() => {
					try {
						return normalizeRiskImpactFilter(args.impact);
					} catch (error) {
						if (strictFilters) throw error;
						return null;
					}
				})()
			: undefined;

	if (stateKey === null || typeKey === null || impact === null) {
		return { results: [], total: 0 };
	}
	if (args.impact !== undefined && kind !== 'risk' && strictFilters) {
		throw new ExternalToolGatewayError('VALIDATION_ERROR', 'impact only applies to risks');
	}

	let dbQuery = context.admin
		.from(config.table)
		.select(config.select, { count: 'exact' })
		.in('project_id', projectIds)
		.or(buildSearchFilter(query, config.searchFields))
		.order('updated_at', { ascending: false })
		.range(offset, offset + limit - 1);
	dbQuery = applyArchivedReadFilter(dbQuery, args);

	if (stateKey) {
		dbQuery = dbQuery.eq('state_key', stateKey);
	}
	if (typeKey) {
		dbQuery = dbQuery.eq('type_key', typeKey);
	}
	if (kind === 'risk' && impact) {
		dbQuery = dbQuery.eq('impact', impact);
	}

	const { data, error, count } = await dbQuery;
	if (error) {
		throw new ExternalToolGatewayError(
			'INTERNAL',
			error.message || `Failed to search ${kind}s`
		);
	}

	const results = ((data ?? []) as Array<Record<string, unknown>>).map((item) => {
		const title = item[config.titleField] ?? null;
		const snippetSource =
			config.snippetField === 'content'
				? typeof item.content === 'string'
					? item.content.replace(/\s+/g, ' ').trim()
					: typeof item.description === 'string'
						? item.description
						: ''
				: item[config.snippetField ?? 'description'];
		const snippet =
			typeof snippetSource === 'string' ? truncateText(snippetSource, 220).content : null;
		return {
			type: kind,
			id: item.id,
			project_id: item.project_id,
			project_name: projectMap.get(String(item.project_id))?.name ?? null,
			title,
			snippet,
			type_key: item.type_key,
			state_key: item.state_key,
			archived_at: item.archived_at ?? null,
			...(kind === 'milestone' ? { due_at: item.due_at } : {}),
			...(kind === 'risk' ? { impact: item.impact } : {}),
			updated_at: item.updated_at
		};
	});

	return {
		results,
		total: count ?? results.length
	};
}
