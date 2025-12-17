// apps/web/src/lib/services/ontology/project-graph.ts
/**
 * Project Graph - Barrel Export
 *
 * This module provides a single import point for all project graph utilities,
 * including loading, building, traversal, and serialization functions.
 *
 * @example
 * ```typescript
 * import {
 *   // Loading
 *   loadProjectGraphData,
 *   loadMultipleProjectGraphs,
 *   loadUserProjectSummaries,
 *
 *   // Building
 *   buildProjectGraph,
 *   buildProjectTree,
 *
 *   // Traversal utilities
 *   getEdgesBetween,
 *   findConnectedEntities,
 *   getGraphStats,
 *
 *   // Serialization (for SSR)
 *   serializeProjectGraph,
 *   deserializeProjectGraph,
 *   serializeProjectGraphData,
 *   isSerializedProjectGraph,
 *
 *   // Types
 *   type ProjectGraph,
 *   type ProjectGraphData,
 *   type SerializedProjectGraph,
 * } from '$lib/services/ontology/project-graph';
 * ```
 *
 * See:
 * - docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md
 * - docs/specs/PROJECT_GRAPH_ENHANCEMENTS_SPEC.md
 */

// ============================================
// LOADER FUNCTIONS
// ============================================

export {
	loadProjectGraphData,
	loadMultipleProjectGraphs,
	loadUserProjectSummaries
} from './project-graph-loader';

// ============================================
// BUILDER FUNCTIONS
// ============================================

export {
	buildProjectGraph,
	buildProjectTree,
	getEdgesBetween,
	findConnectedEntities,
	getGraphStats
} from './project-graph-builder';

// ============================================
// SERIALIZATION FUNCTIONS
// ============================================

export {
	serializeProjectGraph,
	deserializeProjectGraph,
	serializeProjectGraphData,
	isSerializedProjectGraph,
	type SerializedProjectGraph,
	type SerializedEntitiesByKind,
	type SerializedEdgeIndex
} from './project-graph-serializer';

// ============================================
// TYPE EXPORTS
// ============================================

export type {
	ProjectGraph,
	ProjectGraphData,
	AnyEntity,
	EntityKind,
	EntityTypeMap,
	EdgeIndex,
	EdgesByRelationship,
	TreeNode,
	LoadProjectGraphOptions,
	MultiProjectGraphResult
} from '$lib/types/project-graph.types';
