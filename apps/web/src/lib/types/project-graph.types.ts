// apps/web/src/lib/types/project-graph.types.ts
/**
 * Type definitions for the Project Graph Query Pattern
 *
 * This file defines types for efficient project-scoped graph loading and traversal.
 * The pattern uses denormalized project_id fields on all entities and edges to enable
 * simple, parallel flat queries.
 *
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */

import type {
	OntoProject,
	OntoPlan,
	OntoTask,
	OntoGoal,
	OntoMilestone,
	OntoDocument,
	OntoRisk,
	OntoRequirement,
	OntoMetric,
	OntoSource,
	OntoEdge
} from './onto-api';

// Import and re-export EntityKind from edge-direction utility for consistency
import type { EntityKind as BaseEntityKind } from '$lib/services/ontology/edge-direction';

/**
 * Entity kinds in the ontology system.
 */
export type EntityKind = BaseEntityKind;

/**
 * Raw data returned from loadProjectGraphData.
 * Contains flat arrays of all entity types and edges for a project.
 */
export interface ProjectGraphData {
	project: OntoProject;
	plans: OntoPlan[];
	tasks: OntoTask[];
	goals: OntoGoal[];
	milestones: OntoMilestone[];
	documents: OntoDocument[];
	requirements: OntoRequirement[];
	metrics: OntoMetric[];
	sources: OntoSource[];
	risks: OntoRisk[];
	edges: OntoEdge[];
}

/**
 * Union of all entity types in the ontology system.
 */
export type AnyEntity =
	| OntoProject
	| OntoPlan
	| OntoTask
	| OntoGoal
	| OntoMilestone
	| OntoDocument
	| OntoRisk
	| OntoRequirement
	| OntoMetric
	| OntoSource;

/**
 * Map from entity kind to entity type for type-safe lookups.
 */
export interface EntityTypeMap {
	project: OntoProject;
	plan: OntoPlan;
	task: OntoTask;
	goal: OntoGoal;
	milestone: OntoMilestone;
	document: OntoDocument;
	risk: OntoRisk;
	requirement: OntoRequirement;
	metric: OntoMetric;
	source: OntoSource;
	event: unknown;
}

/**
 * Edge grouped by relationship type.
 */
export interface EdgesByRelationship {
	[rel: string]: OntoEdge[];
}

/**
 * Edges indexed for fast lookup.
 * Provides O(1) access to edges by source, destination, or relationship.
 */
export interface EdgeIndex {
	/** All edges where this entity is the source */
	outgoing: Map<string, OntoEdge[]>;
	/** All edges where this entity is the destination */
	incoming: Map<string, OntoEdge[]>;
	/** Edges grouped by relationship type */
	byRelationship: EdgesByRelationship;
}

/**
 * The built project graph with indexes and traversal methods.
 * This is the main interface for working with project graph data.
 *
 * @example
 * ```typescript
 * const data = await loadProjectGraphData(supabase, projectId);
 * const graph = buildProjectGraph(data);
 *
 * // Get all tasks for a plan
 * const tasks = graph.getTasksForPlan(planId);
 *
 * // Get dependencies of a task
 * const deps = graph.getDependencies(taskId);
 *
 * // Traverse the graph
 * for (const plan of graph.getPlansForProject()) {
 *   for (const task of graph.getTasksForPlan(plan.id)) {
 *     console.log(`${plan.name} → ${task.title}`);
 *   }
 * }
 * ```
 */
export interface ProjectGraph {
	/** The root project */
	project: OntoProject;

	/** All entities indexed by ID */
	entitiesById: Map<string, AnyEntity>;

	/** Entities grouped by kind */
	entitiesByKind: {
		[K in EntityKind & keyof EntityTypeMap]: Map<string, EntityTypeMap[K]>;
	};

	/** Edge indexes for fast traversal */
	edgeIndex: EdgeIndex;

	/** All raw edges */
	edges: OntoEdge[];

	// ─────────────────────────────────────────────────────────────
	// Traversal Methods
	// ─────────────────────────────────────────────────────────────

	/** Get entity by ID (any kind) */
	getEntity(id: string): AnyEntity | undefined;

	/** Get entity by kind and ID (type-safe) */
	getEntityByKind<K extends EntityKind & keyof EntityTypeMap>(kind: K, id: string): EntityTypeMap[K] | undefined;

	/** Get all entities of a specific kind */
	getAllOfKind<K extends EntityKind & keyof EntityTypeMap>(kind: K): EntityTypeMap[K][];

	/** Get outgoing edges from an entity */
	getOutgoingEdges(entityId: string): OntoEdge[];

	/** Get incoming edges to an entity */
	getIncomingEdges(entityId: string): OntoEdge[];

	/** Get edges by relationship type */
	getEdgesByRelationship(rel: string): OntoEdge[];

	/** Get children of an entity (via containment relationships) */
	getChildren(entityId: string): AnyEntity[];

	/** Get parent of an entity (via containment relationships) */
	getParent(entityId: string): AnyEntity | undefined;

	/** Get tasks belonging to a plan */
	getTasksForPlan(planId: string): OntoTask[];

	/** Get plans belonging to the project */
	getPlansForProject(): OntoPlan[];

	/** Get goals for the project */
	getGoalsForProject(): OntoGoal[];

	/** Get entities that depend on a given entity */
	getDependents(entityId: string): AnyEntity[];

	/** Get entities that a given entity depends on */
	getDependencies(entityId: string): AnyEntity[];

	// ─────────────────────────────────────────────────────────────
	// Project-Level Entity Accessors
	// ─────────────────────────────────────────────────────────────

	/** Get milestones for the project (via has_milestone edge) */
	getMilestonesForProject(): OntoMilestone[];

	/** Get documents for the project (via has_document edge) */
	getDocumentsForProject(): OntoDocument[];

	/** Get risks for the project (via has_risk edge) */
	getRisksForProject(): OntoRisk[];

	/** Get requirements for the project (via has_requirement edge) */
	getRequirementsForProject(): OntoRequirement[];

	/** Get metrics for the project (via has_metric edge) */
	getMetricsForProject(): OntoMetric[];

	/** Get sources for the project (via has_source edge) */
	getSourcesForProject(): OntoSource[];

	/**
	 * Get all entities of a specific kind that are direct children of the project.
	 * Uses the appropriate containment relationship for each kind.
	 *
	 * @param kind - The entity kind to retrieve
	 * @returns Array of entities of that kind belonging to the project
	 *
	 * @example
	 * ```typescript
	 * const risks = graph.getEntitiesForProject('risk');
	 * const milestones = graph.getEntitiesForProject('milestone');
	 * ```
	 */
	getEntitiesForProject<K extends EntityKind & keyof EntityTypeMap>(kind: K): EntityTypeMap[K][];
}

/**
 * Tree node for hierarchical project representation.
 * Useful for tree views and nested rendering.
 */
export interface TreeNode {
	entity: AnyEntity;
	kind: EntityKind;
	children: TreeNode[];
}

/**
 * Options for loading project graph data.
 */
export interface LoadProjectGraphOptions {
	/** Include soft-deleted entities (default: false) */
	includeDeleted?: boolean;
	/** Filter to specific entity kinds */
	entityKinds?: EntityKind[];
	/** Exclude completed/done tasks from the graph payload */
	excludeCompletedTasks?: boolean;
}

/**
 * Result of loading multiple project graphs.
 */
export interface MultiProjectGraphResult {
	graphs: Map<string, ProjectGraphData>;
	errors: Map<string, Error>;
}

// Re-export EntityKind for convenience
export type { BaseEntityKind };
