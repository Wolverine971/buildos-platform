<!-- docs/specs/PROJECT_GRAPH_ENHANCEMENTS_SPEC.md -->

# Project Graph Enhancements Specification

## Overview

This specification defines enhancements to the Project Graph Query Pattern implementation, adding convenience methods, improved exports, and SSR-compatible serialization.

## Status

| Attribute      | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Status**     | ✅ **IMPLEMENTED**                                                           |
| **Created**    | 2025-12-17                                                                   |
| **Completed**  | 2025-12-17                                                                   |
| **Author**     | AI-assisted                                                                  |
| **Depends On** | [PROJECT_GRAPH_QUERY_PATTERN_SPEC.md](./PROJECT_GRAPH_QUERY_PATTERN_SPEC.md) |

---

## Problem Statement

The current `ProjectGraph` implementation is functional but has several gaps:

1. **Import Ergonomics** - No barrel export; consumers must import from specific files
2. **Incomplete Traversal Methods** - Missing project-level accessors for milestones, documents, risks, decisions
3. **SSR Incompatibility** - `ProjectGraph` contains methods (functions) and cannot be serialized for server-side rendering

---

## Enhancement 1: Barrel Export (Index File)

### Current State

```typescript
// Consumer must know exact file paths
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import { buildProjectGraph } from '$lib/services/ontology/project-graph-builder';
import type { ProjectGraph } from '$lib/types/project-graph.types';
```

### Desired State

```typescript
// Single import point for all project-graph utilities
import {
	loadProjectGraphData,
	loadMultipleProjectGraphs,
	loadUserProjectSummaries,
	buildProjectGraph,
	buildProjectTree,
	getEdgesBetween,
	findConnectedEntities,
	getGraphStats,
	serializeProjectGraph,
	deserializeProjectGraph,
	type ProjectGraph,
	type ProjectGraphData,
	type SerializedProjectGraph,
	type TreeNode
} from '$lib/services/ontology/project-graph';
```

### Implementation

**File:** `apps/web/src/lib/services/ontology/project-graph/index.ts`

```typescript
// Re-export loader functions
export {
	loadProjectGraphData,
	loadMultipleProjectGraphs,
	loadUserProjectSummaries
} from './project-graph-loader';

// Re-export builder functions
export {
	buildProjectGraph,
	buildProjectTree,
	getEdgesBetween,
	findConnectedEntities,
	getGraphStats
} from './project-graph-builder';

// Re-export serialization functions (new)
export { serializeProjectGraph, deserializeProjectGraph } from './project-graph-serializer';

// Re-export types
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

// Re-export serialization types (new)
export type { SerializedProjectGraph, SerializedEntitiesByKind } from './project-graph-serializer';
```

### File Structure Change

```
apps/web/src/lib/services/ontology/
├── project-graph/                    # NEW: directory
│   ├── index.ts                      # NEW: barrel export
│   ├── project-graph-loader.ts       # MOVED from parent
│   ├── project-graph-loader.test.ts  # MOVED from parent
│   ├── project-graph-builder.ts      # MOVED from parent
│   ├── project-graph-builder.test.ts # MOVED from parent
│   └── project-graph-serializer.ts   # NEW: serialization
└── ... (other ontology services)
```

**Alternative (simpler):** Keep files in place, add `project-graph.ts` as barrel:

```
apps/web/src/lib/services/ontology/
├── project-graph.ts                  # NEW: barrel export (not a directory)
├── project-graph-loader.ts           # unchanged
├── project-graph-loader.test.ts      # unchanged
├── project-graph-builder.ts          # unchanged
├── project-graph-builder.test.ts     # unchanged
├── project-graph-serializer.ts       # NEW: serialization
└── ...
```

**Decision:** Use the simpler approach (single barrel file) to minimize file moves.

---

## Enhancement 2: Additional Project-Level Traversal Methods

### Current Methods

```typescript
interface ProjectGraph {
	getPlansForProject(): OntoPlan[];
	getGoalsForProject(): OntoGoal[];
	// Missing: milestones, documents, risks, decisions, outputs
}
```

### New Methods

```typescript
interface ProjectGraph {
	// Existing
	getPlansForProject(): OntoPlan[];
	getGoalsForProject(): OntoGoal[];

	// NEW
	getMilestonesForProject(): OntoMilestone[];
	getDocumentsForProject(): OntoDocument[];
	getRisksForProject(): OntoRisk[];
	getDecisionsForProject(): OntoDecision[];
	getOutputsForProject(): OntoOutput[];
}
```

### Relationship Types

| Method                      | Relationship          | Direction           |
| --------------------------- | --------------------- | ------------------- |
| `getPlansForProject()`      | `has_plan`            | project → plan      |
| `getGoalsForProject()`      | `has_goal`            | project → goal      |
| `getMilestonesForProject()` | `has_milestone`       | project → milestone |
| `getDocumentsForProject()`  | `has_document`        | project → document  |
| `getRisksForProject()`      | `has_risk`            | project → risk      |
| `getDecisionsForProject()`  | (via edges or direct) | project → decision  |
| `getOutputsForProject()`    | `has_output`          | project → output    |

### Implementation

Add to `project-graph-builder.ts`:

```typescript
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

getDecisionsForProject(): OntoDecision[] {
  // Decisions may not have a specific edge type, return all decisions
  // since they're already scoped to project via project_id
  return Array.from(entitiesByKind.decision.values());
},

getOutputsForProject(): OntoOutput[] {
  const edges = outgoing.get(data.project.id) ?? [];
  const outputs: OntoOutput[] = [];

  for (const edge of edges) {
    if (edge.rel === 'has_output') {
      const output = entitiesByKind.output.get(edge.dst_id);
      if (output) outputs.push(output);
    }
  }

  return outputs;
},
```

### Type Updates

Update `ProjectGraph` interface in `project-graph.types.ts`:

```typescript
export interface ProjectGraph {
	// ... existing properties and methods ...

	/** Get milestones for the project */
	getMilestonesForProject(): OntoMilestone[];

	/** Get documents for the project */
	getDocumentsForProject(): OntoDocument[];

	/** Get risks for the project */
	getRisksForProject(): OntoRisk[];

	/** Get decisions for the project */
	getDecisionsForProject(): OntoDecision[];

	/** Get outputs directly under the project */
	getOutputsForProject(): OntoOutput[];
}
```

---

## Enhancement 3: Generic `getEntitiesForProject()` Method

Instead of (or in addition to) individual methods, provide a generic accessor:

```typescript
interface ProjectGraph {
	/**
	 * Get all entities of a specific kind that are direct children of the project.
	 * Uses the appropriate containment relationship for each kind.
	 */
	getEntitiesForProject<K extends EntityKind>(kind: K): EntityTypeMap[K][];
}
```

### Implementation

```typescript
const PROJECT_CONTAINMENT_RELS: Record<EntityKind, string | null> = {
  project: null, // Project can't be child of project
  plan: 'has_plan',
  task: null, // Tasks belong to plans, not directly to project
  goal: 'has_goal',
  milestone: 'has_milestone',
  document: 'has_document',
  risk: 'has_risk',
  decision: null, // No specific edge, return all
  output: 'has_output',
};

getEntitiesForProject<K extends EntityKind>(kind: K): EntityTypeMap[K][] {
  const rel = PROJECT_CONTAINMENT_RELS[kind];

  // Special case: decisions don't have edges, return all
  if (kind === 'decision') {
    return Array.from(entitiesByKind.decision.values()) as EntityTypeMap[K][];
  }

  // Special case: tasks don't belong directly to project
  if (kind === 'task' || kind === 'project' || !rel) {
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
},
```

---

## Enhancement 4: SSR-Compatible Serialization

### Problem

`ProjectGraph` contains methods (functions) which cannot be JSON-serialized for:

- SvelteKit's `load` function return values
- Server-side rendering data passing
- Caching in localStorage/sessionStorage

### Solution

Provide serialization functions that convert to/from a plain object format.

### Type Definitions

```typescript
// File: apps/web/src/lib/services/ontology/project-graph-serializer.ts

import type {
	ProjectGraphData,
	ProjectGraph,
	EntityKind,
	EntityTypeMap,
	AnyEntity
} from '$lib/types/project-graph.types';
import type { OntoEdge } from '$lib/types/onto-api';

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
	outgoing: Record<string, OntoEdge[]>;
	incoming: Record<string, OntoEdge[]>;
	byRelationship: Record<string, OntoEdge[]>;
}

/**
 * JSON-serializable version of ProjectGraph.
 * Can be passed through SvelteKit load functions and stored in caches.
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
		version: 1;
		timestamp: string;
	};
}
```

### Serialization Function

````typescript
/**
 * Serialize a ProjectGraph to a JSON-compatible format.
 * Use this when returning graph data from SvelteKit load functions.
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
 *   return {
 *     graph: serializeProjectGraph(graph),
 *   };
 * }
 * ```
 */
export function serializeProjectGraph(graph: ProjectGraph): SerializedProjectGraph {
	// Convert Maps to plain objects/arrays
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
````

### Deserialization Function

````typescript
/**
 * Deserialize a SerializedProjectGraph back to a full ProjectGraph.
 * Reconstructs Maps and adds traversal methods.
 *
 * @param serialized - The serialized graph from load function
 * @returns Full ProjectGraph with all methods
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { deserializeProjectGraph } from '$lib/services/ontology/project-graph';
 *
 *   let { data } = $props();
 *   const graph = $derived(deserializeProjectGraph(data.graph));
 *   const plans = $derived(graph.getPlansForProject());
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
````

### Alternative: Direct Serialization from Data

For simpler use cases, you might skip building the graph on the server:

````typescript
/**
 * Serialize ProjectGraphData directly (without building graph first).
 * More efficient when you don't need graph methods on the server.
 *
 * @example
 * ```typescript
 * // In +page.server.ts
 * export async function load({ locals, params }) {
 *   const data = await loadProjectGraphData(locals.supabase, params.id);
 *   return { graphData: data }; // Already serializable!
 * }
 *
 * // In +page.svelte
 * const graph = $derived(buildProjectGraph(data.graphData));
 * ```
 */
// Note: ProjectGraphData is already serializable (no Maps/functions)
// This pattern is actually simpler and recommended for most SSR cases
````

---

## Implementation Plan

### Phase 1: Add New Traversal Methods

1. Update `ProjectGraph` interface in `project-graph.types.ts`
2. Implement methods in `project-graph-builder.ts`
3. Add tests in `project-graph-builder.test.ts`

### Phase 2: Create Serializer

1. Create `project-graph-serializer.ts`
2. Implement `serializeProjectGraph` and `deserializeProjectGraph`
3. Add tests in `project-graph-serializer.test.ts`

### Phase 3: Create Barrel Export

1. Create `project-graph.ts` barrel file
2. Update existing imports in codebase (optional, for consistency)

---

## Testing Requirements

### New Traversal Methods Tests

```typescript
describe('project-level traversal methods', () => {
	it('getMilestonesForProject returns milestones linked via has_milestone', () => {
		// ...
	});

	it('getDocumentsForProject returns documents linked via has_document', () => {
		// ...
	});

	it('getRisksForProject returns risks linked via has_risk', () => {
		// ...
	});

	it('getDecisionsForProject returns all decisions for the project', () => {
		// ...
	});

	it('getOutputsForProject returns outputs linked via has_output', () => {
		// ...
	});

	it('getEntitiesForProject generic method works for all kinds', () => {
		// ...
	});
});
```

### Serialization Tests

```typescript
describe('serializeProjectGraph', () => {
	it('converts Maps to arrays/records', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(Array.isArray(serialized.entitiesByKind.task)).toBe(true);
		expect(typeof serialized.edgeIndex.outgoing).toBe('object');
		expect(serialized.edgeIndex.outgoing instanceof Map).toBe(false);
	});

	it('produces JSON-serializable output', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(() => JSON.stringify(serialized)).not.toThrow();
	});

	it('includes metadata', () => {
		const graph = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(graph);

		expect(serialized._serialized.version).toBe(1);
		expect(serialized._serialized.timestamp).toBeDefined();
	});
});

describe('deserializeProjectGraph', () => {
	it('reconstructs a working ProjectGraph', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		expect(restored.getEntity('task-1')).toEqual(original.getEntity('task-1'));
		expect(restored.getTasksForPlan('plan-1')).toEqual(original.getTasksForPlan('plan-1'));
	});

	it('roundtrip preserves all data', () => {
		const original = buildProjectGraph(mockData);
		const serialized = serializeProjectGraph(original);
		const restored = deserializeProjectGraph(serialized);

		expect(restored.entitiesById.size).toBe(original.entitiesById.size);
		expect(restored.edges.length).toBe(original.edges.length);
	});
});
```

---

## Implementation Locations

| Component        | File Path                                                             | Status  |
| ---------------- | --------------------------------------------------------------------- | ------- |
| Type Updates     | `apps/web/src/lib/types/project-graph.types.ts`                       | ✅ DONE |
| New Methods      | `apps/web/src/lib/services/ontology/project-graph-builder.ts`         | ✅ DONE |
| New Method Tests | `apps/web/src/lib/services/ontology/project-graph-builder.test.ts`    | ✅ DONE |
| Serializer       | `apps/web/src/lib/services/ontology/project-graph-serializer.ts`      | ✅ DONE |
| Serializer Tests | `apps/web/src/lib/services/ontology/project-graph-serializer.test.ts` | ✅ DONE |
| Barrel Export    | `apps/web/src/lib/services/ontology/project-graph.ts`                 | ✅ DONE |

---

## Usage Examples

### SSR with SvelteKit

```typescript
// +page.server.ts
import { loadProjectGraphData } from '$lib/services/ontology/project-graph';

export async function load({ locals, params }) {
	const graphData = await loadProjectGraphData(locals.supabase, params.id);
	return { graphData }; // ProjectGraphData is already serializable
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
	import { buildProjectGraph } from '$lib/services/ontology/project-graph';

	let { data } = $props();

	// Build graph on client from serializable data
	const graph = $derived(buildProjectGraph(data.graphData));

	// Use new traversal methods
	const milestones = $derived(graph.getMilestonesForProject());
	const risks = $derived(graph.getRisksForProject());
</script>

{#each milestones as milestone}
	<MilestoneCard {milestone} />
{/each}
```

### Full Serialization (when you need graph methods on server)

```typescript
// +page.server.ts
import {
	loadProjectGraphData,
	buildProjectGraph,
	serializeProjectGraph
} from '$lib/services/ontology/project-graph';

export async function load({ locals, params }) {
	const data = await loadProjectGraphData(locals.supabase, params.id);
	const graph = buildProjectGraph(data);

	// Pre-compute some values on server
	const planCount = graph.getPlansForProject().length;

	return {
		graph: serializeProjectGraph(graph),
		planCount
	};
}
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
	import { deserializeProjectGraph } from '$lib/services/ontology/project-graph';

	let { data } = $props();

	// Restore full graph with methods
	const graph = $derived(deserializeProjectGraph(data.graph));
</script>
```
