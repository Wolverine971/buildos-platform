// apps/web/src/lib/stores/project-navigation.store.ts
/**
 * Project Navigation Store
 *
 * Stores project summary data during navigation from list pages to detail page.
 * This enables instant skeleton rendering with accurate counts before full data loads.
 *
 * Usage:
 * - Source page (list/homepage): Call setNavigationData() before navigation
 * - Target page (detail): Call getNavigationData() to get cached summary
 * - Clear after use to prevent stale data on subsequent navigations
 */

import { browser } from '$app/environment';

/**
 * Project summary data passed during navigation.
 * This matches the OntologyProjectSummary shape from the list page.
 */
export interface ProjectNavigationData {
	id: string;
	name: string;
	description: string | null;
	state_key: string;
	next_step_short: string | null;
	next_step_long: string | null;
	next_step_source: 'ai' | 'user' | null;
	next_step_updated_at: string | null;
	// Entity counts for skeleton display
	task_count: number;
	document_count: number;
	goal_count: number;
	plan_count: number;
	milestone_count?: number;
	risk_count?: number;
}

const STORAGE_KEY = 'buildos:project-nav';

/**
 * In-memory cache for current navigation.
 * Cleared after consumption to prevent stale data.
 */
let cachedData: ProjectNavigationData | null = null;

/**
 * Set navigation data before navigating to project detail page.
 * Data is stored both in memory and sessionStorage for resilience.
 */
export function setNavigationData(data: ProjectNavigationData): void {
	cachedData = data;

	if (browser) {
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
		} catch {
			// Ignore storage errors (quota exceeded, private mode, etc.)
		}
	}
}

/**
 * Get navigation data for a specific project.
 * Returns null if no data exists or if the project ID doesn't match.
 * Clears the data after retrieval to prevent stale data on subsequent navigations.
 */
export function getNavigationData(projectId: string): ProjectNavigationData | null {
	// Check in-memory cache first
	if (cachedData?.id === projectId) {
		const data = cachedData;
		clearNavigationData();
		return data;
	}

	// Fall back to sessionStorage (handles page refresh during navigation)
	if (browser) {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored) as ProjectNavigationData;
				if (data.id === projectId) {
					clearNavigationData();
					return data;
				}
			}
		} catch {
			// Ignore parse errors
		}
	}

	return null;
}

/**
 * Check if navigation data exists for a project without consuming it.
 * Useful for determining loading strategy without side effects.
 */
export function hasNavigationData(projectId: string): boolean {
	if (cachedData?.id === projectId) {
		return true;
	}

	if (browser) {
		try {
			const stored = sessionStorage.getItem(STORAGE_KEY);
			if (stored) {
				const data = JSON.parse(stored) as ProjectNavigationData;
				return data.id === projectId;
			}
		} catch {
			// Ignore parse errors
		}
	}

	return false;
}

/**
 * Clear all navigation data.
 * Called automatically after getNavigationData() consumes the data.
 */
export function clearNavigationData(): void {
	cachedData = null;

	if (browser) {
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch {
			// Ignore storage errors
		}
	}
}
