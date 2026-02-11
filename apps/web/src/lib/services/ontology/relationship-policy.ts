// apps/web/src/lib/services/ontology/relationship-policy.ts
/**
 * Relationship policy helpers for the ontology FSM resolver.
 *
 * Keep inference rules centralized and re-usable across services.
 */

import type { EntityKind, RelationshipType } from './edge-direction';
import { ALLOWED_PARENTS, CONTAINMENT_RELS, resolveContainmentRel } from './containment-organizer';

export const SUPPORTS_GOAL_KINDS = new Set<EntityKind>(['task', 'plan']);
export const TARGETS_MILESTONE_KINDS = new Set<EntityKind>(['task', 'plan']);
export const TASK_DISALLOWS_PROJECT_FALLBACK_KINDS = new Set<EntityKind>([
	'plan',
	'goal',
	'milestone',
	'task'
]);

export const REFERENCE_TARGET_KINDS = new Set<EntityKind>(['document', 'source']);

export function isContainmentRel(rel: RelationshipType): boolean {
	return CONTAINMENT_RELS.includes(rel);
}

export function getAllowedParents(kind: EntityKind): EntityKind[] {
	return ALLOWED_PARENTS[kind] ?? [];
}

export function getContainmentRel(
	childKind: EntityKind,
	parentKind: EntityKind
): RelationshipType | null {
	return resolveContainmentRel(childKind, parentKind);
}

export function selectPreferredParents(params: {
	childKind: EntityKind;
	parents: Array<{ kind: EntityKind; id: string }>;
	allowMultiParent: boolean;
}): Array<{ kind: EntityKind; id: string }> {
	const { childKind, parents, allowMultiParent } = params;
	const allowed = getAllowedParents(childKind);
	const filtered = parents.filter((parent) => allowed.includes(parent.kind));
	if (filtered.length === 0) return [];

	const indexByKind = new Map(allowed.map((kind, index) => [kind, index]));
	const minIndex = Math.min(
		...filtered.map((parent) => indexByKind.get(parent.kind) ?? Number.POSITIVE_INFINITY)
	);
	const winners = filtered.filter(
		(parent) => (indexByKind.get(parent.kind) ?? Number.POSITIVE_INFINITY) === minIndex
	);

	if (allowMultiParent) {
		return winners;
	}

	return winners.length > 0 ? [winners[0]!] : [];
}
