// src/lib/utils/soft-delete.utils.ts
/**
 * Soft Delete Utilities
 *
 * Utility functions for working with soft-deleted items using deleted_at timestamps
 */

export interface SoftDeletable {
	deleted_at: string | null;
}

/**
 * Check if an item is soft deleted
 */
export function isDeleted(item: { deleted_at: string | null }): boolean {
	return item.deleted_at !== null;
}

/**
 * Check if an item is active (not soft deleted)
 */
export function isActive(item: { deleted_at: string | null }): boolean {
	return item.deleted_at === null;
}

/**
 * Check if an item was deleted within a specified number of days
 */
export function wasDeletedWithin(item: { deleted_at: string | null }, days: number): boolean {
	if (!item.deleted_at) return false;

	const deletedDate = new Date(item.deleted_at);
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);

	return deletedDate > cutoff;
}

/**
 * Filter array to only include active (non-deleted) items
 */
export function filterActive<T extends { deleted_at: string | null }>(items: T[]): T[] {
	return items.filter((item) => !item.deleted_at);
}

/**
 * Filter array to only include soft-deleted items
 */
export function filterDeleted<T extends { deleted_at: string | null }>(items: T[]): T[] {
	return items.filter((item) => item.deleted_at);
}

/**
 * Filter array to only include recently deleted items (within specified days)
 */
export function filterRecentlyDeleted<T extends { deleted_at: string | null }>(
	items: T[],
	days = 30
): T[] {
	return items.filter((item) => wasDeletedWithin(item, days));
}

/**
 * Get counts of active vs deleted items
 */
export function getActiveCounts<T extends { deleted_at: string | null }>(
	items: T[]
): {
	active: number;
	deleted: number;
	recentlyDeleted: number;
	total: number;
} {
	const active = filterActive(items).length;
	const deleted = filterDeleted(items).length;
	const recentlyDeleted = filterRecentlyDeleted(items, 7).length;

	return {
		active,
		deleted,
		recentlyDeleted,
		total: items.length
	};
}

/**
 * Sort items by deletion date (most recently deleted first)
 */
export function sortByDeletionDate<T extends { deleted_at: string | null }>(items: T[]): T[] {
	return items.sort((a, b) => {
		// Active items first (deleted_at is null)
		if (!a.deleted_at && !b.deleted_at) return 0;
		if (!a.deleted_at) return -1;
		if (!b.deleted_at) return 1;

		// Sort deleted items by deletion date (most recent first)
		return new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime();
	});
}

/**
 * Format deletion timestamp for display
 */
export function formatDeletionDate(deletedAt: string | null): string {
	if (!deletedAt) return '';

	const date = new Date(deletedAt);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	return date.toLocaleDateString();
}

/**
 * Check if an item is eligible for permanent deletion (older than specified days)
 */
export function isEligibleForPermanentDeletion(
	item: { deleted_at: string | null },
	daysThreshold = 90
): boolean {
	if (!item.deleted_at) return false;

	const deletedDate = new Date(item.deleted_at);
	const threshold = new Date();
	threshold.setDate(threshold.getDate() - daysThreshold);

	return deletedDate < threshold;
}
