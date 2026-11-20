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
 * - info (teal): Active/progress states (in_progress, active, on_track)
 * - success (sage): Completed/achieved states (completed, done, achieved, published)
 * - warning (yellow): Caution/review states (review, at_risk, medium priority)
 * - destructive (terracotta): Error/blocked states (blocked, missed, urgent)
 *
 * @module ontology-badge-styles
 */

// Reusable badge class patterns — all token-based, no hardcoded Tailwind hues.
const BADGE_MUTED = 'bg-muted text-muted-foreground border-border';
const BADGE_ACCENT = 'bg-accent/15 text-accent border-accent/30';
const BADGE_PROGRESS = 'bg-info/15 text-info border-info/30';
const BADGE_SUCCESS = 'bg-success/15 text-success border-success/30';
const BADGE_DANGER = 'bg-destructive/15 text-destructive border-destructive/30';

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
