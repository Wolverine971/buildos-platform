// apps/web/src/routes/api/onto/search/+server.ts
/**
 * POST /api/onto/search
 * Cross-entity ontology search across BuildOS projects.
 * Returns a stable, agent-friendly result envelope for both broad and project-scoped search.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ensureActorId } from '$lib/services/ontology/ontology-projects.service';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { buildSearchFilter } from '$lib/utils/api-helpers';

const ALLOWED_TYPES = new Set([
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
const RPC_BACKED_TYPES = new Set([...ALLOWED_TYPES].filter((type) => type !== 'event'));
const NULLISH_PROJECT_ID_SENTINELS = new Set(['none', 'null', 'undefined']);
const SEARCHABLE_FIELDS_BY_TYPE: Record<string, string[]> = {
	project: ['name', 'description', 'props'],
	task: ['title', 'description', 'props'],
	goal: ['name', 'description', 'props'],
	plan: ['name', 'description', 'props'],
	milestone: ['title', 'description', 'props'],
	document: ['title', 'description', 'content', 'props'],
	risk: ['title', 'content', 'props'],
	event: ['title', 'description', 'location'],
	requirement: ['text', 'props'],
	image: ['caption', 'alt_text', 'extraction_summary', 'extracted_text']
};

type SearchRequest = {
	query?: string;
	project_id?: string;
	types?: string[];
	limit?: number;
};

type SearchRow = {
	type?: string | null;
	id?: string | null;
	project_id?: string | null;
	project_name?: string | null;
	title?: string | null;
	snippet?: string | null;
	score?: number | null;
	state_key?: string | null;
	type_key?: string | null;
	start_at?: string | null;
	due_at?: string | null;
	updated_at?: string | null;
	priority?: number | null;
	bucket_key?: string | null;
};

type EventSearchRow = {
	id: string;
	project_id: string | null;
	title: string;
	description: string | null;
	location: string | null;
	start_at: string;
	state_key: string | null;
	type_key: string | null;
};

type TaskBucketKey =
	| 'backlog'
	| 'scheduled'
	| 'overdue'
	| 'in_progress'
	| 'blocked'
	| 'done'
	| 'archived';

type TaskStateKey = 'todo' | 'in_progress' | 'blocked' | 'done';

type TaskSearchRow = {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	state_key: string | null;
	type_key: string | null;
	start_at: string | null;
	due_at: string | null;
	completed_at: string | null;
	updated_at: string | null;
	deleted_at: string | null;
	archived_at: string | null;
	priority: number | null;
};

type SearchRankingFactor = {
	key: string;
	weight: number;
};

type NormalizedSearchResult = ReturnType<typeof normalizeSearchResult>;

function normalizeOptionalProjectId(value: unknown): string | null | 'invalid' {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}

	if (NULLISH_PROJECT_ID_SENTINELS.has(trimmed.toLowerCase())) {
		return null;
	}

	return isValidUUID(trimmed) ? trimmed : 'invalid';
}

function buildResultPath(result: SearchRow): string | null {
	const type = typeof result.type === 'string' ? result.type : null;
	const id = typeof result.id === 'string' ? result.id : null;
	const projectId = typeof result.project_id === 'string' ? result.project_id : null;
	if (!type || !id) {
		return null;
	}
	if (type === 'project') {
		return `project:${id}`;
	}
	if (projectId) {
		return `project:${projectId}/${type}:${id}`;
	}
	return `${type}:${id}`;
}

function normalizeSearchResult(result: SearchRow) {
	const type = typeof result.type === 'string' ? result.type : 'unknown';
	const baseMatchedFields = SEARCHABLE_FIELDS_BY_TYPE[type] ?? ['title'];
	const bucketKey = typeof result.bucket_key === 'string' ? result.bucket_key : null;
	const matchedFields =
		type === 'task' && bucketKey
			? [...baseMatchedFields, 'state_key', 'bucket']
			: baseMatchedFields;
	const baseScore = Number.isFinite(Number(result.score)) ? Number(result.score) : 0;
	const normalizedProjectId =
		typeof result.project_id === 'string'
			? result.project_id
			: type === 'project' && typeof result.id === 'string'
				? result.id
				: null;
	const normalizedProjectName =
		typeof result.project_name === 'string'
			? result.project_name
			: type === 'project' && typeof result.title === 'string'
				? result.title
				: null;

	return {
		type,
		id: typeof result.id === 'string' ? result.id : null,
		project_id: normalizedProjectId,
		project_name: normalizedProjectName,
		title: typeof result.title === 'string' ? result.title : null,
		snippet: typeof result.snippet === 'string' ? result.snippet : null,
		score: baseScore,
		state_key: typeof result.state_key === 'string' ? result.state_key : null,
		type_key: typeof result.type_key === 'string' ? result.type_key : null,
		start_at: typeof result.start_at === 'string' ? result.start_at : null,
		due_at: typeof result.due_at === 'string' ? result.due_at : null,
		updated_at: typeof result.updated_at === 'string' ? result.updated_at : null,
		priority: Number.isFinite(Number(result.priority)) ? Number(result.priority) : null,
		bucket_key: bucketKey,
		matched_fields: matchedFields,
		path: buildResultPath({
			...result,
			type,
			project_id: normalizedProjectId
		}),
		why_matched: bucketKey
			? `Matched ${bucketKey.replace(/_/g, ' ')} task bucket/state.`
			: `Matched indexed ${matchedFields.join(', ')} fields for ${type}.`
	};
}

const TYPE_PRIORITY_BOOSTS: Record<string, number> = {
	document: 0.18,
	task: 0.16,
	event: 0.14,
	goal: 0.08,
	plan: 0.08,
	milestone: 0.06,
	risk: 0.03,
	requirement: -0.02,
	image: -0.03
};

const STATE_PRIORITY_BOOSTS: Record<string, Record<string, number>> = {
	project: {
		active: 0.12,
		planning: 0.08,
		paused: -0.08,
		completed: -0.28,
		cancelled: -0.4,
		canceled: -0.4
	},
	task: {
		in_progress: 0.22,
		todo: 0.18,
		blocked: -0.28,
		done: -0.45,
		completed: -0.45
	},
	document: {
		draft: 0.08,
		review: 0.1,
		in_review: 0.1,
		ready: 0.1,
		published: 0.04,
		archived: -0.55
	},
	event: {
		scheduled: 0.1,
		confirmed: 0.1,
		tentative: 0.02,
		cancelled: -0.55,
		canceled: -0.55,
		completed: -0.35
	},
	goal: {
		active: 0.1,
		draft: 0.03,
		achieved: -0.25,
		abandoned: -0.35
	},
	plan: {
		active: 0.1,
		draft: 0.03,
		completed: -0.25
	},
	milestone: {
		in_progress: 0.12,
		pending: 0.08,
		completed: -0.25,
		missed: -0.3
	},
	risk: {
		identified: 0.08,
		occurred: 0.08,
		mitigated: -0.16,
		closed: -0.35
	}
};

const TASK_BUCKET_PRIORITY_BOOSTS: Record<TaskBucketKey, number> = {
	overdue: 0.2,
	in_progress: 0.16,
	backlog: 0.1,
	scheduled: 0.08,
	blocked: -0.12,
	done: -0.28,
	archived: -0.5
};

const TASK_BUCKET_ALIASES: Record<TaskBucketKey, string[]> = {
	backlog: [
		'backlog',
		'backlogged',
		'todo',
		'to do',
		'to-do',
		'not started',
		'not-started',
		'not_started',
		'pending task',
		'pending tasks'
	],
	scheduled: ['scheduled', 'upcoming', 'planned'],
	overdue: ['overdue', 'late', 'past due', 'past-due', 'past_due'],
	in_progress: ['in progress', 'in-progress', 'in_progress', 'working', 'doing', 'started'],
	blocked: ['blocked', 'stuck', 'waiting'],
	done: ['done', 'completed', 'complete', 'finished', 'closed'],
	archived: ['archived', 'archive']
};

function roundRank(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function eventTimingBoost(startAt: string | null): SearchRankingFactor | null {
	if (!startAt) return null;
	const start = new Date(startAt);
	const timestamp = start.getTime();
	if (!Number.isFinite(timestamp)) return null;

	const daysFromNow = (timestamp - Date.now()) / (1000 * 60 * 60 * 24);
	if (daysFromNow >= 0 && daysFromNow <= 2) {
		return { key: 'event_starts_soon', weight: 0.28 };
	}
	if (daysFromNow > 2 && daysFromNow <= 14) {
		return { key: 'event_upcoming', weight: 0.22 };
	}
	if (daysFromNow > 14) {
		return { key: 'event_future', weight: 0.12 };
	}
	if (daysFromNow >= -1) {
		return { key: 'event_recently_past', weight: -0.08 };
	}
	if (daysFromNow >= -14) {
		return { key: 'event_past', weight: -0.22 };
	}
	return { key: 'event_old_past', weight: -0.42 };
}

function rankSearchResult(result: NormalizedSearchResult): NormalizedSearchResult & {
	rank_score: number;
	ranking_factors: SearchRankingFactor[];
} {
	const factors: SearchRankingFactor[] = [];
	const typeWeight = TYPE_PRIORITY_BOOSTS[result.type] ?? 0;
	if (typeWeight !== 0) {
		factors.push({ key: `type_${result.type}`, weight: typeWeight });
	}

	const stateKey = result.state_key?.toLowerCase();
	const stateWeight = stateKey ? (STATE_PRIORITY_BOOSTS[result.type]?.[stateKey] ?? 0) : 0;
	if (stateKey && stateWeight !== 0) {
		factors.push({ key: `state_${stateKey}`, weight: stateWeight });
	}

	if (result.type === 'event') {
		const timingFactor = eventTimingBoost(result.start_at);
		if (timingFactor) factors.push(timingFactor);
	}

	const bucketKey = result.bucket_key?.toLowerCase() as TaskBucketKey | undefined;
	if (result.type === 'task' && bucketKey && bucketKey in TASK_BUCKET_PRIORITY_BOOSTS) {
		const bucketWeight = TASK_BUCKET_PRIORITY_BOOSTS[bucketKey];
		if (bucketWeight !== 0) {
			factors.push({ key: `bucket_${bucketKey}`, weight: bucketWeight });
		}
	}

	const rankScore = roundRank(
		result.score + factors.reduce((sum, factor) => sum + factor.weight, 0)
	);

	return {
		...result,
		rank_score: rankScore,
		ranking_factors: factors
	};
}

function normalizeSearchText(value: string): string {
	return value
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[_-]+/g, ' ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedTextContainsAlias(text: string, alias: string): boolean {
	const normalizedAlias = normalizeSearchText(alias);
	if (!text || !normalizedAlias) return false;
	return new RegExp(`(^|\\s)${escapeRegExp(normalizedAlias)}(\\s|$)`).test(text);
}

function taskBucketsForQuery(query: string): Set<TaskBucketKey> {
	const normalizedQuery = normalizeSearchText(query);
	const buckets = new Set<TaskBucketKey>();
	for (const [bucket, aliases] of Object.entries(TASK_BUCKET_ALIASES) as [
		TaskBucketKey,
		string[]
	][]) {
		if (aliases.some((alias) => normalizedTextContainsAlias(normalizedQuery, alias))) {
			buckets.add(bucket);
		}
	}
	return buckets;
}

function dateMs(value: string | null): number | null {
	if (!value) return null;
	const timestamp = new Date(value).getTime();
	return Number.isFinite(timestamp) ? timestamp : null;
}

function taskBucketFor(
	task: Pick<TaskSearchRow, 'deleted_at' | 'state_key' | 'due_at' | 'start_at'>
): TaskBucketKey {
	if (task.deleted_at) return 'archived';
	const stateKey = task.state_key ?? 'todo';
	if (stateKey === 'done') return 'done';

	const now = Date.now();
	const dueMs = dateMs(task.due_at);
	if (dueMs !== null && dueMs < now) return 'overdue';

	if (stateKey === 'todo') {
		const startMs = dateMs(task.start_at);
		const isFuture = (dueMs !== null && dueMs >= now) || (startMs !== null && startMs >= now);
		return isFuture ? 'scheduled' : 'backlog';
	}

	if (stateKey === 'in_progress') return 'in_progress';
	if (stateKey === 'blocked') return 'blocked';
	return 'backlog';
}

function taskStatesForBuckets(buckets: Set<TaskBucketKey>): TaskStateKey[] {
	const states = new Set<TaskStateKey>();
	for (const bucket of buckets) {
		switch (bucket) {
			case 'backlog':
			case 'scheduled':
			case 'overdue':
				states.add('todo');
				break;
			case 'in_progress':
				states.add('in_progress');
				break;
			case 'blocked':
				states.add('blocked');
				break;
			case 'done':
				states.add('done');
				break;
			case 'archived':
				break;
		}
	}
	return Array.from(states);
}

function taskBucketSearchScore(bucket: TaskBucketKey): number {
	switch (bucket) {
		case 'backlog':
		case 'in_progress':
		case 'scheduled':
		case 'overdue':
			return 0.72;
		case 'blocked':
			return 0.66;
		case 'done':
			return 0.58;
		case 'archived':
			return 0.45;
	}
}

function taskBucketSnippet(task: TaskSearchRow, bucket: TaskBucketKey): string {
	const label = bucket.replace(/_/g, ' ');
	return task.description?.trim() || `Task bucket: ${label}`;
}

function dedupeSearchRows(rows: SearchRow[]): SearchRow[] {
	const byKey = new Map<string, SearchRow>();

	for (const row of rows) {
		const type = typeof row.type === 'string' ? row.type : null;
		const id = typeof row.id === 'string' ? row.id : null;
		if (!type || !id) continue;

		const key = `${type}:${id}`;
		const existing = byKey.get(key);
		if (!existing) {
			byKey.set(key, row);
			continue;
		}

		const existingScore = Number.isFinite(Number(existing.score)) ? Number(existing.score) : 0;
		const rowScore = Number.isFinite(Number(row.score)) ? Number(row.score) : 0;
		const primary = rowScore > existingScore ? row : existing;
		const secondary = primary === row ? existing : row;

		byKey.set(key, {
			...secondary,
			...primary,
			score: Math.max(existingScore, rowScore),
			project_id: primary.project_id ?? secondary.project_id ?? null,
			project_name: primary.project_name ?? secondary.project_name ?? null,
			title: primary.title ?? secondary.title ?? null,
			snippet: primary.snippet ?? secondary.snippet ?? null,
			state_key: primary.state_key ?? secondary.state_key ?? null,
			type_key: primary.type_key ?? secondary.type_key ?? null,
			start_at: primary.start_at ?? secondary.start_at ?? null,
			due_at: primary.due_at ?? secondary.due_at ?? null,
			updated_at: primary.updated_at ?? secondary.updated_at ?? null,
			priority: primary.priority ?? secondary.priority ?? null,
			bucket_key: primary.bucket_key ?? secondary.bucket_key ?? null
		});
	}

	return Array.from(byKey.values());
}

function eventSearchScore(event: EventSearchRow, query: string): number {
	const normalizedQuery = query.toLowerCase();
	const title = event.title?.toLowerCase() ?? '';
	const description = event.description?.toLowerCase() ?? '';
	const location = event.location?.toLowerCase() ?? '';

	if (title === normalizedQuery) return 1.25;
	if (title.includes(normalizedQuery)) return 1.05;
	if (description.includes(normalizedQuery)) return 0.75;
	if (location.includes(normalizedQuery)) return 0.65;
	return 0.45;
}

function eventSearchSnippet(event: EventSearchRow): string | null {
	const details = [event.description, event.location].filter(
		(value): value is string => typeof value === 'string' && value.trim().length > 0
	);
	if (details.length > 0) {
		return details.join(' - ');
	}
	return event.start_at ? `Starts ${event.start_at}` : null;
}

async function searchEventsForQuery({
	supabase,
	actorId,
	projectId,
	query,
	limit
}: {
	supabase: App.Locals['supabase'];
	actorId: string;
	projectId: string | null;
	query: string;
	limit: number;
}): Promise<SearchRow[]> {
	const eventFilter = buildSearchFilter(query, ['title', 'description', 'location']);
	if (!eventFilter) return [];

	let eventQuery = supabase
		.from('onto_events')
		.select('id, project_id, title, description, location, start_at, state_key, type_key')
		.is('deleted_at', null)
		.or(eventFilter)
		.order('start_at', { ascending: true })
		.limit(limit);

	if (projectId) {
		eventQuery = eventQuery.eq('project_id', projectId);
	} else {
		eventQuery = eventQuery.eq('created_by', actorId);
	}

	const { data, error } = await eventQuery;
	if (error) {
		console.error('[Ontology Search API] Event search failed:', error);
		throw error;
	}

	return ((data as EventSearchRow[] | null) ?? []).map((event) => ({
		type: 'event',
		id: event.id,
		project_id: event.project_id,
		project_name: null,
		title: event.title,
		snippet: eventSearchSnippet(event),
		score: eventSearchScore(event, query),
		state_key: event.state_key,
		type_key: event.type_key,
		start_at: event.start_at
	}));
}

async function searchTaskBucketsForQuery({
	supabase,
	projectId,
	query,
	limit
}: {
	supabase: App.Locals['supabase'];
	projectId: string | null;
	query: string;
	limit: number;
}): Promise<SearchRow[]> {
	if (!projectId) return [];

	const buckets = taskBucketsForQuery(query);
	if (buckets.size === 0) return [];

	const states = taskStatesForBuckets(buckets);
	let taskQuery = supabase
		.from('onto_tasks')
		.select(
			'id, project_id, title, description, state_key, type_key, start_at, due_at, completed_at, updated_at, deleted_at, archived_at, priority'
		)
		.eq('project_id', projectId)
		.order('priority', { ascending: false, nullsFirst: false })
		.order('updated_at', { ascending: false })
		.limit(limit);

	if (states.length > 0) {
		taskQuery = taskQuery.in('state_key', states);
	}

	if (buckets.size === 1 && buckets.has('archived')) {
		taskQuery = taskQuery.not('deleted_at', 'is', null);
	} else {
		taskQuery = taskQuery.is('deleted_at', null);
	}

	const { data, error } = await taskQuery;
	if (error) {
		console.error('[Ontology Search API] Task bucket search failed:', error);
		throw error;
	}

	return ((data as TaskSearchRow[] | null) ?? [])
		.map((task) => ({ task, bucket: taskBucketFor(task) }))
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

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const session = await locals.safeGetSession();
		if (!session?.user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const body = (await request.json().catch(() => null)) as SearchRequest | null;
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const query = typeof body.query === 'string' ? body.query.trim() : '';
		if (!query) {
			return ApiResponse.badRequest('Query is required');
		}

		const normalizedProjectId = normalizeOptionalProjectId(body.project_id);
		if (normalizedProjectId === 'invalid') {
			return ApiResponse.badRequest('Invalid project_id');
		}
		const projectId = normalizedProjectId;

		const validRequestedTypes =
			Array.isArray(body.types) && body.types.length
				? body.types
						.map((t) => (typeof t === 'string' ? t.trim() : ''))
						.filter((t) => t && ALLOWED_TYPES.has(t))
				: [];
		const requestedTypes = validRequestedTypes.length ? validRequestedTypes : null;
		const shouldSearchEvents = requestedTypes === null || requestedTypes.includes('event');
		const shouldSearchTaskBuckets = requestedTypes === null || requestedTypes.includes('task');
		const rpcTypes = requestedTypes
			? requestedTypes.filter((type) => RPC_BACKED_TYPES.has(type))
			: null;

		const rawLimit =
			body.limit !== undefined && body.limit !== null && Number.isFinite(Number(body.limit))
				? Number(body.limit)
				: null;
		const limit = rawLimit && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 50) : 50;
		const candidateLimit = Math.min(50, Math.max(limit, limit * 3));

		const supabase = locals.supabase;

		let actorId: string;
		try {
			actorId = await ensureActorId(supabase, session.user.id);
		} catch (actorError) {
			console.error('[Ontology Search API] Failed to resolve actor:', actorError);
			return ApiResponse.internalError(actorError, 'Failed to resolve user actor');
		}

		if (projectId) {
			const { data: hasAccess, error: accessError } = await supabase.rpc(
				'current_actor_has_project_member_access',
				{
					p_project_id: projectId,
					p_required_access: 'read'
				}
			);

			if (accessError) {
				console.error('[Ontology Search API] Access check failed:', accessError);
				return ApiResponse.internalError(accessError, 'Failed to check project access');
			}

			if (!hasAccess) {
				return ApiResponse.forbidden('You do not have access to this project');
			}

			const { data: project, error: projectError } = await supabase
				.from('onto_projects')
				.select('id')
				.eq('id', projectId)
				.is('deleted_at', null)
				.maybeSingle();

			if (projectError) {
				console.error('[Ontology Search API] Project lookup failed:', projectError);
				return ApiResponse.databaseError(projectError);
			}

			if (!project) {
				return ApiResponse.notFound('Project');
			}
		}

		let rpcResults: SearchRow[] = [];
		if (rpcTypes === null || rpcTypes.length > 0) {
			const { data, error } = await supabase.rpc('onto_search_entities', {
				p_actor_id: actorId,
				p_query: query,
				p_project_id: projectId ?? undefined,
				p_types: rpcTypes && rpcTypes.length ? rpcTypes : undefined,
				p_limit: candidateLimit
			});

			if (error) {
				console.error('[Ontology Search API] RPC failed:', error);
				return ApiResponse.databaseError(error);
			}

			rpcResults = ((data as SearchRow[] | null) ?? []).filter(Boolean);
		}

		let taskBucketResults: SearchRow[] = [];
		if (shouldSearchTaskBuckets) {
			try {
				taskBucketResults = await searchTaskBucketsForQuery({
					supabase,
					projectId,
					query,
					limit: candidateLimit
				});
			} catch (taskBucketError) {
				return ApiResponse.databaseError(taskBucketError);
			}
		}

		let eventResults: SearchRow[] = [];
		if (shouldSearchEvents) {
			try {
				eventResults = await searchEventsForQuery({
					supabase,
					actorId,
					projectId,
					query,
					limit: candidateLimit
				});
			} catch (eventError) {
				return ApiResponse.databaseError(eventError);
			}
		}

		const rawResults = dedupeSearchRows([
			...rpcResults,
			...taskBucketResults,
			...eventResults
		]).filter(Boolean);
		const results = rawResults
			.map((result) => normalizeSearchResult(result))
			.map((result) => rankSearchResult(result))
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

		return ApiResponse.success({
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
		});
	} catch (err) {
		console.error('[Ontology Search API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'Failed to search ontology');
	}
};
