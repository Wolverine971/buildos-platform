// apps/web/src/lib/config/project-states.ts
/**
 * Canonical project state metadata for the tiered /projects view.
 *
 * Order, tier classification, and chip styling all derive from here so the
 * projects page, dashboard, and any future state-aware surfaces stay aligned.
 */

import type { ProjectState } from '$lib/types/onto';

export type ProjectStateTier = 'primary' | 'secondary';

export interface ProjectStateMeta {
	label: string;
	tier: ProjectStateTier;
	description: string;
	helperLine: string;
	/** Tailwind classes for the state chip (bg/text/border with dark mode). */
	chipClass: string;
}

/**
 * Canonical render order: primary tiers first (Planning, Active), then
 * secondary tiers (Completed, Cancelled, Paused). Iterate this to build
 * sections, filters, and stat strips.
 */
export const PROJECT_STATE_ORDER = [
	'planning',
	'active',
	'completed',
	'cancelled',
	'paused'
] as const satisfies readonly ProjectState[];

export const PROJECT_STATE_META: Record<ProjectState, ProjectStateMeta> = {
	planning: {
		label: 'Planning',
		tier: 'primary',
		description: 'Projects being shaped before execution.',
		helperLine: 'Being shaped before execution',
		chipClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30'
	},
	active: {
		label: 'Active',
		tier: 'primary',
		description: 'Projects currently in motion.',
		helperLine: 'Currently in motion',
		chipClass:
			'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
	},
	completed: {
		label: 'Completed',
		tier: 'secondary',
		description: 'Finished projects kept for history.',
		helperLine: 'Finished, kept for history',
		chipClass:
			'bg-emerald-500/10 text-emerald-700/80 dark:text-emerald-300/80 border border-emerald-500/20'
	},
	cancelled: {
		label: 'Cancelled',
		tier: 'secondary',
		description: 'Stopped projects kept for reference.',
		helperLine: 'Stopped, kept for reference',
		chipClass: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
	},
	paused: {
		label: 'Paused',
		tier: 'secondary',
		description: 'Temporarily shelved projects hidden from active work.',
		helperLine: 'Hidden from active work',
		chipClass: 'bg-muted text-muted-foreground border border-border'
	}
};

const PROJECT_STATE_SET = new Set<ProjectState>(PROJECT_STATE_ORDER);

/**
 * Treat unrecognised or null state values as 'planning' so the row never
 * disappears from the page. Legacy or in-flight backends may emit values
 * outside the enum; surfacing them in Planning is the least-bad fallback.
 */
export function normalizeProjectState(state: string | null | undefined): ProjectState {
	if (!state) return 'planning';
	const lowered = state.trim().toLowerCase() as ProjectState;
	return PROJECT_STATE_SET.has(lowered) ? lowered : 'planning';
}

export function isPrimaryTier(state: ProjectState): boolean {
	return PROJECT_STATE_META[state].tier === 'primary';
}

export function isActiveFacing(state: ProjectState | string | null | undefined): boolean {
	return isPrimaryTier(normalizeProjectState(state));
}

export type AccessRole = 'owner' | 'editor' | 'viewer' | null | undefined;

/**
 * Title-case a role for chip display (`editor` → `Editor`). Returns null for
 * owner/missing roles since "Shared: Owner" reads strangely on a row the
 * viewer doesn't own.
 */
export function formatAccessRole(role: AccessRole): string | null {
	if (!role || role === 'owner') return null;
	return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Stable count of projects per state, in canonical order. */
export interface ProjectStateCounts {
	planning: number;
	active: number;
	completed: number;
	cancelled: number;
	paused: number;
	primaryTotal: number;
	secondaryTotal: number;
	total: number;
}

export function emptyProjectStateCounts(): ProjectStateCounts {
	return {
		planning: 0,
		active: 0,
		completed: 0,
		cancelled: 0,
		paused: 0,
		primaryTotal: 0,
		secondaryTotal: 0,
		total: 0
	};
}
