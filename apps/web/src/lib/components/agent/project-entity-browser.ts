// apps/web/src/lib/components/agent/project-entity-browser.ts
import type { FocusEntitySummary } from '@buildos/shared-types';

export type FocusEntityType = FocusEntitySummary['type'];

export const DEFAULT_PROJECT_ENTITY_RESULT_LIMIT = 24;
export const MAX_PROJECT_ENTITY_RESULT_LIMIT = 50;
export const PROJECT_ENTITY_SEARCH_DEBOUNCE_MS = 180;

type ProjectEntityCacheEntry = {
	promise?: Promise<FocusEntitySummary[]>;
	data?: FocusEntitySummary[];
	timestamp: number;
};

const PROJECT_ENTITY_CACHE_TTL_MS = 60_000;
const projectEntityCache = new Map<string, ProjectEntityCacheEntry>();

export interface FetchProjectEntitiesParams {
	projectId: string;
	type: FocusEntityType;
	search?: string;
	limit?: number;
	signal?: AbortSignal;
}

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

function buildProjectEntityCacheKey(params: {
	projectId: string;
	type: FocusEntityType;
	search: string;
	limit: number;
}): string {
	return [params.projectId, params.type, params.search, params.limit].join('|');
}

function isFresh(timestamp: number): boolean {
	return Date.now() - timestamp <= PROJECT_ENTITY_CACHE_TTL_MS;
}

export function clearProjectEntityBrowserCache(): void {
	projectEntityCache.clear();
}

export async function fetchProjectEntities(
	params: FetchProjectEntitiesParams
): Promise<FocusEntitySummary[]> {
	const normalizedSearch = normalizeEntitySearch(params.search);
	const normalizedLimit = normalizeEntityLimit(params.limit);
	const cacheKey = buildProjectEntityCacheKey({
		projectId: params.projectId,
		type: params.type,
		search: normalizedSearch,
		limit: normalizedLimit
	});
	const cached = projectEntityCache.get(cacheKey);

	if (cached?.data && isFresh(cached.timestamp)) {
		return cached.data;
	}

	if (cached?.promise && isFresh(cached.timestamp)) {
		return bindAbortSignal(cached.promise, params.signal);
	}

	const query = new URLSearchParams({ type: params.type });

	if (normalizedSearch) {
		query.set('search', normalizedSearch);
	}
	query.set('limit', String(normalizedLimit));

	const request = fetch(`/api/onto/projects/${params.projectId}/entities?${query.toString()}`, {
		signal: params.signal
	})
		.then(async (response) => {
			if (!response.ok) {
				throw new Error(`Failed with status ${response.status}`);
			}

			const payload = await response.json();
			const data = payload?.data ?? payload ?? [];
			const normalizedData = Array.isArray(data) ? (data as FocusEntitySummary[]) : [];
			projectEntityCache.set(cacheKey, {
				data: normalizedData,
				timestamp: Date.now()
			});
			return normalizedData;
		})
		.catch((error) => {
			const activeEntry = projectEntityCache.get(cacheKey);
			if (activeEntry?.promise === request) {
				projectEntityCache.delete(cacheKey);
			}
			throw error;
		});

	projectEntityCache.set(cacheKey, {
		promise: request,
		timestamp: Date.now()
	});

	return bindAbortSignal(request, params.signal);
}

export function normalizeEntitySearch(value?: string | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

export function normalizeEntityLimit(value?: number | null): number {
	if (!Number.isFinite(value)) {
		return DEFAULT_PROJECT_ENTITY_RESULT_LIMIT;
	}
	return Math.min(MAX_PROJECT_ENTITY_RESULT_LIMIT, Math.max(1, Math.floor(value as number)));
}
