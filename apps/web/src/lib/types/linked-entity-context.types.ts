// apps/web/src/lib/types/linked-entity-context.types.ts
/**
 * Types for linked entity context in agentic chat.
 * Used to provide the AI agent with relationship awareness when chatting about a focused entity.
 *
 * Documentation: /apps/web/docs/features/agentic-chat/LINKED_ENTITY_CONTEXT_SPEC.md
 */

import type { OntologyEntityType } from './agent-chat-enhancement';

/**
 * Entity kinds that can be linked via edges.
 * Matches the EntityKind from linked-entities component.
 */
export type LinkedEntityKind =
	| 'task'
	| 'plan'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'output'
	| 'risk';

/**
 * A single linked entity with context for chat.
 */
export interface LinkedEntityContext {
	/** Entity type (task, plan, goal, milestone, document, output) */
	kind: LinkedEntityKind;

	/** Entity ID (UUID) */
	id: string;

	/** Display name (name or title) */
	name: string;

	/** Current state (active, draft, completed, todo, in_progress, etc.) */
	state: string | null;

	/** Template type key for categorization */
	typeKey: string | null;

	/** Relationship type (belongs_to_plan, supports_goal, depends_on, etc.) */
	relation: string;

	/** Direction from source entity's perspective */
	direction: 'outgoing' | 'incoming';

	/** Edge ID for reference */
	edgeId: string;

	/** Optional description (truncated for abbreviated mode) */
	description?: string;

	/** Optional due date (for milestones) */
	dueAt?: string;
}

/**
 * Full linked entity context for an entity, used in chat system prompts.
 */
export interface EntityLinkedContext {
	/** Source entity being described */
	source: {
		kind: OntologyEntityType;
		id: string;
		name: string;
	};

	/** Linked entities grouped by type */
	linkedEntities: {
		plans: LinkedEntityContext[];
		goals: LinkedEntityContext[];
		tasks: LinkedEntityContext[];
		milestones: LinkedEntityContext[];
		documents: LinkedEntityContext[];
		outputs: LinkedEntityContext[];
		risks: LinkedEntityContext[];
	};

	/** Summary counts (total, not just shown) */
	counts: {
		plans: number;
		goals: number;
		tasks: number;
		milestones: number;
		documents: number;
		outputs: number;
		risks: number;
		total: number;
	};

	/** Whether data was truncated (more entities than shown) */
	truncated: boolean;

	/** Timestamp when this context was loaded */
	loadedAt: string;
}

/**
 * Options for loading linked entity context.
 */
export interface LoadLinkedEntitiesOptions {
	/** Maximum entities to load per type (default: 3 for abbreviated, 50 for full) */
	maxPerType?: number;

	/** Whether to include descriptions (default: false for abbreviated) */
	includeDescriptions?: boolean;

	/** Priority ordering for entities */
	priorityOrder?: 'active_first' | 'recent_first';
}

/**
 * Relationship type labels for human-readable output.
 */
export const RELATIONSHIP_LABELS: Record<string, string> = {
	// Task relationships
	belongs_to_plan: 'belongs to plan',
	supports_goal: 'supports goal',
	depends_on: 'depends on',
	targets_milestone: 'targets milestone',
	references: 'references',
	produces: 'produces',

	// Plan relationships
	has_task: 'has task',

	// Goal relationships
	requires: 'requires',
	achieved_by: 'achieved by',

	// Document relationships
	referenced_by: 'referenced by',

	// Milestone relationships
	contains: 'contains',

	// Output relationships
	produced_by: 'produced by',

	// Generic
	relates_to: 'relates to'
};

/**
 * Get human-readable label for a relationship type.
 */
export function getRelationshipLabel(relation: string): string {
	// Handle inverse relationships
	if (relation.startsWith('inverse_')) {
		const baseRelation = relation.replace('inverse_', '');
		const label = RELATIONSHIP_LABELS[baseRelation] || baseRelation.replace(/_/g, ' ');
		return `${label} (inverse)`;
	}
	return RELATIONSHIP_LABELS[relation] || relation.replace(/_/g, ' ');
}
