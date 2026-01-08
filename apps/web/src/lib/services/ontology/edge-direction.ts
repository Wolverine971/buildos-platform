// apps/web/src/lib/services/ontology/edge-direction.ts
/**
 * Edge Direction Utility
 *
 * Defines canonical edge directions for the ontology system.
 * Convention: Store edges directionally, query bidirectionally.
 *
 * This means:
 * - Each relationship is stored as ONE row with a canonical direction
 * - Queries check both src_id and dst_id to find all relationships
 * - No redundant reverse edges needed
 *
 * Canonical Direction Rules:
 * - Container → Contained (project contains plan, plan contains task)
 * - Parent → Child (milestone has task)
 * - Producer → Product (task produces output)
 * - Threat → Target (risk threatens task)
 * - Reference → Referenced (document relates to task)
 */

/**
 * Entity kinds in the ontology system
 */
export type EntityKind =
	| 'project'
	| 'plan'
	| 'task'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'output'
	| 'risk'
	| 'decision'
	| 'requirement'
	| 'metric'
	| 'source';

/**
 * Valid relationship types
 * Direction convention documented for each
 */
export const RELATIONSHIP_DIRECTIONS = {
	// Containment relationships (parent → child)
	contains: { description: 'Generic containment', srcKinds: ['project', 'plan', 'milestone'] },
	has_plan: {
		description: 'Project, goal, or milestone contains plan',
		srcKinds: ['project', 'goal', 'milestone']
	},
	has_task: {
		description: 'Plan, milestone, goal, or project contains task',
		srcKinds: ['plan', 'milestone', 'goal', 'project']
	},
	has_goal: { description: 'Project contains goal', srcKinds: ['project'] },
	has_document: { description: 'Project contains document', srcKinds: ['project'] },
	has_output: { description: 'Project contains output', srcKinds: ['project'] },
	has_risk: {
		description: 'Project, goal, milestone, plan, or task contains risk',
		srcKinds: ['project', 'goal', 'milestone', 'plan', 'task']
	},
	has_milestone: {
		description: 'Goal contains milestone',
		srcKinds: ['goal']
	},
	has_metric: {
		description: 'Project, goal, milestone, plan, task, risk, or decision contains metric',
		srcKinds: ['project', 'goal', 'milestone', 'plan', 'task', 'risk', 'decision']
	},
	has_requirement: {
		description: 'Project, milestone, plan, task, or decision contains requirement',
		srcKinds: ['project', 'milestone', 'plan', 'task', 'decision']
	},
	has_source: { description: 'Project contains source', srcKinds: ['project'] },
	has_decision: {
		description: 'Project, goal, milestone, plan, or task contains decision',
		srcKinds: ['project', 'goal', 'milestone', 'plan', 'task']
	},
	has_context_document: {
		description: 'Project contains context document',
		srcKinds: ['project']
	},
	has_part: { description: 'Document contains document part', srcKinds: ['document'] },

	// Goal relationships (task/plan → goal it supports)
	supports_goal: { description: 'Task or plan supports goal', srcKinds: ['task', 'plan'] },
	achieved_by: { description: 'Goal achieved by plan or task', srcKinds: ['goal'] },

	// Milestone relationships (task/plan → milestone)
	targets_milestone: {
		description: 'Task or plan targets milestone',
		srcKinds: ['task', 'plan']
	},

	// Dependency relationships (dependent → dependency)
	depends_on: { description: 'Entity depends on another', srcKinds: ['task', 'plan', 'goal'] },
	requires: { description: 'Entity requires another', srcKinds: ['task', 'plan'] },
	blocks: { description: 'Entity blocks another', srcKinds: ['task'] },

	// Reference relationships (referrer → referenced)
	references: {
		description: 'Entity references another',
		srcKinds: [
			'project',
			'goal',
			'milestone',
			'plan',
			'task',
			'document',
			'decision',
			'risk',
			'output',
			'requirement',
			'metric',
			'source'
		]
	},
	referenced_by: { description: 'Reverse reference (deprecated)', srcKinds: [] }, // Deprecated - use references
	relates_to: { description: 'Document relates to entity', srcKinds: ['document'] },

	// Production relationships (producer → product)
	produces: {
		description: 'Task, goal, or milestone produces output',
		srcKinds: ['task', 'goal', 'milestone']
	},
	produced_by: { description: 'Reverse production (deprecated)', srcKinds: [] }, // Deprecated - use produces

	// Risk relationships (risk → target OR mitigator → risk)
	threatens: { description: 'Risk threatens entity', srcKinds: ['risk'] },
	mitigates: { description: 'Entity mitigates risk', srcKinds: ['task', 'plan'] },
	mitigated_by: { description: 'Risk mitigated by (deprecated)', srcKinds: [] }, // Deprecated - use mitigates
	addressed_in: { description: 'Risk addressed in plan', srcKinds: ['risk'] },
	addresses: { description: 'Plan addresses risk', srcKinds: ['plan'] },
	documented_in: { description: 'Risk documented in document', srcKinds: ['risk'] }
} as const;

export type RelationshipType = keyof typeof RELATIONSHIP_DIRECTIONS;

/**
 * Deprecated relationship types that have canonical replacements
 * Maps deprecated rel → canonical rel with swapped direction
 */
export const DEPRECATED_RELATIONSHIPS: Record<
	string,
	{ canonical: RelationshipType; swapDirection: boolean }
> = {
	belongs_to_plan: { canonical: 'has_task', swapDirection: true },
	part_of: { canonical: 'contains', swapDirection: true },
	referenced_by: { canonical: 'references', swapDirection: true },
	produced_by: { canonical: 'produces', swapDirection: true },
	mitigated_by: { canonical: 'mitigates', swapDirection: true },
	achieved_by: { canonical: 'supports_goal', swapDirection: true }
};

/**
 * All valid relationship types (including deprecated for backwards compatibility)
 */
export const VALID_RELS = [
	...Object.keys(RELATIONSHIP_DIRECTIONS),
	...Object.keys(DEPRECATED_RELATIONSHIPS)
] as string[];

/**
 * Edge input for creation
 */
export interface EdgeInput {
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
	props?: Record<string, unknown>;
}

/**
 * Normalized edge output
 */
export interface NormalizedEdge {
	src_kind: EntityKind;
	src_id: string;
	dst_kind: EntityKind;
	dst_id: string;
	rel: RelationshipType;
	props: Record<string, unknown>;
}

/**
 * Normalizes an edge to its canonical direction.
 * If a deprecated relationship is used, converts it to the canonical form.
 *
 * Example:
 * - Input: { src: task, dst: plan, rel: 'belongs_to_plan' }
 * - Output: { src: plan, dst: task, rel: 'has_task' }
 *
 * @param edge - The edge to normalize
 * @returns The edge in canonical direction, or null if invalid
 */
export function normalizeEdgeDirection(edge: EdgeInput): NormalizedEdge | null {
	const { src_kind, src_id, dst_kind, dst_id, rel, props = {} } = edge;

	// Check if this is a deprecated relationship that needs conversion
	const deprecatedInfo = DEPRECATED_RELATIONSHIPS[rel];
	if (deprecatedInfo) {
		if (deprecatedInfo.swapDirection) {
			// Swap source and destination
			return {
				src_kind: dst_kind as EntityKind,
				src_id: dst_id,
				dst_kind: src_kind as EntityKind,
				dst_id: src_id,
				rel: deprecatedInfo.canonical,
				props
			};
		}
		return {
			src_kind: src_kind as EntityKind,
			src_id,
			dst_kind: dst_kind as EntityKind,
			dst_id,
			rel: deprecatedInfo.canonical,
			props
		};
	}

	// Check if the relationship is valid
	if (!(rel in RELATIONSHIP_DIRECTIONS)) {
		return null;
	}

	const directionInfo = RELATIONSHIP_DIRECTIONS[rel as RelationshipType];
	const srcKinds = directionInfo.srcKinds as readonly string[];

	if (srcKinds.length > 0 && !srcKinds.includes(src_kind) && srcKinds.includes(dst_kind)) {
		return {
			src_kind: dst_kind as EntityKind,
			src_id: dst_id,
			dst_kind: src_kind as EntityKind,
			dst_id: src_id,
			rel: rel as RelationshipType,
			props
		};
	}

	// Return as-is (already canonical)
	return {
		src_kind: src_kind as EntityKind,
		src_id,
		dst_kind: dst_kind as EntityKind,
		dst_id,
		rel: rel as RelationshipType,
		props
	};
}

/**
 * Creates an edge with the canonical direction for a relationship.
 * This is a helper for entity creation that ensures correct direction.
 *
 * @param rel - The relationship type
 * @param entityA - First entity { kind, id }
 * @param entityB - Second entity { kind, id }
 * @returns Edge with correct source/destination based on relationship rules
 */
export function createCanonicalEdge(
	rel: RelationshipType,
	entityA: { kind: EntityKind; id: string },
	entityB: { kind: EntityKind; id: string },
	props: Record<string, unknown> = {}
): NormalizedEdge | null {
	const directionInfo = RELATIONSHIP_DIRECTIONS[rel];
	if (!directionInfo) {
		return null;
	}

	// Determine which entity should be the source based on srcKinds
	const srcKinds = directionInfo.srcKinds as readonly string[];

	if (srcKinds.includes(entityA.kind)) {
		return {
			src_kind: entityA.kind,
			src_id: entityA.id,
			dst_kind: entityB.kind,
			dst_id: entityB.id,
			rel,
			props
		};
	}

	if (srcKinds.includes(entityB.kind)) {
		return {
			src_kind: entityB.kind,
			src_id: entityB.id,
			dst_kind: entityA.kind,
			dst_id: entityA.id,
			rel,
			props
		};
	}

	// Neither entity matches expected source kinds - use entityA as source by default
	return {
		src_kind: entityA.kind,
		src_id: entityA.id,
		dst_kind: entityB.kind,
		dst_id: entityB.id,
		rel,
		props
	};
}

/**
 * Validates that an edge follows the canonical direction rules.
 *
 * @param edge - The edge to validate
 * @returns Error message if invalid, null if valid
 */
export function validateEdgeDirection(edge: EdgeInput): string | null {
	const { src_kind, dst_kind, rel } = edge;

	// Allow deprecated rels for backwards compatibility
	if (rel in DEPRECATED_RELATIONSHIPS) {
		return null;
	}

	const directionInfo = RELATIONSHIP_DIRECTIONS[rel as RelationshipType];
	if (!directionInfo) {
		return `Invalid relationship type: ${rel}`;
	}

	const srcKinds = directionInfo.srcKinds as readonly string[];

	// If srcKinds is empty, any source is allowed
	if (srcKinds.length === 0) {
		return null;
	}

	// Check if source kind is valid for this relationship
	if (!srcKinds.includes(src_kind)) {
		return `Invalid source kind '${src_kind}' for relationship '${rel}'. Expected one of: ${srcKinds.join(', ')}`;
	}

	return null;
}

/**
 * Gets the display label for a relationship from a given entity's perspective.
 * Useful for UI that shows relationships in both directions.
 *
 * @param rel - The relationship type
 * @param isSource - Whether the viewing entity is the source of the edge
 * @returns Human-readable label
 */
export function getRelationshipLabel(rel: RelationshipType, isSource: boolean): string {
	const labels: Record<RelationshipType, { asSource: string; asTarget: string }> = {
		contains: { asSource: 'Contains', asTarget: 'Contained by' },
		has_plan: { asSource: 'Has plan', asTarget: 'Plan of' },
		has_task: { asSource: 'Has task', asTarget: 'Task of' },
		has_goal: { asSource: 'Has goal', asTarget: 'Goal of' },
		has_document: { asSource: 'Has document', asTarget: 'Document of' },
		has_output: { asSource: 'Has output', asTarget: 'Output of' },
		has_risk: { asSource: 'Has risk', asTarget: 'Risk of' },
		has_milestone: { asSource: 'Has milestone', asTarget: 'Milestone of' },
		has_metric: { asSource: 'Has metric', asTarget: 'Metric of' },
		has_requirement: { asSource: 'Has requirement', asTarget: 'Requirement of' },
		has_source: { asSource: 'Has source', asTarget: 'Source of' },
		has_decision: { asSource: 'Has decision', asTarget: 'Decision of' },
		has_context_document: { asSource: 'Has context document', asTarget: 'Context document of' },
		has_part: { asSource: 'Has part', asTarget: 'Part of' },
		supports_goal: { asSource: 'Supports goal', asTarget: 'Supported by' },
		achieved_by: { asSource: 'Achieved by', asTarget: 'Achieves' },
		targets_milestone: { asSource: 'Targets milestone', asTarget: 'Targeted by' },
		depends_on: { asSource: 'Depends on', asTarget: 'Dependency of' },
		requires: { asSource: 'Requires', asTarget: 'Required by' },
		blocks: { asSource: 'Blocks', asTarget: 'Blocked by' },
		references: { asSource: 'References', asTarget: 'Referenced by' },
		referenced_by: { asSource: 'Referenced by', asTarget: 'References' },
		relates_to: { asSource: 'Relates to', asTarget: 'Related from' },
		produces: { asSource: 'Produces', asTarget: 'Produced by' },
		produced_by: { asSource: 'Produced by', asTarget: 'Produces' },
		threatens: { asSource: 'Threatens', asTarget: 'Threatened by' },
		mitigates: { asSource: 'Mitigates', asTarget: 'Mitigated by' },
		mitigated_by: { asSource: 'Mitigated by', asTarget: 'Mitigates' },
		addressed_in: { asSource: 'Addressed in', asTarget: 'Addresses' },
		addresses: { asSource: 'Addresses', asTarget: 'Addressed in' },
		documented_in: { asSource: 'Documented in', asTarget: 'Documents' }
	};

	const labelInfo = labels[rel];
	if (!labelInfo) {
		return rel;
	}

	return isSource ? labelInfo.asSource : labelInfo.asTarget;
}
