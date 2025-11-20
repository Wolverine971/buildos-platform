// apps/web/src/lib/utils/ontology-badge-styles.ts
/**
 * Ontology Badge Style Utilities
 *
 * Centralized styling functions for entity state badges across the ontology system.
 * Provides consistent color schemes for different entity types and their states.
 *
 * @module ontology-badge-styles
 */

/**
 * Get Tailwind CSS classes for project state badges
 */
export function getProjectStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
		case 'todo':
		case 'planning':
			return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
		case 'active':
		case 'in_progress':
			return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
		case 'completed':
		case 'done':
			return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
	}
}

/**
 * Get Tailwind CSS classes for task state badges
 */
export function getTaskStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'todo':
			return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
		case 'in_progress':
			return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
		case 'done':
		case 'completed':
			return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
		case 'blocked':
			return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
	}
}

/**
 * Get Tailwind CSS classes for output/document state badges
 */
export function getOutputStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
		case 'review':
			return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
		case 'approved':
			return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
		case 'published':
			return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
	}
}

/**
 * Get Tailwind CSS classes for plan state badges
 */
export function getPlanStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
		case 'planning':
			return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
		case 'active':
			return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
		case 'completed':
			return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
	}
}

/**
 * Get Tailwind CSS classes for goal state badges
 */
export function getGoalStateBadgeClass(stateKey: string): string {
	const normalized = stateKey?.toLowerCase();

	switch (normalized) {
		case 'draft':
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
		case 'active':
			return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
		case 'on_track':
			return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
		case 'at_risk':
			return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
		case 'achieved':
			return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400';
		case 'missed':
			return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
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
			return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
		case 'medium':
			return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
		case 'low':
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
		default:
			return 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
	}
}
