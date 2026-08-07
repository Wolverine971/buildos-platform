// packages/agentic-chat-runtime/src/tools/ontology-search-ranking.ts
// Phase 4 Slice 18 S3-T10: pure cross-entity search normalization and ranking.

export type OntologySearchRow = {
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

export type EventSearchRow = {
	id: string;
	project_id: string | null;
	title: string;
	description: string | null;
	location: string | null;
	start_at: string;
	state_key: string | null;
	type_key: string | null;
};

export type TaskBucketKey =
	| 'backlog'
	| 'scheduled'
	| 'overdue'
	| 'in_progress'
	| 'blocked'
	| 'done'
	| 'archived';

export type TaskStateKey = 'todo' | 'in_progress' | 'blocked' | 'done';

export type TaskSearchRow = {
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

export type SearchRankingFactor = {
	key: string;
	weight: number;
};

export const SEARCHABLE_FIELDS_BY_TYPE: Readonly<Record<string, string[]>> = Object.freeze({
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
});

const TYPE_PRIORITY_BOOSTS: Readonly<Record<string, number>> = Object.freeze({
	document: 0.18,
	task: 0.16,
	event: 0.14,
	goal: 0.08,
	plan: 0.08,
	milestone: 0.06,
	risk: 0.03,
	requirement: -0.02,
	image: -0.03
});

const STATE_PRIORITY_BOOSTS: Readonly<Record<string, Readonly<Record<string, number>>>> =
	Object.freeze({
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
	});

const TASK_BUCKET_PRIORITY_BOOSTS: Readonly<Record<TaskBucketKey, number>> = Object.freeze({
	overdue: 0.2,
	in_progress: 0.16,
	backlog: 0.1,
	scheduled: 0.08,
	blocked: -0.12,
	done: -0.28,
	archived: -0.5
});

const TASK_BUCKET_ALIASES: Readonly<Record<TaskBucketKey, string[]>> = Object.freeze({
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
});

function buildResultPath(result: OntologySearchRow): string | null {
	const type = typeof result.type === 'string' ? result.type : null;
	const id = typeof result.id === 'string' ? result.id : null;
	const projectId = typeof result.project_id === 'string' ? result.project_id : null;
	if (!type || !id) return null;
	if (type === 'project') return `project:${id}`;
	if (projectId) return `project:${projectId}/${type}:${id}`;
	return `${type}:${id}`;
}

export function normalizeSearchResult(result: OntologySearchRow) {
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
		path: buildResultPath({ ...result, type, project_id: normalizedProjectId }),
		why_matched: bucketKey
			? `Matched ${bucketKey.replace(/_/g, ' ')} task bucket/state.`
			: `Matched indexed ${matchedFields.join(', ')} fields for ${type}.`
	};
}

export type NormalizedSearchResult = ReturnType<typeof normalizeSearchResult>;

function roundRank(value: number): number {
	return Math.round(value * 1000) / 1000;
}

function eventTimingBoost(startAt: string | null, nowMs: number): SearchRankingFactor | null {
	if (!startAt) return null;
	const timestamp = new Date(startAt).getTime();
	if (!Number.isFinite(timestamp)) return null;

	const daysFromNow = (timestamp - nowMs) / (1000 * 60 * 60 * 24);
	if (daysFromNow >= 0 && daysFromNow <= 2) {
		return { key: 'event_starts_soon', weight: 0.28 };
	}
	if (daysFromNow > 2 && daysFromNow <= 14) {
		return { key: 'event_upcoming', weight: 0.22 };
	}
	if (daysFromNow > 14) return { key: 'event_future', weight: 0.12 };
	if (daysFromNow >= -1) return { key: 'event_recently_past', weight: -0.08 };
	if (daysFromNow >= -14) return { key: 'event_past', weight: -0.22 };
	return { key: 'event_old_past', weight: -0.42 };
}

export function rankSearchResult(result: NormalizedSearchResult, nowMs = Date.now()) {
	const factors: SearchRankingFactor[] = [];
	const typeWeight = TYPE_PRIORITY_BOOSTS[result.type] ?? 0;
	if (typeWeight !== 0) factors.push({ key: `type_${result.type}`, weight: typeWeight });

	const stateKey = result.state_key?.toLowerCase();
	const stateWeight = stateKey ? (STATE_PRIORITY_BOOSTS[result.type]?.[stateKey] ?? 0) : 0;
	if (stateKey && stateWeight !== 0) {
		factors.push({ key: `state_${stateKey}`, weight: stateWeight });
	}

	if (result.type === 'event') {
		const timingFactor = eventTimingBoost(result.start_at, nowMs);
		if (timingFactor) factors.push(timingFactor);
	}

	const bucketKey = result.bucket_key?.toLowerCase() as TaskBucketKey | undefined;
	if (result.type === 'task' && bucketKey && bucketKey in TASK_BUCKET_PRIORITY_BOOSTS) {
		const bucketWeight = TASK_BUCKET_PRIORITY_BOOSTS[bucketKey];
		if (bucketWeight !== 0) {
			factors.push({ key: `bucket_${bucketKey}`, weight: bucketWeight });
		}
	}

	return {
		...result,
		rank_score: roundRank(
			result.score + factors.reduce((sum, factor) => sum + factor.weight, 0)
		),
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

export function taskBucketsForQuery(query: string): Set<TaskBucketKey> {
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

export function taskBucketFor(
	task: Pick<TaskSearchRow, 'deleted_at' | 'state_key' | 'due_at' | 'start_at'>,
	nowMs = Date.now()
): TaskBucketKey {
	if (task.deleted_at) return 'archived';
	const stateKey = task.state_key ?? 'todo';
	if (stateKey === 'done') return 'done';

	const dueMs = dateMs(task.due_at);
	if (dueMs !== null && dueMs < nowMs) return 'overdue';

	if (stateKey === 'todo') {
		const startMs = dateMs(task.start_at);
		const isFuture =
			(dueMs !== null && dueMs >= nowMs) || (startMs !== null && startMs >= nowMs);
		return isFuture ? 'scheduled' : 'backlog';
	}

	if (stateKey === 'in_progress') return 'in_progress';
	if (stateKey === 'blocked') return 'blocked';
	return 'backlog';
}

export function taskStatesForBuckets(buckets: Set<TaskBucketKey>): TaskStateKey[] {
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

export function taskBucketSearchScore(bucket: TaskBucketKey): number {
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

export function taskBucketSnippet(task: TaskSearchRow, bucket: TaskBucketKey): string {
	return task.description?.trim() || `Task bucket: ${bucket.replace(/_/g, ' ')}`;
}

export function dedupeSearchRows(rows: OntologySearchRow[]): OntologySearchRow[] {
	const byKey = new Map<string, OntologySearchRow>();

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

export function eventSearchScore(event: EventSearchRow, query: string): number {
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

export function eventSearchSnippet(event: EventSearchRow): string | null {
	const details = [event.description, event.location].filter(
		(value): value is string => typeof value === 'string' && value.trim().length > 0
	);
	return details.length > 0
		? details.join(' - ')
		: event.start_at
			? `Starts ${event.start_at}`
			: null;
}
