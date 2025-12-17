// apps/web/src/lib/services/ontology/project-graph-serializer.ts
/**
 * Project Graph Serialization Service
 *
 * Provides functions to serialize and deserialize ProjectGraph objects
 * for use with SvelteKit SSR, caching, and other scenarios where
 * JSON-serializable data is required.
 *
 * See: docs/specs/PROJECT_GRAPH_ENHANCEMENTS_SPEC.md
 */

import type {
	ProjectGraphData,
	ProjectGraph,
	EntityKind,
	EntityTypeMap
} from '$lib/types/project-graph.types';
import type { OntoEdge } from '$lib/types/onto-api';
import { buildProjectGraph } from './project-graph-builder';

// ============================================
// SERIALIZED TYPE DEFINITIONS
// ============================================

/**
 * Serialized entities grouped by kind.
 * Uses arrays instead of Maps for JSON compatibility.
 */
export interface SerializedEntitiesByKind {
	project: EntityTypeMap['project'][];
	plan: EntityTypeMap['plan'][];
	task: EntityTypeMap['task'][];
	goal: EntityTypeMap['goal'][];
	milestone: EntityTypeMap['milestone'][];
	output: EntityTypeMap['output'][];
	document: EntityTypeMap['document'][];
	risk: EntityTypeMap['risk'][];
	decision: EntityTypeMap['decision'][];
}

/**
 * Serialized edge index.
 * Uses Record<string, array> instead of Map for JSON compatibility.
 */
export interface SerializedEdgeIndex {
	/** Edges indexed by source entity ID */
	outgoing: Record<string, OntoEdge[]>;
	/** Edges indexed by destination entity ID */
	incoming: Record<string, OntoEdge[]>;
	/** Edges grouped by relationship type */
	byRelationship: Record<string, OntoEdge[]>;
}

/**
 * JSON-serializable version of ProjectGraph.
 * Can be passed through SvelteKit load functions and stored in caches.
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export async function load({ locals, params }) {
 *   const data = await loadProjectGraphData(locals.supabase, params.id);
 *   const graph = buildProjectGraph(data);
 *   return {
 *     graph: serializeProjectGraph(graph),
 *   };
 * }
 *
 * // In +page.svelte
 * const graph = $derived(deserializeProjectGraph(data.graph));
 * ```
 */
export interface SerializedProjectGraph {
	/** The root project */
	project: EntityTypeMap['project'];

	/** All entities grouped by kind (arrays, not Maps) */
	entitiesByKind: SerializedEntitiesByKind;

	/** Edge indexes (Records, not Maps) */
	edgeIndex: SerializedEdgeIndex;

	/** All raw edges */
	edges: OntoEdge[];

	/** Serialization metadata */
	_serialized: {
		/** Serialization format version */
		version: 1;
		/** When the graph was serialized */
		timestamp: string;
	};
}

// ============================================
// SERIALIZATION FUNCTIONS
// ============================================

/**
 * Serialize a ProjectGraph to a JSON-compatible format.
 * Use this when returning graph data from SvelteKit load functions.
 *
 * The serialized format converts all Maps to arrays/records and includes
 * metadata for versioning and debugging.
 *
 * @param graph - The ProjectGraph to serialize
 * @returns SerializedProjectGraph that can be JSON.stringify'd
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export async function load({ locals, params }) {
 *   const data = await loadProjectGraphData(locals.supabase, params.id);
 *   const graph = buildProjectGraph(data);
 *
 *   // Pre-compute some values on server if needed
 *   const planCount = graph.getPlansForProject().length;
 *
 *   return {
 *     graph: serializeProjectGraph(graph),
 *     planCount,
 *   };
 * }
 * ```
 */
export function serializeProjectGraph(graph: ProjectGraph): SerializedProjectGraph {
	// Convert entity Maps to arrays
	const entitiesByKind: SerializedEntitiesByKind = {
		project: Array.from(graph.entitiesByKind.project.values()),
		plan: Array.from(graph.entitiesByKind.plan.values()),
		task: Array.from(graph.entitiesByKind.task.values()),
		goal: Array.from(graph.entitiesByKind.goal.values()),
		milestone: Array.from(graph.entitiesByKind.milestone.values()),
		output: Array.from(graph.entitiesByKind.output.values()),
		document: Array.from(graph.entitiesByKind.document.values()),
		risk: Array.from(graph.entitiesByKind.risk.values()),
		decision: Array.from(graph.entitiesByKind.decision.values())
	};

	// Convert edge index Maps to Records
	const edgeIndex: SerializedEdgeIndex = {
		outgoing: Object.fromEntries(graph.edgeIndex.outgoing),
		incoming: Object.fromEntries(graph.edgeIndex.incoming),
		byRelationship: { ...graph.edgeIndex.byRelationship }
	};

	return {
		project: graph.project,
		entitiesByKind,
		edgeIndex,
		edges: graph.edges,
		_serialized: {
			version: 1,
			timestamp: new Date().toISOString()
		}
	};
}

/**
 * Deserialize a SerializedProjectGraph back to a full ProjectGraph.
 * Reconstructs Maps and adds all traversal methods.
 *
 * This function rebuilds the graph from the serialized data, which means
 * all traversal methods will work correctly on the restored graph.
 *
 * @param serialized - The serialized graph from load function or cache
 * @returns Full ProjectGraph with all methods
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { deserializeProjectGraph } from '$lib/services/ontology/project-graph';
 *
 *   let { data } = $props();
 *
 *   // Restore full graph with all methods
 *   const graph = $derived(deserializeProjectGraph(data.graph));
 *
 *   // Now you can use all graph methods
 *   const plans = $derived(graph.getPlansForProject());
 *   const risks = $derived(graph.getRisksForProject());
 * </script>
 * ```
 */
export function deserializeProjectGraph(serialized: SerializedProjectGraph): ProjectGraph {
	// Reconstruct ProjectGraphData from serialized format
	const data: ProjectGraphData = {
		project: serialized.project,
		plans: serialized.entitiesByKind.plan,
		tasks: serialized.entitiesByKind.task,
		goals: serialized.entitiesByKind.goal,
		milestones: serialized.entitiesByKind.milestone,
		outputs: serialized.entitiesByKind.output,
		documents: serialized.entitiesByKind.document,
		risks: serialized.entitiesByKind.risk,
		decisions: serialized.entitiesByKind.decision,
		edges: serialized.edges
	};

	// Use buildProjectGraph to reconstruct with all methods
	return buildProjectGraph(data);
}

/**
 * Check if an object is a SerializedProjectGraph.
 * Useful for type guards and runtime validation.
 *
 * @param obj - Object to check
 * @returns True if the object is a valid SerializedProjectGraph
 */
export function isSerializedProjectGraph(obj: unknown): obj is SerializedProjectGraph {
	if (!obj || typeof obj !== 'object') return false;

	const candidate = obj as Partial<SerializedProjectGraph>;

	return (
		candidate._serialized !== undefined &&
		candidate._serialized.version === 1 &&
		candidate.project !== undefined &&
		candidate.entitiesByKind !== undefined &&
		candidate.edges !== undefined
	);
}

/**
 * Convert ProjectGraphData directly to SerializedProjectGraph format.
 * This is more efficient when you don't need graph methods on the server.
 *
 * Note: This creates a serialized format without building the full graph first.
 * The edge indexes are built from the raw edges.
 *
 * @param data - Raw project graph data
 * @returns SerializedProjectGraph that can be JSON.stringify'd
 *
 * @example
 * ```typescript
 * // Efficient server-side pattern - skip building graph
 * export async function load({ locals, params }) {
 *   const data = await loadProjectGraphData(locals.supabase, params.id);
 *   return {
 *     graph: serializeProjectGraphData(data),
 *   };
 * }
 * ```
 */
export function serializeProjectGraphData(data: ProjectGraphData): SerializedProjectGraph {
	// Build edge indexes from raw data
	const outgoing: Record<string, OntoEdge[]> = {};
	const incoming: Record<string, OntoEdge[]> = {};
	const byRelationship: Record<string, OntoEdge[]> = {};

	for (const edge of data.edges) {
		// Index by source
		if (!outgoing[edge.src_id]) {
			outgoing[edge.src_id] = [];
		}
		outgoing[edge.src_id]!.push(edge);

		// Index by destination
		if (!incoming[edge.dst_id]) {
			incoming[edge.dst_id] = [];
		}
		incoming[edge.dst_id]!.push(edge);

		// Index by relationship
		if (!byRelationship[edge.rel]) {
			byRelationship[edge.rel] = [];
		}
		byRelationship[edge.rel]!.push(edge);
	}

	return {
		project: data.project,
		entitiesByKind: {
			project: [data.project],
			plan: data.plans,
			task: data.tasks,
			goal: data.goals,
			milestone: data.milestones,
			output: data.outputs,
			document: data.documents,
			risk: data.risks,
			decision: data.decisions
		},
		edgeIndex: {
			outgoing,
			incoming,
			byRelationship
		},
		edges: data.edges,
		_serialized: {
			version: 1,
			timestamp: new Date().toISOString()
		}
	};
}
