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
	LinkedEntity,
	AvailableEntity
} from './linked-entities.types';
import { getRelationship } from './linked-entities.types';
import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

type ParentRef = {
	kind: EntityKind;
	id: string;
	is_primary?: boolean;
};

const PARENTING_RULES: Record<string, { childKind: EntityKind; parentKind: EntityKind }> = {
	'plan-task': { childKind: 'task', parentKind: 'plan' },
	'task-plan': { childKind: 'task', parentKind: 'plan' },
	'goal-task': { childKind: 'task', parentKind: 'goal' },
	'task-goal': { childKind: 'task', parentKind: 'goal' },
	'goal-plan': { childKind: 'plan', parentKind: 'goal' },
	'plan-goal': { childKind: 'plan', parentKind: 'goal' },
	'milestone-plan': { childKind: 'plan', parentKind: 'milestone' },
	'plan-milestone': { childKind: 'plan', parentKind: 'milestone' },
	'goal-milestone': { childKind: 'milestone', parentKind: 'goal' },
	'milestone-goal': { childKind: 'milestone', parentKind: 'goal' },
	'output-task': { childKind: 'output', parentKind: 'task' },
	'task-output': { childKind: 'output', parentKind: 'task' }
};

const ALLOWED_PARENTS_BY_CHILD: Partial<Record<EntityKind, EntityKind[]>> = {
	task: ['plan', 'goal'],
	plan: ['milestone', 'goal'],
	milestone: ['goal'],
	output: ['task']
};

const CHILD_KIND_BY_REL: Record<string, EntityKind> = {
	has_task: 'task',
	has_plan: 'plan',
	has_milestone: 'milestone',
	produces: 'output'
};

const PARENT_ENDPOINTS: Partial<Record<EntityKind, string>> = {
	task: '/api/onto/tasks',
	plan: '/api/onto/plans',
	milestone: '/api/onto/milestones',
	output: '/api/onto/outputs'
};

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
		void logOntologyClientError(error, {
			endpoint: '/api/onto/edges/linked',
			method: 'GET',
			projectId,
			entityType: 'edge',
			operation: 'edges_fetch_linked',
			metadata: { sourceId, sourceKind, includeAvailable }
		});
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
		void logOntologyClientError(error, {
			endpoint: '/api/onto/edges/available',
			method: 'GET',
			projectId,
			entityType: 'edge',
			operation: 'edges_fetch_available',
			metadata: { sourceId, sourceKind, targetKind }
		});
		throw new Error(error.error || 'Failed to fetch available entities');
	}

	const result = await response.json();
	return result.data?.entities || [];
}

function flattenLinkedEntities(
	linked: LinkedEntitiesResult
): Array<{ kind: EntityKind; entity: LinkedEntity }> {
	const entries: Array<[EntityKind, LinkedEntity[]]> = [
		['task', linked.tasks],
		['plan', linked.plans],
		['goal', linked.goals],
		['milestone', linked.milestones],
		['document', linked.documents],
		['output', linked.outputs],
		['risk', linked.risks],
		['decision', linked.decisions],
		['event', linked.events]
	];

	const flattened: Array<{ kind: EntityKind; entity: LinkedEntity }> = [];
	for (const [kind, entities] of entries) {
		for (const entity of entities) {
			flattened.push({ kind, entity });
		}
	}

	return flattened;
}

async function fetchExistingParents(
	childKind: EntityKind,
	childId: string,
	projectId: string
): Promise<ParentRef[]> {
	const allowedParents = ALLOWED_PARENTS_BY_CHILD[childKind] ?? [];
	if (allowedParents.length === 0) return [];

	const result = await fetchLinkedEntities(childId, childKind, projectId, {
		includeAvailable: false
	});

	const parents: ParentRef[] = [];
	for (const { kind, entity } of flattenLinkedEntities(result.linkedEntities)) {
		if (entity.edge_direction !== 'incoming') continue;
		if (!allowedParents.includes(kind)) continue;
		const childKindFromRel = CHILD_KIND_BY_REL[entity.edge_rel];
		if (!childKindFromRel || childKindFromRel !== childKind) continue;
		parents.push({ kind, id: entity.id });
	}

	return parents;
}

function mergeParents(existing: ParentRef[], additions: ParentRef[]): ParentRef[] {
	const merged = new Map<string, ParentRef>();
	for (const parent of existing) {
		merged.set(`${parent.kind}:${parent.id}`, parent);
	}
	for (const parent of additions) {
		const key = `${parent.kind}:${parent.id}`;
		if (!merged.has(key)) {
			merged.set(key, parent);
		}
	}
	return Array.from(merged.values());
}

async function updateEntityParents(
	childKind: EntityKind,
	childId: string,
	parents: ParentRef[],
	projectId?: string
): Promise<void> {
	const endpoint = PARENT_ENDPOINTS[childKind];
	if (!endpoint) {
		throw new Error(`Unsupported parent update for ${childKind}`);
	}

	const response = await fetch(`${endpoint}/${childId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ parents })
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({ error: 'Failed to update links' }));
		void logOntologyClientError(error, {
			endpoint: `${endpoint}/${childId}`,
			method: 'PATCH',
			projectId,
			entityType: childKind,
			entityId: childId,
			operation: 'edges_update_parents'
		});
		throw new Error(error.error || 'Failed to update links');
	}
}

async function addParentsToChild(params: {
	childKind: EntityKind;
	childId: string;
	parentKind: EntityKind;
	parentIds: string[];
	projectId: string;
}): Promise<void> {
	const { childKind, childId, parentKind, parentIds, projectId } = params;
	const existingParents = await fetchExistingParents(childKind, childId, projectId);
	const newParents = parentIds.map((id) => ({ kind: parentKind, id }));
	const mergedParents = mergeParents(existingParents, newParents);
	await updateEntityParents(childKind, childId, mergedParents, projectId);
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
		void logOntologyClientError(error, {
			endpoint: '/api/onto/edges',
			method: 'POST',
			entityType: 'edge',
			operation: 'edges_create',
			metadata: { sourceId, sourceKind, targetKind }
		});
		throw new Error(error.error || 'Failed to create links');
	}

	const result = await response.json();
	return result.data;
}

export async function linkEntities(params: {
	sourceId: string;
	sourceKind: EntityKind;
	targetIds: string[];
	targetKind: EntityKind;
	projectId: string;
}): Promise<{ created: number }> {
	const { sourceId, sourceKind, targetIds, targetKind, projectId } = params;
	const rule = PARENTING_RULES[`${sourceKind}-${targetKind}`];

	if (!rule) {
		return createEdges(sourceId, sourceKind, targetIds, targetKind);
	}

	if (rule.childKind === sourceKind) {
		await addParentsToChild({
			childKind: rule.childKind,
			childId: sourceId,
			parentKind: rule.parentKind,
			parentIds: targetIds,
			projectId
		});
		return { created: targetIds.length };
	}

	const tasks = targetIds.map((targetId) =>
		addParentsToChild({
			childKind: rule.childKind,
			childId: targetId,
			parentKind: rule.parentKind,
			parentIds: [sourceId],
			projectId
		})
	);

	await Promise.all(tasks);
	return { created: targetIds.length };
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
		void logOntologyClientError(error, {
			endpoint: `/api/onto/edges/${edgeId}`,
			method: 'DELETE',
			entityType: 'edge',
			entityId: edgeId,
			operation: 'edges_delete'
		});
		throw new Error(error.error || 'Failed to remove link');
	}
}

export async function unlinkEntity(params: {
	sourceId: string;
	sourceKind: EntityKind;
	linkedEntity: LinkedEntity;
	linkedKind: EntityKind;
	projectId: string;
}): Promise<void> {
	const { sourceId, sourceKind, linkedEntity, linkedKind, projectId } = params;
	const childKind = CHILD_KIND_BY_REL[linkedEntity.edge_rel];

	if (!childKind) {
		return deleteEdge(linkedEntity.edge_id);
	}

	const childIsSource = linkedEntity.edge_direction === 'incoming';
	const childId = childIsSource ? sourceId : linkedEntity.id;
	const parentId = childIsSource ? linkedEntity.id : sourceId;
	const parentKind = childIsSource ? linkedKind : sourceKind;

	const expectedChildKind = childIsSource ? sourceKind : linkedKind;
	if (childKind !== expectedChildKind) {
		return deleteEdge(linkedEntity.edge_id);
	}

	const existingParents = await fetchExistingParents(childKind, childId, projectId);
	const remainingParents = existingParents.filter(
		(parent) => !(parent.kind === parentKind && parent.id === parentId)
	);

	await updateEntityParents(childKind, childId, remainingParents, projectId);
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
