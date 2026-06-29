// apps/web/src/lib/components/chat/project-selector-browser.ts
export interface ProjectSelectionSummary {
	id: string;
	name: string;
	description: string | null;
	typeKey: string;
	stateKey: string;
	facetContext: string | null;
	facetScale: string | null;
	facetStage: string | null;
	createdAt: string;
	updatedAt: string;
	taskCount: number;
}

type ProjectSelectionCacheEntry = {
	promise?: Promise<ProjectSelectionSummary[]>;
	data?: ProjectSelectionSummary[];
	timestamp: number;
};

export const DEFAULT_PROJECT_SELECTOR_LIMIT = 24;
export const MAX_PROJECT_SELECTOR_LIMIT = 50;
export const PROJECT_SELECTOR_SEARCH_DEBOUNCE_MS = 180;

const PROJECT_SELECTION_CACHE_TTL_MS = 60_000;
const projectSelectionCache = new Map<string, ProjectSelectionCacheEntry>();

function createAbortError(): Error {
	try {
		return new DOMException('The operation was aborted.', 'AbortError');
	} catch (_error) {
		const error = new Error('The operation was aborted.');
		error.name = 'AbortError';
		return error;
	}
}

function bindAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) {
		return Promise.reject(createAbortError());
	}

	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener('abort', onAbort);
			reject(createAbortError());
		};

		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}

function isFresh(timestamp: number): boolean {
	return Date.now() - timestamp <= PROJECT_SELECTION_CACHE_TTL_MS;
}

function buildProjectSelectionCacheKey(params: { search: string; limit: number }): string {
	return `${params.search}|${params.limit}`;
}

function normalizeProjectSelectionPayload(payload: any): ProjectSelectionSummary[] {
	const rawProjects = payload?.data?.projects ?? payload?.projects ?? [];
	if (!Array.isArray(rawProjects)) return [];

	return rawProjects.map((project: any) => ({
		id: project.id,
		name: project.name ?? 'Untitled project',
		description: project.description ?? null,
		typeKey: project.type_key ?? project.typeKey ?? 'project.generic',
		stateKey: project.state_key ?? project.stateKey ?? 'planning',
		facetContext: project.facet_context ?? project.facetContext ?? null,
		facetScale: project.facet_scale ?? project.facetScale ?? null,
		facetStage: project.facet_stage ?? project.facetStage ?? null,
		createdAt: project.created_at ?? project.createdAt ?? '',
		updatedAt: project.updated_at ?? project.updatedAt ?? '',
		taskCount: project.task_count ?? project.taskCount ?? 0
	}));
}

export function normalizeProjectSelectionSearch(value?: string | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;
// Recency bucket thresholds (in days) shared by grouping + the section labels.
export const PROJECT_RECENCY_RECENT_MAX_DAYS = 7;
export const PROJECT_RECENCY_OLDER_MAX_DAYS = 30;

export type ProjectRecencyGroups = {
	recent: ProjectSelectionSummary[];
	olderThan7Days: ProjectSelectionSummary[];
	olderThan30Days: ProjectSelectionSummary[];
};

export function parseProjectUpdatedAt(project: ProjectSelectionSummary): number {
	if (!project.updatedAt) return 0;
	const timestamp = Date.parse(project.updatedAt);
	return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function formatRelativeProjectUpdate(value: string | null | undefined): string {
	if (!value) return 'Updated recently';
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) return 'Updated recently';

	const diffMs = Date.now() - ms;
	if (diffMs < 60_000) return 'Just now';

	const diffMin = Math.floor(diffMs / 60_000);
	if (diffMin < 60) return `${diffMin}m ago`;

	const diffHr = Math.floor(diffMin / 60);
	if (diffHr < 24) return `${diffHr}h ago`;

	const diffDay = Math.floor(diffHr / 24);
	if (diffDay < 7) return `${diffDay}d ago`;

	const diffWk = Math.floor(diffDay / 7);
	if (diffWk < 5) return `${diffWk}w ago`;

	const diffMo = Math.floor(diffDay / 30);
	if (diffMo < 12) return `${diffMo}mo ago`;

	const diffYr = Math.floor(diffDay / 365);
	return `${diffYr}y ago`;
}

export function groupProjectsByRecency(items: ProjectSelectionSummary[]): ProjectRecencyGroups {
	const now = Date.now();
	const recent: ProjectSelectionSummary[] = [];
	const olderThan7Days: ProjectSelectionSummary[] = [];
	const olderThan30Days: ProjectSelectionSummary[] = [];

	const sorted = [...items].sort((a, b) => parseProjectUpdatedAt(b) - parseProjectUpdatedAt(a));

	for (const project of sorted) {
		const ts = parseProjectUpdatedAt(project);
		const ageDays = ts > 0 ? (now - ts) / MILLIS_PER_DAY : Number.POSITIVE_INFINITY;
		if (ageDays >= PROJECT_RECENCY_OLDER_MAX_DAYS) olderThan30Days.push(project);
		else if (ageDays >= PROJECT_RECENCY_RECENT_MAX_DAYS) olderThan7Days.push(project);
		else recent.push(project);
	}

	return { recent, olderThan7Days, olderThan30Days };
}

export function normalizeProjectSelectionLimit(value?: number | null): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_PROJECT_SELECTOR_LIMIT;
	}

	return Math.min(MAX_PROJECT_SELECTOR_LIMIT, Math.max(1, Math.floor(value as number)));
}

export function clearProjectSelectionBrowserCache(): void {
	projectSelectionCache.clear();
}

export async function fetchProjectSelectionSummaries(params: {
	search?: string;
	limit?: number;
	signal?: AbortSignal;
}): Promise<ProjectSelectionSummary[]> {
	const search = normalizeProjectSelectionSearch(params.search);
	const limit = normalizeProjectSelectionLimit(params.limit);
	const cacheKey = buildProjectSelectionCacheKey({ search, limit });
	const cached = projectSelectionCache.get(cacheKey);

	if (cached?.data && isFresh(cached.timestamp)) {
		return cached.data;
	}

	if (cached?.promise && isFresh(cached.timestamp)) {
		return bindAbortSignal(cached.promise, params.signal);
	}

	const query = new URLSearchParams({ limit: String(limit) });
	if (search) {
		query.set('search', search);
	}

	const request = fetch(`/api/onto/projects?${query.toString()}`, {
		method: 'GET',
		credentials: 'same-origin',
		cache: 'no-store',
		signal: params.signal,
		headers: {
			Accept: 'application/json'
		}
	})
		.then(async (response) => {
			const payload = await response.json();
			if (!response.ok || payload?.success === false) {
				throw new Error(payload?.error || 'Failed to load ontology projects');
			}

			const projects = normalizeProjectSelectionPayload(payload);
			projectSelectionCache.set(cacheKey, {
				data: projects,
				timestamp: Date.now()
			});
			return projects;
		})
		.catch((error) => {
			const activeEntry = projectSelectionCache.get(cacheKey);
			if (activeEntry?.promise === request) {
				projectSelectionCache.delete(cacheKey);
			}
			throw error;
		});

	projectSelectionCache.set(cacheKey, {
		promise: request,
		timestamp: Date.now()
	});

	return bindAbortSignal(request, params.signal);
}
