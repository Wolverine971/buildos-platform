// apps/web/src/lib/components/ontology/linked-entities/linked-entities.service.ts
/**
 * Service layer for LinkedEntities component API interactions.
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

import type {
	EntityKind,
	LinkedEntitiesApiResponse,
	LinkedEntity,
	AvailableEntity
} from './linked-entities.types';
import { getRelationship } from './linked-entities.types';

/**
 * Fetch linked and available entities for a source entity.
 */
export async function fetchLinkedEntities(
	sourceId: string,
	sourceKind: EntityKind,
	projectId: string
): Promise<LinkedEntitiesApiResponse> {
	const params = new URLSearchParams({
		sourceId,
		sourceKind,
		projectId
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
