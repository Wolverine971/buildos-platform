// apps/web/src/lib/components/ontology/linked-entities/linked-entities.types.ts
/**
 * Type definitions for the LinkedEntities component system.
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

/**
 * Supported entity kinds that can be linked.
 */
export type EntityKind =
	| 'task'
	| 'plan'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'output'
	| 'risk'
	| 'decision'
	| 'event';

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
	risks: LinkedEntity[];
	decisions: LinkedEntity[];
	events: LinkedEntity[];
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
	risks: AvailableEntity[];
	decisions: AvailableEntity[];
	events: AvailableEntity[];
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
	'task-plan': 'has_task',
	'task-goal': 'has_task',
	'task-task': 'depends_on',
	'task-milestone': 'targets_milestone',
	'task-document': 'references',
	'task-output': 'produces',
	'task-decision': 'references',

	// Plan relationships
	'plan-goal': 'has_plan',
	'plan-task': 'has_task',
	'plan-milestone': 'has_plan',
	'plan-document': 'references',
	'plan-decision': 'references',

	// Goal relationships
	'goal-task': 'has_task',
	'goal-plan': 'has_plan',
	'goal-milestone': 'has_milestone',
	'goal-document': 'references',

	// Document relationships
	'document-task': 'references',
	'document-plan': 'references',
	'document-goal': 'references',
	'document-document': 'references',
	'document-decision': 'references',
	'document-risk': 'references',

	// Milestone relationships
	'milestone-task': 'targets_milestone',
	'milestone-plan': 'has_plan',
	'milestone-goal': 'has_milestone',

	// Output relationships
	'output-task': 'produces',

	// Decision relationships
	'decision-task': 'references',
	'decision-plan': 'references',
	'decision-document': 'references',

	// Risk relationships
	'risk-task': 'threatens',
	'risk-plan': 'addressed_in',
	'risk-goal': 'threatens',
	'risk-document': 'documented_in',

	// Reverse risk relationships (from other entities to risks)
	'task-risk': 'mitigates',
	'plan-risk': 'addresses',
	'goal-risk': 'threatens',

	// Event relationships
	'event-task': 'scheduled_for',
	'event-plan': 'part_of_plan',
	'event-goal': 'supports_goal',
	'event-milestone': 'targets_milestone',
	'event-document': 'references',
	'event-output': 'relates_to',
	'event-decision': 'references',

	// Reverse event relationships (from other entities to events)
	'task-event': 'has_event',
	'plan-event': 'has_event',
	'goal-event': 'has_event',
	'milestone-event': 'has_event',
	'document-event': 'referenced_by',
	'output-event': 'has_event',
	'decision-event': 'discussed_in'
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
	{ kind: 'output', label: 'Output', labelPlural: 'Outputs', iconColor: 'text-violet-500' },
	{ kind: 'risk', label: 'Risk', labelPlural: 'Risks', iconColor: 'text-red-500' },
	{ kind: 'decision', label: 'Decision', labelPlural: 'Decisions', iconColor: 'text-indigo-500' },
	{ kind: 'event', label: 'Event', labelPlural: 'Events', iconColor: 'text-orange-500' }
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
