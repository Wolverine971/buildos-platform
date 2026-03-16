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
