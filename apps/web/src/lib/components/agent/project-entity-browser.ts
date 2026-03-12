// apps/web/src/lib/components/agent/project-entity-browser.ts
import type { FocusEntitySummary } from '@buildos/shared-types';

export type FocusEntityType = FocusEntitySummary['type'];

export const DEFAULT_PROJECT_ENTITY_RESULT_LIMIT = 24;
export const MAX_PROJECT_ENTITY_RESULT_LIMIT = 50;
export const PROJECT_ENTITY_SEARCH_DEBOUNCE_MS = 180;

export interface FetchProjectEntitiesParams {
	projectId: string;
	type: FocusEntityType;
	search?: string;
	limit?: number;
	signal?: AbortSignal;
}

export async function fetchProjectEntities(
	params: FetchProjectEntitiesParams
): Promise<FocusEntitySummary[]> {
	const query = new URLSearchParams({ type: params.type });
	const normalizedSearch = normalizeEntitySearch(params.search);
	const normalizedLimit = normalizeEntityLimit(params.limit);

	if (normalizedSearch) {
		query.set('search', normalizedSearch);
	}
	query.set('limit', String(normalizedLimit));

	const response = await fetch(
		`/api/onto/projects/${params.projectId}/entities?${query.toString()}`,
		{
			signal: params.signal
		}
	);

	if (!response.ok) {
		throw new Error(`Failed with status ${response.status}`);
	}

	const payload = await response.json();
	const data = payload?.data ?? payload ?? [];
	return Array.isArray(data) ? (data as FocusEntitySummary[]) : [];
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
