// apps/web/src/lib/components/ontology/linked-entities/linked-entities.service.ts
/**
 * Service layer for LinkedEntities component API interactions.
 *
 * Performance optimizations:
 * - fetchLinkedEntities now skips available entities by default (includeAvailable=false)
 * - fetchAvailableEntities is a new lazy-load function called only when user clicks "Add"
 * - This reduces initial modal load from 8+ queries to just 1 edge query
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type {
	EntityKind,
	LinkedEntitiesApiResponse,
	LinkedEntitiesResult,
	AvailableEntity
} from './linked-entities.types';
import { getRelationship } from './linked-entities.types';

/**
 * Fetch linked entities for a source entity.
 * By default, skips fetching available entities for performance.
 *
 * @param sourceId - Source entity ID
 * @param sourceKind - Source entity kind
 * @param projectId - Project context
 * @param options.includeAvailable - Whether to fetch available entities (default: false)
 */
export async function fetchLinkedEntities(
	sourceId: string,
	sourceKind: EntityKind,
	projectId: string,
	options: { includeAvailable?: boolean } = {}
): Promise<LinkedEntitiesApiResponse> {
	const { includeAvailable = false } = options;

	const params = new URLSearchParams({
		sourceId,
		sourceKind,
		projectId,
		includeAvailable: includeAvailable.toString()
	});

	const response = await fetch(`/api/onto/edges/linked?${params}`);

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ error: 'Failed to fetch linked entities' }));
		throw new Error(error.error || 'Failed to fetch linked entities');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Fetch available entities for linking - called lazily when user clicks "Add".
 * This is a performance optimization - only fetches entities for the specific kind needed.
 *
 * @param sourceId - Source entity ID
 * @param sourceKind - Source entity kind
 * @param projectId - Project context
 * @param targetKind - Kind of entities to fetch
 * @param linkedIds - IDs of already-linked entities (to mark isLinked)
 */
export async function fetchAvailableEntities(
	sourceId: string,
	sourceKind: EntityKind,
	projectId: string,
	targetKind: EntityKind,
	linkedIds: string[]
): Promise<AvailableEntity[]> {
	const params = new URLSearchParams({
		sourceId,
		sourceKind,
		projectId,
		targetKind,
		linkedIds: linkedIds.join(',')
	});

	const response = await fetch(`/api/onto/edges/available?${params}`);

	if (!response.ok) {
		const error = await response
			.json()
			.catch(() => ({ error: 'Failed to fetch available entities' }));
		throw new Error(error.error || 'Failed to fetch available entities');
	}

	const result = await response.json();
	return result.data?.entities || [];
}

/**
 * Create edge relationships between entities.
 */
export async function createEdges(
	sourceId: string,
	sourceKind: EntityKind,
	targetIds: string[],
	targetKind: EntityKind
): Promise<{ created: number }> {
	const rel = getRelationship(sourceKind, targetKind);

	const edges = targetIds.map((targetId) => ({
		src_kind: sourceKind,
		src_id: sourceId,
		dst_kind: targetKind,
		dst_id: targetId,
		rel
	}));

	const response = await fetch('/api/onto/edges', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ edges })
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Failed to create links' }));
		throw new Error(error.error || 'Failed to create links');
	}

	const result = await response.json();
	return result.data;
}

/**
 * Delete an edge by ID.
 */
export async function deleteEdge(edgeId: string): Promise<void> {
	const response = await fetch(`/api/onto/edges/${edgeId}`, {
		method: 'DELETE'
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Failed to remove link' }));
		throw new Error(error.error || 'Failed to remove link');
	}
}

/**
 * Filter available entities by search query.
 */
export function filterEntities(entities: AvailableEntity[], query: string): AvailableEntity[] {
	if (!query.trim()) return entities;

	const lowerQuery = query.toLowerCase();
	return entities.filter((entity) => {
		const name = (entity.name || entity.title || '').toLowerCase();
		return name.includes(lowerQuery);
	});
}
