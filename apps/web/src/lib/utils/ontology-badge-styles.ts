// apps/web/src/lib/utils/ontology-badge-styles.ts
/**
 * Ontology Badge Style Utilities
 *
 * Centralized styling functions for entity state badges across the ontology system.
 * Uses Inkprint semantic color tokens for consistent theming.
 *
 * Color Semantics:
 * - muted: Default/neutral states (draft, unknown)
 * - accent: Planning/pending states (todo, planning, active tracking)
 * - emerald: Active/progress states (in_progress, active, on_track)
 * - indigo: Success states (completed, done, achieved, published)
 * - amber: Warning states (review, at_risk, medium priority)
 * - destructive: Error/blocked states (blocked, missed, urgent)
 *
 * @module ontology-badge-styles
 */

// Reusable badge class patterns
const BADGE_MUTED = 'bg-muted text-muted-foreground border-border';
const BADGE_ACCENT = 'bg-accent/15 text-accent border-accent/30';
const BADGE_PROGRESS =
	'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30';
const BADGE_SUCCESS = 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border-indigo-500/30';
const BADGE_WARNING = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30';
const BADGE_DANGER = 'bg-destructive/15 text-destructive border-destructive/30';

/**
 * Get Tailwind CSS classes for project state badges
 */
export function getProjectStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return BADGE_MUTED;
		case 'todo':
		case 'planning':
			return BADGE_ACCENT;
		case 'active':
		case 'in_progress':
			return BADGE_PROGRESS;
		case 'completed':
		case 'done':
			return BADGE_SUCCESS;
		default:
			return BADGE_MUTED;
	}
}

/**
 * Get Tailwind CSS classes for task state badges
 */
export function getTaskStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'todo':
			return BADGE_ACCENT;
		case 'in_progress':
			return BADGE_PROGRESS;
		case 'done':
		case 'completed':
			return BADGE_SUCCESS;
		case 'blocked':
			return BADGE_DANGER;
		default:
			return BADGE_MUTED;
	}
}

/**
 * Get Tailwind CSS classes for plan state badges
 */
export function getPlanStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return BADGE_MUTED;
		case 'planning':
			return BADGE_WARNING;
		case 'active':
			return BADGE_PROGRESS;
		case 'completed':
			return BADGE_SUCCESS;
		default:
			return BADGE_MUTED;
	}
}

/**
 * Get Tailwind CSS classes for goal state badges
 */
export function getGoalStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return BADGE_MUTED;
		case 'active':
			return BADGE_ACCENT;
		case 'on_track':
			return BADGE_PROGRESS;
		case 'at_risk':
			return BADGE_WARNING;
		case 'achieved':
			return BADGE_SUCCESS;
		case 'missed':
			return BADGE_DANGER;
		default:
			return BADGE_MUTED;
	}
}

/**
 * Get Tailwind CSS classes for priority badges
 */
export function getPriorityBadgeClass(priority?: string): string {
	const normalized = priority?.toLowerCase();

	switch (normalized) {
		case 'urgent':
		case 'high':
			return BADGE_DANGER;
		case 'medium':
			return BADGE_WARNING;
		case 'low':
			return BADGE_MUTED;
		default:
			return BADGE_MUTED;
	}
}
