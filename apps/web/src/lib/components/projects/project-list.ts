// apps/web/src/lib/components/projects/project-list.ts
import {
	PROJECT_STATE_META,
	PROJECT_STATE_ORDER,
	isPrimaryTier,
	normalizeProjectState
} from '$lib/config/project-states';
import type { ProjectState } from '$lib/types/onto';

export type ProjectListScope = 'current' | 'all' | ProjectState;

export const PROJECT_LIST_SCOPE_OPTIONS = [
	'current',
	'all',
	...PROJECT_STATE_ORDER
] as const satisfies readonly ProjectListScope[];

export function normalizeProjectListScope(value: string | null | undefined): ProjectListScope {
	if (!value || value === 'current') return 'current';
	if (value === 'all') return 'all';

	const normalized = value.trim().toLowerCase() as ProjectState;
	return PROJECT_STATE_ORDER.includes(normalized) ? normalized : 'current';
}

export function getProjectListScopeLabel(scope: ProjectListScope): string {
	if (scope === 'current') return 'Current work';
	if (scope === 'all') return 'All projects';
	return PROJECT_STATE_META[scope].label;
}

export function matchesProjectListScope(
	state: ProjectState | string | null | undefined,
	scope: ProjectListScope
): boolean {
	if (scope === 'all') return true;
	const normalized = normalizeProjectState(state);
	if (scope === 'current') return isPrimaryTier(normalized);
	return normalized === scope;
}

function calendarDayDifference(older: Date, newer: Date): number {
	const olderDay = Date.UTC(older.getFullYear(), older.getMonth(), older.getDate());
	const newerDay = Date.UTC(newer.getFullYear(), newer.getMonth(), newer.getDate());
	return Math.floor((newerDay - olderDay) / 86_400_000);
}

export function formatProjectUpdatedLabel(value: string, nowMs = Date.now()): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Updated recently';

	const diffMs = nowMs - date.getTime();
	if (diffMs < 0) {
		return `Updated ${date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() === new Date(nowMs).getFullYear() ? undefined : 'numeric'
		})}`;
	}
	if (diffMs < 60_000) return 'Updated just now';
	if (diffMs < 3_600_000) return `Updated ${Math.floor(diffMs / 60_000)}m ago`;
	if (diffMs < 86_400_000) return `Updated ${Math.floor(diffMs / 3_600_000)}h ago`;

	const now = new Date(nowMs);
	const dayDifference = calendarDayDifference(date, now);
	if (dayDifference === 1) return 'Updated yesterday';
	if (dayDifference > 1 && dayDifference < 7) {
		return `Updated ${date.toLocaleDateString(undefined, { weekday: 'long' })}`;
	}

	return `Updated ${date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
	})}`;
}

export function formatProjectUpdatedTitle(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'Updated recently';
	return `Updated ${date.toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	})}`;
}
