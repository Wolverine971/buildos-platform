// apps/web/src/lib/components/ontology/linked-entities/linked-entities.types.ts
/**
 * Type definitions for the LinkedEntities component system.
 *
 * Documentation: /apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md
 */

/**
 * Supported entity kinds that can be linked.
 * Note: project is not included as we always operate within a project context.
 */
export type EntityKind =
	| 'task'
	| 'plan'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'risk'
	| 'event'
	| 'requirement';

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
	risks: LinkedEntity[];
	events: LinkedEntity[];
	requirements: LinkedEntity[];
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
	risks: AvailableEntity[];
	events: AvailableEntity[];
	requirements: AvailableEntity[];
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
 * Defines which entity types each source entity can link to.
 * This constrains the UI to only show valid linking options.
 *
 * Rules:
 * - Task: Can link to plans (containment), goals (supports), other tasks (depends),
 *         milestones (targets), documents (references), risks (mitigates), events (has)
 * - Plan: Can link to tasks (contains), goals (supports), milestones (targets),
 *         documents (references), risks (addresses)
 * - Goal: Can link to milestones (contains), documents (references), tasks (supported by),
 *         plans (supported by), risks (threatened by), requirements (contains)
 * - Milestone: Can link to plans (contains), tasks (targeted by), goals (parent),
 *              documents (references), risks (contains), requirements (contains)
 * - Document: Can link to any entity via references
 * - Risk: Can link to tasks (threatens), plans (addressed in), goals (threatens),
 *         milestones (threatens), documents (documented in)
 * - Event: Can ONLY link to tasks
 * - Requirement: Can ONLY link to goals or milestones
 */
export const ALLOWED_LINKS: Record<EntityKind, EntityKind[]> = {
	task: ['plan', 'goal', 'task', 'milestone', 'document', 'risk', 'event'],
	plan: ['task', 'goal', 'milestone', 'document', 'risk'],
	goal: ['milestone', 'document', 'task', 'plan', 'risk', 'requirement'],
	milestone: ['plan', 'task', 'goal', 'document', 'risk', 'requirement'],
	document: ['task', 'plan', 'goal', 'milestone', 'document', 'risk'],
	risk: ['task', 'plan', 'goal', 'milestone', 'document'],
	event: ['task'],
	requirement: ['goal', 'milestone']
};

/**
 * Check if a source entity kind can link to a target entity kind.
 */
export function canLink(sourceKind: EntityKind, targetKind: EntityKind): boolean {
	return ALLOWED_LINKS[sourceKind]?.includes(targetKind) ?? false;
}

/**
 * Relationship mapping for auto-determining edge relationships.
 * Key format: `${sourceKind}-${targetKind}`
 *
 * The relationship returned is the canonical relationship type.
 * The edge creation API will normalize the direction based on srcKinds rules.
 *
 * Canonical direction rules (from edge-direction.ts):
 * - Container → Contained (plan has_task task)
 * - Parent → Child (goal has_milestone milestone)
 * - Supporter → Supported (task supports_goal goal)
 * - Threat → Target (risk threatens task)
 * - Reference → Referenced (document references task)
 */
export const RELATIONSHIP_MAP: Record<string, string> = {
	// Task relationships
	'task-plan': 'has_task', // Plan contains task (will be normalized: plan→task)
	'task-goal': 'supports_goal', // Task supports goal (task→goal)
	'task-task': 'depends_on', // Task depends on task
	'task-milestone': 'targets_milestone', // Task targets milestone
	'task-document': 'references', // Task references document
	'task-risk': 'mitigates', // Task mitigates risk
	'task-event': 'has_event', // Task has event (task→event)

	// Plan relationships
	'plan-task': 'has_task', // Plan contains task (plan→task)
	'plan-goal': 'supports_goal', // Plan supports goal (plan→goal)
	'plan-milestone': 'targets_milestone', // Plan targets milestone
	'plan-document': 'references', // Plan references document
	'plan-risk': 'addresses', // Plan addresses risk

	// Goal relationships
	'goal-milestone': 'has_milestone', // Goal contains milestone (goal→milestone)
	'goal-document': 'references', // Goal references document
	'goal-task': 'supports_goal', // Tasks that support this goal (inverted query)
	'goal-plan': 'supports_goal', // Plans that support this goal (inverted query)
	'goal-risk': 'threatens', // Risks that threaten this goal (inverted query)
	'goal-requirement': 'has_requirement', // Goal contains requirement

	// Milestone relationships
	'milestone-plan': 'has_plan', // Milestone contains plan (milestone→plan)
	'milestone-task': 'targets_milestone', // Tasks that target this milestone (inverted)
	'milestone-goal': 'has_milestone', // Parent goal (inverted query)
	'milestone-document': 'references', // Milestone references document
	'milestone-risk': 'has_risk', // Milestone contains risk
	'milestone-requirement': 'has_requirement', // Milestone contains requirement

	// Document relationships
	'document-task': 'references', // Document references task
	'document-plan': 'references', // Document references plan
	'document-goal': 'references', // Document references goal
	'document-milestone': 'references', // Document references milestone
	'document-document': 'references', // Document references document
	'document-risk': 'references', // Document references risk

	// Risk relationships
	'risk-task': 'threatens', // Risk threatens task
	'risk-plan': 'addressed_in', // Risk addressed in plan
	'risk-goal': 'threatens', // Risk threatens goal
	'risk-milestone': 'threatens', // Risk threatens milestone
	'risk-document': 'documented_in', // Risk documented in document

	// Event relationships (events can ONLY link to tasks)
	'event-task': 'has_event', // Event belongs to task (inverted query)

	// Requirement relationships (requirements can ONLY link to goals/milestones)
	'requirement-goal': 'has_requirement', // Requirement of goal (inverted query)
	'requirement-milestone': 'has_requirement' // Requirement of milestone (inverted query)
};

/**
 * Get the relationship type for linking two entity types.
 */
export function getRelationship(sourceKind: EntityKind, targetKind: EntityKind): string {
	const key = `${sourceKind}-${targetKind}`;
	return RELATIONSHIP_MAP[key] || 'relates_to';
}

/**
 * Get the list of entity kinds that a source entity can link to.
 */
export function getAllowedTargetKinds(sourceKind: EntityKind): EntityKind[] {
	return ALLOWED_LINKS[sourceKind] || [];
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
	{ kind: 'risk', label: 'Risk', labelPlural: 'Risks', iconColor: 'text-red-500' },
	{ kind: 'event', label: 'Event', labelPlural: 'Events', iconColor: 'text-orange-500' },
	{
		kind: 'requirement',
		label: 'Requirement',
		labelPlural: 'Requirements',
		iconColor: 'text-indigo-500'
	}
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

/**
 * Get entity sections filtered by what a source entity can link to.
 */
export function getFilteredSections(sourceKind: EntityKind): EntitySectionConfig[] {
	const allowedKinds = ALLOWED_LINKS[sourceKind] || [];
	return ENTITY_SECTIONS.filter((section) => allowedKinds.includes(section.kind));
}
