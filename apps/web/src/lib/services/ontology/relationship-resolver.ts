// apps/web/src/lib/services/ontology/relationship-resolver.ts
/**
 * Resolves connections into containment and semantic edge plans.
 */

import type { EntityKind, RelationshipType } from './edge-direction';
import { createCanonicalEdge } from './edge-direction';
import type { ParentRef } from './containment-organizer';
import {
	REFERENCE_TARGET_KINDS,
	SUPPORTS_GOAL_KINDS,
	TARGETS_MILESTONE_KINDS,
	TASK_DISALLOWS_PROJECT_FALLBACK_KINDS,
	getAllowedParents,
	isContainmentRel,
	selectPreferredParents
} from './relationship-policy';

export type ConnectionRef = {
	kind: EntityKind;
	id: string;
	intent?: 'containment' | 'semantic';
	rel?: RelationshipType;
};

export type ConnectionOptions = {
	allowProjectFallback?: boolean;
	allowMultiParent?: boolean;
	mode?: 'replace' | 'merge';
	explicitKinds?: EntityKind[];
	skipContainment?: boolean;
};

export type ResolvedSemanticEdge = {
	rel: RelationshipType;
	direction?: 'outgoing' | 'incoming';
	targets?: ParentRef[];
	mode?: 'replace' | 'merge';
	props?: Record<string, unknown> | ((target: ParentRef) => Record<string, unknown>);
};

export type ChildContainmentPlan = {
	child: { kind: EntityKind; id: string };
	parent: ParentRef;
	mode: 'replace' | 'merge';
};

export type RelationshipPlan = {
	entityContainment?: {
		parents: ParentRef[];
		allowProjectFallback: boolean;
		allowMultiParent: boolean;
		mode: 'replace' | 'merge';
	};
	entitySemantic: ResolvedSemanticEdge[];
	entityProjectEdge?: { rel: RelationshipType; mode: 'ensure' | 'remove' };
	childContainment: ChildContainmentPlan[];
};

function dedupeConnections(
	entity: { kind: EntityKind; id: string },
	connections: ConnectionRef[]
): ConnectionRef[] {
	const deduped = new Map<string, ConnectionRef>();
	for (const connection of connections) {
		if (!connection?.kind || !connection.id) continue;
		if (connection.kind === entity.kind && connection.id === entity.id) continue;
		const key = `${connection.kind}:${connection.id}`;
		if (!deduped.has(key)) {
			deduped.set(key, connection);
			continue;
		}
		const existing = deduped.get(key);
		if (!existing) continue;
		if ((existing.rel || existing.intent) && !(connection.rel || connection.intent)) continue;
		deduped.set(key, connection);
	}
	return Array.from(deduped.values());
}

function addSemanticEdge(
	semantic: Map<string, ResolvedSemanticEdge>,
	rel: RelationshipType,
	direction: 'outgoing' | 'incoming',
	target: ParentRef
): void {
	const key = `${rel}:${direction}`;
	const existing = semantic.get(key);
	if (!existing) {
		semantic.set(key, {
			rel,
			direction,
			targets: [target],
			mode: 'replace'
		});
		return;
	}

	const targets = existing.targets ?? [];
	if (
		!targets.some(
			(existingTarget) =>
				existingTarget.kind === target.kind && existingTarget.id === target.id
		)
	) {
		targets.push(target);
		existing.targets = targets;
	}
}

function ensureSemanticRel(
	semantic: Map<string, ResolvedSemanticEdge>,
	rel: RelationshipType,
	direction: 'outgoing' | 'incoming'
): void {
	const key = `${rel}:${direction}`;
	if (semantic.has(key)) return;
	semantic.set(key, { rel, direction, targets: [], mode: 'replace' });
}

function inferReferenceDirection(
	entity: { kind: EntityKind; id: string },
	connection: ConnectionRef
): { direction: 'outgoing' | 'incoming'; target: ParentRef } {
	const entityIsTarget =
		REFERENCE_TARGET_KINDS.has(entity.kind) ||
		(entity.kind === 'document' && connection.kind !== 'document');

	if (entityIsTarget) {
		return {
			direction: 'incoming',
			target: { kind: connection.kind, id: connection.id }
		};
	}

	return {
		direction: 'outgoing',
		target: { kind: connection.kind, id: connection.id }
	};
}

function addExplicitSemantic(
	entity: { kind: EntityKind; id: string },
	connection: ConnectionRef,
	semantic: Map<string, ResolvedSemanticEdge>
): void {
	if (!connection.rel) return;

	if (connection.rel === 'references') {
		const { direction, target } = inferReferenceDirection(entity, connection);
		addSemanticEdge(semantic, connection.rel, direction, target);
		return;
	}

	const normalized = createCanonicalEdge(connection.rel, entity, {
		kind: connection.kind,
		id: connection.id
	});
	if (!normalized) return;

	const direction = normalized.src_id === entity.id ? 'outgoing' : 'incoming';
	const target =
		direction === 'outgoing'
			? { kind: normalized.dst_kind, id: normalized.dst_id }
			: { kind: normalized.src_kind, id: normalized.src_id };

	addSemanticEdge(semantic, normalized.rel, direction, target);
}

export function resolveConnections(params: {
	entity: { kind: EntityKind; id: string };
	connections?: ConnectionRef[];
	options?: ConnectionOptions;
}): RelationshipPlan {
	const { entity, connections = [], options } = params;
	const allowMultiParent = options?.allowMultiParent ?? false;
	const mode: 'replace' | 'merge' = options?.mode ?? 'replace';
	const allowProjectFallback = options?.allowProjectFallback ?? true;
	const explicitKinds = new Set(options?.explicitKinds ?? []);

	const dedupedConnections = dedupeConnections(entity, connections);
	const hasTaskStructuralConnection =
		entity.kind === 'task' &&
		dedupedConnections.some((connection) =>
			TASK_DISALLOWS_PROJECT_FALLBACK_KINDS.has(connection.kind)
		);

	const allowedParents = getAllowedParents(entity.kind);
	const parentCandidates: ParentRef[] = [];

	for (const connection of dedupedConnections) {
		if (connection.intent === 'semantic') continue;
		if (connection.rel && !isContainmentRel(connection.rel)) continue;
		if (!allowedParents.includes(connection.kind)) continue;
		if (connection.kind === entity.kind && allowedParents.includes(connection.kind)) {
			continue;
		}
		parentCandidates.push({ kind: connection.kind, id: connection.id });
	}

	const selectedParents = selectPreferredParents({
		childKind: entity.kind,
		parents: parentCandidates,
		allowMultiParent
	});
	const selectedParentKinds = new Set(selectedParents.map((parent) => parent.kind));

	const childContainmentMap = new Map<string, ChildContainmentPlan>();
	const semantic = new Map<string, ResolvedSemanticEdge>();

	for (const connection of dedupedConnections) {
		const isExplicitSemantic = Boolean(connection.rel && !isContainmentRel(connection.rel));
		const isExplicitContainment = Boolean(connection.intent === 'containment');

		if (isExplicitSemantic) {
			addExplicitSemantic(entity, connection, semantic);
			continue;
		}

		if (!isExplicitContainment && connection.intent === 'semantic') {
			// Explicit semantic intent without rel falls back to references when possible.
			if (
				REFERENCE_TARGET_KINDS.has(connection.kind) ||
				REFERENCE_TARGET_KINDS.has(entity.kind)
			) {
				const { direction, target } = inferReferenceDirection(entity, connection);
				addSemanticEdge(semantic, 'references', direction, target);
			}
			continue;
		}

		const childAllowedParents = getAllowedParents(connection.kind);
		const isChildContainment = childAllowedParents.includes(entity.kind);
		if (isChildContainment) {
			const key = `${connection.kind}:${connection.id}`;
			childContainmentMap.set(key, {
				child: { kind: connection.kind, id: connection.id },
				parent: { kind: entity.kind, id: entity.id },
				mode: 'merge'
			});
			continue;
		}

		if (entity.kind === 'task' && connection.kind === 'task') {
			addSemanticEdge(semantic, 'depends_on', 'outgoing', {
				kind: connection.kind,
				id: connection.id
			});
			continue;
		}

		if (SUPPORTS_GOAL_KINDS.has(entity.kind) && connection.kind === 'goal') {
			if (!selectedParentKinds.has('goal')) {
				addSemanticEdge(semantic, 'supports_goal', 'outgoing', {
					kind: connection.kind,
					id: connection.id
				});
			}
			continue;
		}

		if (TARGETS_MILESTONE_KINDS.has(entity.kind) && connection.kind === 'milestone') {
			if (!selectedParentKinds.has('milestone')) {
				addSemanticEdge(semantic, 'targets_milestone', 'outgoing', {
					kind: connection.kind,
					id: connection.id
				});
			}
			continue;
		}

		if (connection.kind === 'document' || entity.kind === 'document') {
			if (connection.kind === 'project' || entity.kind === 'project') {
				continue;
			}
			if (connection.kind === 'document' && entity.kind === 'document') {
				continue;
			}
			const { direction, target } = inferReferenceDirection(entity, connection);
			addSemanticEdge(semantic, 'references', direction, target);
			continue;
		}

		if (connection.kind === 'source' || entity.kind === 'source') {
			if (connection.kind === 'project' || entity.kind === 'project') {
				continue;
			}
			const { direction, target } = inferReferenceDirection(entity, connection);
			addSemanticEdge(semantic, 'references', direction, target);
			continue;
		}
	}

	if (explicitKinds.has('goal') && SUPPORTS_GOAL_KINDS.has(entity.kind)) {
		ensureSemanticRel(semantic, 'supports_goal', 'outgoing');
	}
	if (explicitKinds.has('milestone') && TARGETS_MILESTONE_KINDS.has(entity.kind)) {
		ensureSemanticRel(semantic, 'targets_milestone', 'outgoing');
	}

	const entityContainment = {
		parents: parentCandidates,
		allowProjectFallback: allowProjectFallback && !hasTaskStructuralConnection,
		allowMultiParent,
		mode
	};

	let entityProjectEdge: RelationshipPlan['entityProjectEdge'];
	if (entity.kind === 'document') {
		entityProjectEdge = { rel: 'has_document', mode: 'ensure' };
	} else if (entity.kind === 'source') {
		entityProjectEdge = { rel: 'has_source', mode: 'ensure' };
	}

	return {
		entityContainment,
		entitySemantic: Array.from(semantic.values()),
		entityProjectEdge,
		childContainment: Array.from(childContainmentMap.values())
	};
}
