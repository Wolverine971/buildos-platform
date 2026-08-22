// packages/agentic-chat-runtime/src/tools/ontology-search.ts
// Phase 4 Slice 18 S3-T10: shared cross-entity ontology search.

import { buildSearchFilter } from '@buildos/shared-agent-ops/utils/search-filter';
import { isValidUUID } from '@buildos/shared-agent-ops/utils/validation-utils';
import { inferMaterializedToolsFromEntityResults } from '../loop/entity-result-materialization';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import { prepareAgenticChatSearchTerm } from './search-term';
import {
	dedupeSearchRows,
	eventSearchScore,
	eventSearchSnippet,
	normalizeSearchResult,
	rankSearchResult,
	taskBucketFor,
	taskBucketsForQuery,
	taskBucketSearchScore,
	taskBucketSnippet,
	taskStatesForBuckets,
	type EventSearchRow,
	type OntologySearchRow,
	type TaskSearchRow
} from './ontology-search-ranking';

export const ONTOLOGY_SEARCH_ALLOWED_TYPES = new Set([
	'project',
	'task',
	'goal',
	'plan',
	'milestone',
	'document',
	'risk',
	'event',
	'requirement',
	'image'
]);

const RPC_BACKED_TYPES = new Set(
	[...ONTOLOGY_SEARCH_ALLOWED_TYPES].filter((type) => type !== 'event')
);
const AGENTIC_SEARCH_TYPES = new Set(
	[...ONTOLOGY_SEARCH_ALLOWED_TYPES].filter((type) => type !== 'event')
);
const NULLISH_PROJECT_ID_SENTINELS = new Set(['none', 'null', 'undefined']);

export type SharedOntologySearchRequest = {
	query?: string;
	project_id?: string;
	types?: string[];
	limit?: number;
};

export interface SharedSearchAllProjectsArgs {
	query: string;
	project_id?: string;
	types?: string[];
	limit?: number;
}

export interface SharedSearchProjectArgs {
	project_id: string;
	query: string;
	types?: string[];
	limit?: number;
}

export interface SharedSearchOntologyArgs {
	query: string;
	project_id?: string;
	types?: string[];
	limit?: number;
}

export type OntologySearchPayload = {
	query: string;
	search_scope: 'workspace' | 'project';
	project_id: string | null;
	total_returned: number;
	maybe_more: boolean;
	results: Array<ReturnType<typeof rankSearchResult>>;
	total: number;
	message: string;
};

export class AgenticChatOntologySearchInputError extends Error {
	readonly name = 'AgenticChatOntologySearchInputError';
}

export class AgenticChatOntologySearchProjectNotFoundError extends Error {
	readonly name = 'AgenticChatOntologySearchProjectNotFoundError';

	constructor() {
		super('Project not found');
	}
}

export class AgenticChatOntologySearchQueryError extends Error {
	readonly name = 'AgenticChatOntologySearchQueryError';
	readonly stage: 'project' | 'rpc' | 'task_buckets' | 'events';
	readonly cause: unknown;
	readonly code?: string;

	constructor(stage: AgenticChatOntologySearchQueryError['stage'], cause: unknown) {
		const message =
			cause instanceof Error
				? cause.message
				: typeof (cause as { message?: unknown } | null)?.message === 'string'
					? String((cause as { message: string }).message)
					: `Ontology search ${stage} query failed`;
		super(message);
		this.stage = stage;
		this.cause = cause;
		const code = (cause as { code?: unknown } | null)?.code;
		if (typeof code === 'string') this.code = code;
	}
}

export function normalizeOptionalOntologySearchProjectId(
	value: unknown
): string | null | 'invalid' {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (NULLISH_PROJECT_ID_SENTINELS.has(trimmed.toLowerCase())) return null;
	return isValidUUID(trimmed) ? trimmed : 'invalid';
}

function normalizeAgenticSearchTypes(types?: string[]): string[] | undefined {
	if (!Array.isArray(types) || types.length === 0) return undefined;
	const normalized = Array.from(
		new Set(
			types
				.map((type) => (typeof type === 'string' ? type.trim().toLowerCase() : ''))
				.filter((type) => AGENTIC_SEARCH_TYPES.has(type))
		)
	);
	return normalized.length > 0 ? normalized : undefined;
}

async function searchEventsForQuery(input: {
	client: AgenticChatSharedReadContextV1['client'];
	actorId: string;
	projectId: string | null;
	query: string;
	limit: number;
}): Promise<OntologySearchRow[]> {
	const eventFilter = buildSearchFilter(input.query, ['title', 'description', 'location']);
	if (!eventFilter) return [];

	let eventQuery = (input.client as any)
		.from('onto_events')
		.select('id, project_id, title, description, location, start_at, state_key, type_key')
		.is('deleted_at', null)
		.or(eventFilter)
		.order('start_at', { ascending: true })
		.limit(input.limit);

	if (input.projectId) {
		eventQuery = eventQuery.eq('project_id', input.projectId);
	} else {
		// Intentional parity constraint: workspace events remain creator-scoped.
		eventQuery = eventQuery.eq('created_by', input.actorId);
	}

	const { data, error } = await eventQuery;
	if (error) throw new AgenticChatOntologySearchQueryError('events', error);

	return ((data as EventSearchRow[] | null) ?? []).map((event) => ({
		type: 'event',
		id: event.id,
		project_id: event.project_id,
		project_name: null,
		title: event.title,
		snippet: eventSearchSnippet(event),
		score: eventSearchScore(event, input.query),
		state_key: event.state_key,
		type_key: event.type_key,
		start_at: event.start_at
	}));
}

async function searchTaskBucketsForQuery(input: {
	client: AgenticChatSharedReadContextV1['client'];
	projectId: string | null;
	query: string;
	limit: number;
	nowMs: number;
}): Promise<OntologySearchRow[]> {
	if (!input.projectId) return [];

	const buckets = taskBucketsForQuery(input.query);
	if (buckets.size === 0) return [];

	const states = taskStatesForBuckets(buckets);
	let taskQuery = (input.client as any)
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, state_key, type_key, start_at, due_at, completed_at, updated_at, deleted_at, archived_at, priority'
		)
		.eq('project_id', input.projectId)
		.order('priority', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false })
		.limit(input.limit);

	if (states.length > 0) taskQuery = taskQuery.in('state_key', states);
	if (buckets.size === 1 && buckets.has('archived')) {
		taskQuery = taskQuery.not('deleted_at', 'is', null);
	} else {
		taskQuery = taskQuery.is('deleted_at', null);
	}

	const { data, error } = await taskQuery;
	if (error) throw new AgenticChatOntologySearchQueryError('task_buckets', error);

	return ((data as TaskSearchRow[] | null) ?? [])
		.map((task) => ({ task, bucket: taskBucketFor(task, input.nowMs) }))
		.filter(({ bucket }) => buckets.has(bucket))
		.map(({ task, bucket }) => ({
			type: 'task',
			id: task.id,
			project_id: task.project_id,
			project_name: null,
			title: task.title,
			snippet: taskBucketSnippet(task, bucket),
			score: taskBucketSearchScore(bucket),
			state_key: task.state_key,
			type_key: task.type_key,
			start_at: task.start_at,
			due_at: task.due_at,
			updated_at: task.updated_at,
			priority: task.priority,
			bucket_key: bucket
		}));
}

/** Route-compatible ontology search over the injected client and access port. */
export async function searchOntologyEntities(
	context: AgenticChatSharedReadContextV1,
	request: SharedOntologySearchRequest,
	options: { now?: () => number } = {}
): Promise<OntologySearchPayload> {
	const query = typeof request.query === 'string' ? request.query.trim() : '';
	if (!query) throw new AgenticChatOntologySearchInputError('Query is required');

	const normalizedProjectId = normalizeOptionalOntologySearchProjectId(request.project_id);
	if (normalizedProjectId === 'invalid') {
		throw new AgenticChatOntologySearchInputError('Invalid project_id');
	}
	const projectId = normalizedProjectId;

	const validRequestedTypes =
		Array.isArray(request.types) && request.types.length
			? request.types
					.map((type) => (typeof type === 'string' ? type.trim() : ''))
					.filter((type) => type && ONTOLOGY_SEARCH_ALLOWED_TYPES.has(type))
			: [];
	const requestedTypes = validRequestedTypes.length > 0 ? validRequestedTypes : null;
	const shouldSearchEvents = requestedTypes === null || requestedTypes.includes('event');
	const shouldSearchTaskBuckets = requestedTypes === null || requestedTypes.includes('task');
	const rpcTypes = requestedTypes
		? requestedTypes.filter((type) => RPC_BACKED_TYPES.has(type))
		: null;

	const rawLimit =
		request.limit !== undefined &&
		request.limit !== null &&
		Number.isFinite(Number(request.limit))
			? Number(request.limit)
			: null;
	const limit = rawLimit && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 50;
	const candidateLimit = Math.min(50, Math.max(limit, limit * 3));
	const nowMs = options.now?.() ?? Date.now();
	const actorId = await context.access.getActorId();

	if (projectId) {
		await context.access.assertProjectAccess(projectId, 'read');
		const { data: project, error } = await (context.client as any)
			.from('onto_projects')
			.select('id')
			.eq('id', projectId)
			.is('deleted_at', null)
			.maybeSingle();
		if (error) throw new AgenticChatOntologySearchQueryError('project', error);
		if (!project) throw new AgenticChatOntologySearchProjectNotFoundError();
	}

	let rpcResults: OntologySearchRow[] = [];
	if (rpcTypes === null || rpcTypes.length > 0) {
		const { data, error } = await (context.client as any).rpc('onto_search_entities', {
			p_actor_id: actorId,
			p_query: query,
			p_project_id: projectId ?? undefined,
			p_types: rpcTypes && rpcTypes.length > 0 ? rpcTypes : undefined,
			p_limit: candidateLimit
		});
		if (error) throw new AgenticChatOntologySearchQueryError('rpc', error);
		rpcResults = ((data as OntologySearchRow[] | null) ?? []).filter(Boolean);
	}

	const taskBucketResults = shouldSearchTaskBuckets
		? await searchTaskBucketsForQuery({
				client: context.client,
				projectId,
				query,
				limit: candidateLimit,
				nowMs
			})
		: [];
	const eventResults = shouldSearchEvents
		? await searchEventsForQuery({
				client: context.client,
				actorId,
				projectId,
				query,
				limit: candidateLimit
			})
		: [];

	const rawResults = dedupeSearchRows([
		...rpcResults,
		...taskBucketResults,
		...eventResults
	]).filter(Boolean);
	const results = rawResults
		.map((result) => normalizeSearchResult(result))
		.map((result) => rankSearchResult(result, nowMs))
		.sort(
			(a, b) =>
				b.rank_score - a.rank_score ||
				b.score - a.score ||
				(a.title ?? '').localeCompare(b.title ?? '')
		)
		.slice(0, limit);
	const searchScope = projectId ? 'project' : 'workspace';
	const maybeMore =
		rawResults.length > limit ||
		rpcResults.length >= candidateLimit ||
		taskBucketResults.length >= candidateLimit ||
		eventResults.length >= candidateLimit;

	return {
		query,
		search_scope: searchScope,
		project_id: projectId,
		total_returned: results.length,
		maybe_more: maybeMore,
		results,
		total: results.length,
		message:
			searchScope === 'project'
				? `Found ${results.length} BuildOS matches in this project.`
				: `Found ${results.length} BuildOS matches across accessible projects.`
	};
}

async function runAgenticSearch(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchAllProjectsArgs & { scope: 'workspace' | 'project' }
): Promise<OntologySearchPayload & { materialized_tools: string[] }> {
	const query = prepareAgenticChatSearchTerm(args.query);
	if (!query) {
		throw new Error(
			args.scope === 'project'
				? 'Query is required for search_project'
				: 'Query is required for search_all_projects'
		);
	}
	if (args.scope === 'project' && !args.project_id) {
		throw new Error('project_id is required for search_project');
	}

	const requestedLimit =
		typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
			? args.limit
			: 10;
	const payload = await searchOntologyEntities(context, {
		query,
		project_id: args.project_id,
		types: normalizeAgenticSearchTypes(args.types),
		limit: Math.min(requestedLimit, 25)
	});
	return {
		query: payload.query,
		search_scope: payload.search_scope,
		project_id: payload.project_id,
		total_returned: payload.total_returned,
		maybe_more: payload.maybe_more,
		results: payload.results,
		materialized_tools: inferMaterializedToolsFromEntityResults({ results: payload.results }),
		total: payload.total,
		message: payload.message
	};
}

export async function searchAllProjects(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchAllProjectsArgs
): Promise<OntologySearchPayload & { materialized_tools: string[] }> {
	return runAgenticSearch(context, {
		...args,
		scope: args.project_id ? 'project' : 'workspace'
	});
}

export async function searchProject(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchProjectArgs
): Promise<OntologySearchPayload & { materialized_tools: string[] }> {
	return runAgenticSearch(context, { ...args, scope: 'project' });
}

export async function searchOntology(
	context: AgenticChatSharedReadContextV1,
	args: SharedSearchOntologyArgs
): Promise<OntologySearchPayload> {
	const query = prepareAgenticChatSearchTerm(args.query);
	if (!query) throw new Error('Query is required for search_ontology');
	const requestedLimit =
		typeof args.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
			? args.limit
			: 50;
	return searchOntologyEntities(context, {
		query,
		project_id: args.project_id,
		types: normalizeAgenticSearchTypes(args.types),
		limit: Math.min(requestedLimit, 50)
	});
}
