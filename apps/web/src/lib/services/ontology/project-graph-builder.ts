// apps/web/src/lib/services/ontology/project-graph-builder.ts
/**
 * Project Graph Builder Service
 *
 * Transforms flat arrays of entities and edges into a structured graph with:
 * - Parent-child relationships resolved
 * - Entities indexed by ID for O(1) lookup
 * - Typed accessors for common traversals
 *
 * See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 */

import type {
	ProjectGraphData,
	ProjectGraph,
	EntityTypeMap,
	AnyEntity,
	EdgeIndex,
	EntityKind,
	TreeNode
} from '$lib/types/project-graph.types';
import type {
	OntoEdge,
	OntoTask,
	OntoPlan,
	OntoGoal,
	OntoMilestone,
	OntoDocument,
	OntoRisk,
	OntoRequirement,
	OntoMetric,
	OntoSource
} from '$lib/types/onto-api';

/**
 * Containment relationship types (parent → child direction).
 * These follow the canonical direction convention from edge-direction.ts
 */
const CONTAINMENT_RELATIONSHIPS = new Set([
	'contains',
	'has_plan',
	'has_task',
	'has_goal',
	'has_document',
	'has_risk',
	'has_milestone',
	'has_requirement',
	'has_metric',
	'has_source',
	'has_part'
]);

/**
 * Dependency relationship types.
 * Direction: dependent → dependency (A depends_on B means A needs B)
 */
const DEPENDENCY_RELATIONSHIPS = new Set(['depends_on', 'requires', 'blocks']);

/**
 * Containment relationships from project → child entity kind.
 * Used by getEntitiesForProject to map kinds to their project-level rel.
 */
const PROJECT_CONTAINMENT_RELS: Record<EntityKind, string | null> = {
	project: null, // Project cannot be a child of itself
	plan: 'has_plan',
	task: 'has_task',
	goal: 'has_goal',
	milestone: 'has_milestone',
	document: 'has_document',
	risk: 'has_risk',
	requirement: 'has_requirement',
	metric: 'has_metric',
	source: 'has_source'
};

/**
 * Build a fully-indexed project graph from flat data.
 *
 * @param data - Raw project graph data from loadProjectGraphData
 * @returns ProjectGraph with indexes and traversal methods
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
export function buildProjectGraph(data: ProjectGraphData): ProjectGraph {
	// ─────────────────────────────────────────────────────────────
	// Build entity indexes
	// ─────────────────────────────────────────────────────────────

	const entitiesById = new Map<string, AnyEntity>();
	const entitiesByKind: ProjectGraph['entitiesByKind'] = {
		project: new Map(),
		plan: new Map(),
		task: new Map(),
		goal: new Map(),
		milestone: new Map(),
		document: new Map(),
		risk: new Map(),
		requirement: new Map(),
		metric: new Map(),
		source: new Map()
	};

	// Index project
	entitiesById.set(data.project.id, data.project);
	entitiesByKind.project.set(data.project.id, data.project);

	// Helper to index entities of a specific kind
	const indexEntities = <K extends EntityKind>(entities: EntityTypeMap[K][], kind: K) => {
		for (const entity of entities) {
			entitiesById.set(entity.id, entity);
			(entitiesByKind[kind] as Map<string, EntityTypeMap[K]>).set(entity.id, entity);
		}
	};

	// Index all entity types
	indexEntities(data.plans, 'plan');
	indexEntities(data.tasks, 'task');
	indexEntities(data.goals, 'goal');
	indexEntities(data.milestones, 'milestone');
	indexEntities(data.documents, 'document');
	indexEntities(data.risks, 'risk');
	indexEntities(data.requirements, 'requirement');
	indexEntities(data.metrics, 'metric');
	indexEntities(data.sources, 'source');

	// ─────────────────────────────────────────────────────────────
	// Build edge indexes
	// ─────────────────────────────────────────────────────────────

	const outgoing = new Map<string, OntoEdge[]>();
	const incoming = new Map<string, OntoEdge[]>();
	const byRelationship: Record<string, OntoEdge[]> = {};

	for (const edge of data.edges) {
		// Index by source (outgoing)
		if (!outgoing.has(edge.src_id)) {
			outgoing.set(edge.src_id, []);
		}
		outgoing.get(edge.src_id)!.push(edge);

		// Index by destination (incoming)
		if (!incoming.has(edge.dst_id)) {
			incoming.set(edge.dst_id, []);
		}
		incoming.get(edge.dst_id)!.push(edge);

		// Index by relationship type
		if (!byRelationship[edge.rel]) {
			byRelationship[edge.rel] = [];
		}
		byRelationship[edge.rel]!.push(edge);
	}

	const edgeIndex: EdgeIndex = { outgoing, incoming, byRelationship };

	// ─────────────────────────────────────────────────────────────
	// Build the graph object with methods
	// ─────────────────────────────────────────────────────────────

	const graph: ProjectGraph = {
		project: data.project,
		entitiesById,
		entitiesByKind,
		edgeIndex,
		edges: data.edges,

		getEntity(id: string): AnyEntity | undefined {
			return entitiesById.get(id);
		},

		getEntityByKind<K extends EntityKind>(kind: K, id: string): EntityTypeMap[K] | undefined {
			return entitiesByKind[kind].get(id) as EntityTypeMap[K] | undefined;
		},

		getAllOfKind<K extends EntityKind>(kind: K): EntityTypeMap[K][] {
			return Array.from(entitiesByKind[kind].values()) as EntityTypeMap[K][];
		},

		getOutgoingEdges(entityId: string): OntoEdge[] {
			return outgoing.get(entityId) ?? [];
		},

		getIncomingEdges(entityId: string): OntoEdge[] {
			return incoming.get(entityId) ?? [];
		},

		getEdgesByRelationship(rel: string): OntoEdge[] {
			return byRelationship[rel] ?? [];
		},

		getChildren(entityId: string): AnyEntity[] {
			const edges = outgoing.get(entityId) ?? [];
			const children: AnyEntity[] = [];

			for (const edge of edges) {
				if (CONTAINMENT_RELATIONSHIPS.has(edge.rel)) {
					const child = entitiesById.get(edge.dst_id);
					if (child) children.push(child);
				}
			}

			return children;
		},

		getParent(entityId: string): AnyEntity | undefined {
			const edges = incoming.get(entityId) ?? [];

			for (const edge of edges) {
				if (CONTAINMENT_RELATIONSHIPS.has(edge.rel)) {
					return entitiesById.get(edge.src_id);
				}
			}

			return undefined;
		},

		getTasksForPlan(planId: string): OntoTask[] {
			const edges = outgoing.get(planId) ?? [];
			const tasks: OntoTask[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_task') {
					const task = entitiesByKind.task.get(edge.dst_id);
					if (task) tasks.push(task);
				}
			}

			return tasks;
		},

		getPlansForProject(): OntoPlan[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const plans: OntoPlan[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_plan') {
					const plan = entitiesByKind.plan.get(edge.dst_id);
					if (plan) plans.push(plan);
				}
			}

			return plans;
		},

		getGoalsForProject(): OntoGoal[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const goals: OntoGoal[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_goal') {
					const goal = entitiesByKind.goal.get(edge.dst_id);
					if (goal) goals.push(goal);
				}
			}

			return goals;
		},

		getDependents(entityId: string): AnyEntity[] {
			const edges = incoming.get(entityId) ?? [];
			const dependents: AnyEntity[] = [];

			for (const edge of edges) {
				if (DEPENDENCY_RELATIONSHIPS.has(edge.rel)) {
					const dependent = entitiesById.get(edge.src_id);
					if (dependent) dependents.push(dependent);
				}
			}

			return dependents;
		},

		getDependencies(entityId: string): AnyEntity[] {
			const edges = outgoing.get(entityId) ?? [];
			const dependencies: AnyEntity[] = [];

			for (const edge of edges) {
				if (DEPENDENCY_RELATIONSHIPS.has(edge.rel)) {
					const dependency = entitiesById.get(edge.dst_id);
					if (dependency) dependencies.push(dependency);
				}
			}

			return dependencies;
		},

		// ─────────────────────────────────────────────────────────────
		// Project-Level Entity Accessors
		// ─────────────────────────────────────────────────────────────

		getMilestonesForProject(): OntoMilestone[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const milestones: OntoMilestone[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_milestone') {
					const milestone = entitiesByKind.milestone.get(edge.dst_id);
					if (milestone) milestones.push(milestone);
				}
			}

			return milestones;
		},

		getDocumentsForProject(): OntoDocument[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const documents: OntoDocument[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_document') {
					const document = entitiesByKind.document.get(edge.dst_id);
					if (document) documents.push(document);
				}
			}

			return documents;
		},

		getRisksForProject(): OntoRisk[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const risks: OntoRisk[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_risk') {
					const risk = entitiesByKind.risk.get(edge.dst_id);
					if (risk) risks.push(risk);
				}
			}

			return risks;
		},

		getRequirementsForProject(): OntoRequirement[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const requirements: OntoRequirement[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_requirement') {
					const requirement = entitiesByKind.requirement.get(edge.dst_id);
					if (requirement) requirements.push(requirement);
				}
			}

			return requirements;
		},

		getMetricsForProject(): OntoMetric[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const metrics: OntoMetric[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_metric') {
					const metric = entitiesByKind.metric.get(edge.dst_id);
					if (metric) metrics.push(metric);
				}
			}

			return metrics;
		},

		getSourcesForProject(): OntoSource[] {
			const edges = outgoing.get(data.project.id) ?? [];
			const sources: OntoSource[] = [];

			for (const edge of edges) {
				if (edge.rel === 'has_source') {
					const source = entitiesByKind.source.get(edge.dst_id);
					if (source) sources.push(source);
				}
			}

			return sources;
		},

		getEntitiesForProject<K extends EntityKind>(kind: K): EntityTypeMap[K][] {
			const rel = PROJECT_CONTAINMENT_RELS[kind];
			if (!rel) {
				return [];
			}

			const edges = outgoing.get(data.project.id) ?? [];
			const results: EntityTypeMap[K][] = [];

			for (const edge of edges) {
				if (edge.rel === rel) {
					const entity = entitiesByKind[kind].get(edge.dst_id);
					if (entity) results.push(entity as EntityTypeMap[K]);
				}
			}

			return results;
		}
	};

	return graph;
}

/**
 * Build a hierarchical tree structure from the project graph.
 * Useful for tree views and nested rendering.
 *
 * @param graph - The built project graph
 * @returns TreeNode with the project as root
 *
 * @example
 * ```typescript
 * const tree = buildProjectTree(graph);
 *
 * function renderNode(node: TreeNode, depth = 0) {
 *   console.log('  '.repeat(depth) + node.entity.name);
 *   for (const child of node.children) {
 *     renderNode(child, depth + 1);
 *   }
 * }
 *
 * renderNode(tree);
 * ```
 */
export function buildProjectTree(graph: ProjectGraph): TreeNode {
	const buildNode = (entity: AnyEntity, kind: EntityKind): TreeNode => {
		const children = graph.getChildren(entity.id);
		return {
			entity,
			kind,
			children: children.map((child) => {
				const childKind = getEntityKind(child, graph);
				return buildNode(child, childKind);
			})
		};
	};

	return buildNode(graph.project, 'project');
}

/**
 * Determine the kind of an entity by checking which map contains it.
 *
 * @param entity - The entity to check
 * @param graph - The project graph
 * @returns The EntityKind of the entity
 */
function getEntityKind(entity: AnyEntity, graph: ProjectGraph): EntityKind {
	for (const [kind, map] of Object.entries(graph.entitiesByKind)) {
		if (map.has(entity.id)) {
			return kind as EntityKind;
		}
	}
	return 'project'; // Fallback
}

/**
 * Get all edges connecting two specific entities.
 *
 * @param graph - The project graph
 * @param entityA - First entity ID
 * @param entityB - Second entity ID
 * @returns Array of edges between the two entities (in either direction)
 */
export function getEdgesBetween(graph: ProjectGraph, entityA: string, entityB: string): OntoEdge[] {
	const edges: OntoEdge[] = [];

	// Check A → B
	const outgoingFromA = graph.getOutgoingEdges(entityA);
	for (const edge of outgoingFromA) {
		if (edge.dst_id === entityB) {
			edges.push(edge);
		}
	}

	// Check B → A
	const outgoingFromB = graph.getOutgoingEdges(entityB);
	for (const edge of outgoingFromB) {
		if (edge.dst_id === entityA) {
			edges.push(edge);
		}
	}

	return edges;
}

/**
 * Find all entities connected to a given entity within N hops.
 *
 * @param graph - The project graph
 * @param entityId - Starting entity ID
 * @param maxHops - Maximum number of hops (default: 1)
 * @returns Set of connected entity IDs
 */
export function findConnectedEntities(
	graph: ProjectGraph,
	entityId: string,
	maxHops: number = 1
): Set<string> {
	const visited = new Set<string>();
	const queue: Array<{ id: string; hops: number }> = [{ id: entityId, hops: 0 }];

	while (queue.length > 0) {
		const current = queue.shift()!;

		if (visited.has(current.id)) continue;
		visited.add(current.id);

		if (current.hops >= maxHops) continue;

		// Add neighbors
		const outgoing = graph.getOutgoingEdges(current.id);
		const incoming = graph.getIncomingEdges(current.id);

		for (const edge of outgoing) {
			if (!visited.has(edge.dst_id)) {
				queue.push({ id: edge.dst_id, hops: current.hops + 1 });
			}
		}

		for (const edge of incoming) {
			if (!visited.has(edge.src_id)) {
				queue.push({ id: edge.src_id, hops: current.hops + 1 });
			}
		}
	}

	// Remove the starting entity
	visited.delete(entityId);

	return visited;
}

/**
 * Get statistics about the project graph.
 *
 * @param graph - The project graph
 * @returns Object with various graph statistics
 */
export function getGraphStats(graph: ProjectGraph): {
	totalEntities: number;
	totalEdges: number;
	entitiesByKind: Record<EntityKind, number>;
	edgesByRelationship: Record<string, number>;
} {
	const entitiesByKind: Record<EntityKind, number> = {
		project: graph.entitiesByKind.project.size,
		plan: graph.entitiesByKind.plan.size,
		task: graph.entitiesByKind.task.size,
		goal: graph.entitiesByKind.goal.size,
		milestone: graph.entitiesByKind.milestone.size,
		document: graph.entitiesByKind.document.size,
		risk: graph.entitiesByKind.risk.size,
		requirement: graph.entitiesByKind.requirement.size,
		metric: graph.entitiesByKind.metric.size,
		source: graph.entitiesByKind.source.size
	};

	const edgesByRelationship: Record<string, number> = {};
	for (const [rel, edges] of Object.entries(graph.edgeIndex.byRelationship)) {
		edgesByRelationship[rel] = edges.length;
	}

	return {
		totalEntities: graph.entitiesById.size,
		totalEdges: graph.edges.length,
		entitiesByKind,
		edgesByRelationship
	};
}
