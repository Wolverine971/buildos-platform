// apps/web/src/lib/components/ontology/linked-entities/linked-entities.types.ts
/**
 * Type definitions for the LinkedEntities component system.
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

/**
 * Supported entity kinds that can be linked.
 */
export type EntityKind = 'task' | 'plan' | 'goal' | 'milestone' | 'document' | 'output';

/**
 * Entity that is currently linked via an edge.
 */
export interface LinkedEntity {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_id: string;
	edge_rel: string;
	edge_direction: 'outgoing' | 'incoming';
}

/**
 * Entity available for linking (not yet linked or already linked).
 */
export interface AvailableEntity {
	id: string;
	name?: string;
	title?: string;
	state_key?: string;
	type_key?: string;
	due_at?: string;
	isLinked: boolean;
}

/**
 * Result from the linked entities API.
 */
export interface LinkedEntitiesResult {
	tasks: LinkedEntity[];
	plans: LinkedEntity[];
	goals: LinkedEntity[];
	milestones: LinkedEntity[];
	documents: LinkedEntity[];
	outputs: LinkedEntity[];
}

/**
 * Available entities for linking, grouped by type.
 */
export interface AvailableEntitiesResult {
	tasks: AvailableEntity[];
	plans: AvailableEntity[];
	goals: AvailableEntity[];
	milestones: AvailableEntity[];
	documents: AvailableEntity[];
	outputs: AvailableEntity[];
}

/**
 * Full API response for linked entities endpoint.
 */
export interface LinkedEntitiesApiResponse {
	linkedEntities: LinkedEntitiesResult;
	availableEntities: AvailableEntitiesResult;
}

/**
 * Configuration for each entity type section.
 */
export interface EntitySectionConfig {
	kind: EntityKind;
	label: string;
	labelPlural: string;
	iconColor: string;
}

/**
 * Relationship mapping for auto-determining edge relationships.
 * Key format: `${sourceKind}-${targetKind}`
 */
export const RELATIONSHIP_MAP: Record<string, string> = {
	// Task relationships
	'task-plan': 'belongs_to_plan',
	'task-goal': 'supports_goal',
	'task-task': 'depends_on',
	'task-milestone': 'targets_milestone',
	'task-document': 'references',
	'task-output': 'produces',

	// Plan relationships
	'plan-goal': 'supports_goal',
	'plan-task': 'has_task',
	'plan-milestone': 'targets_milestone',
	'plan-document': 'references',

	// Goal relationships
	'goal-task': 'requires',
	'goal-plan': 'achieved_by',
	'goal-document': 'references',

	// Document relationships
	'document-task': 'referenced_by',
	'document-plan': 'referenced_by',
	'document-goal': 'referenced_by',

	// Milestone relationships
	'milestone-task': 'contains',
	'milestone-plan': 'contains',

	// Output relationships
	'output-task': 'produced_by'
};

/**
 * Get the relationship type for linking two entity types.
 */
export function getRelationship(sourceKind: EntityKind, targetKind: EntityKind): string {
	const key = `${sourceKind}-${targetKind}`;
	return RELATIONSHIP_MAP[key] || 'relates_to';
}

/**
 * Entity section configurations with display metadata.
 */
export const ENTITY_SECTIONS: EntitySectionConfig[] = [
	{ kind: 'task', label: 'Task', labelPlural: 'Tasks', iconColor: 'text-emerald-500' },
	{ kind: 'plan', label: 'Plan', labelPlural: 'Plans', iconColor: 'text-blue-500' },
	{ kind: 'goal', label: 'Goal', labelPlural: 'Goals', iconColor: 'text-purple-500' },
	{ kind: 'milestone', label: 'Milestone', labelPlural: 'Milestones', iconColor: 'text-amber-500' },
	{ kind: 'document', label: 'Document', labelPlural: 'Documents', iconColor: 'text-cyan-500' },
	{ kind: 'output', label: 'Output', labelPlural: 'Outputs', iconColor: 'text-violet-500' }
];

/**
 * Get display name for an entity (prefers name, falls back to title).
 */
export function getEntityDisplayName(entity: LinkedEntity | AvailableEntity): string {
	return entity.name || entity.title || 'Untitled';
}

/**
 * Format relationship label for display.
 */
export function formatRelationshipLabel(rel: string): string {
	return rel.replace(/_/g, ' ');
}
