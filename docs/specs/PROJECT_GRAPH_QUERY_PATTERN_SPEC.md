<!-- docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md -->

# Project Graph Query Pattern Specification

## Overview

This specification defines a standardized pattern for efficiently loading all ontology data belonging to a project and reconstructing the graph structure on the frontend. The pattern uses denormalized `project_id` fields on all entities and edges to enable simple, parallel flat queries.

## Status

| Attribute         | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| **Status**        | ✅ **IMPLEMENTED**                                                 |
| **Created**       | 2025-12-16                                                         |
| **Completed**     | 2025-12-16                                                         |
| **Author**        | AI-assisted                                                        |
| **Related Files** | See [Implementation Locations](#implementation-locations)          |
| **Dependencies**  | [Edge Direction Utility](#integration-with-edge-direction-utility) |

---

## Problem Statement

### Current State

The ontology system uses a graph-based data model with:

- **Entities**: Projects, plans, tasks, goals, milestones, outputs, documents, risks, etc.
- **Edges**: Directional relationships between entities (e.g., `has_task`, `depends_on`)

**Current Query Pattern** (inefficient):

```typescript
// 1. Fetch all entities for user's projects
const projects = await supabase.from('onto_projects').select('*').eq('user_id', userId);
const tasks = await supabase.from('onto_tasks').select('*').in('project_id', projectIds);
// ... repeat for each entity type

// 2. Fetch edges by batching entity IDs (expensive!)
const nodeIds = new Set([...projectIds, ...taskIds, ...planIds, ...]);
for (const batch of batchArray(nodeIds, 100)) {
  const [edgesFromSrc, edgesFromDst] = await Promise.all([
    supabase.from('onto_edges').select('*').in('src_id', batch),
    supabase.from('onto_edges').select('*').in('dst_id', batch),
  ]);
  // Deduplicate...
}
```

**Problems:**

1. Edge queries require knowing all entity IDs first (sequential dependency)
2. Batching by entity IDs is complex and slow
3. Must query both `src_id` and `dst_id` and deduplicate
4. No simple "get everything for project X" query for edges

### Desired State

A simple, parallel query pattern:

```typescript
const [project, plans, tasks, goals, milestones, edges] = await Promise.all([
	supabase.from('onto_projects').select('*').eq('id', projectId).single(),
	supabase.from('onto_plans').select('*').eq('project_id', projectId),
	supabase.from('onto_tasks').select('*').eq('project_id', projectId),
	supabase.from('onto_goals').select('*').eq('project_id', projectId),
	supabase.from('onto_milestones').select('*').eq('project_id', projectId),
	supabase.from('onto_edges').select('*').eq('project_id', projectId) // NEW!
]);

// Reconstruct graph on frontend
const graph = buildProjectGraph({ project, plans, tasks, goals, milestones, edges });
```

---

## Design Decisions

### Decision 1: Add `project_id` to Edges

**Rationale:**

- Enables single-column index lookup for all edges in a project
- Eliminates need for bidirectional queries on `src_id`/`dst_id`
- Matches existing pattern on all entity tables

**Constraint:**

- `project_id` on edges is **immutable** (set once at creation, never changes)
- Both source and destination entities must belong to the same project
- Cross-project edges are not supported (by design)

### Decision 2: Derive `project_id` at Edge Creation

**Rule:** When creating an edge, `project_id` is derived from the source entity.

```typescript
// Edge creation pseudocode
const srcEntity = await getEntity(srcKind, srcId);
const dstEntity = await getEntity(dstKind, dstId);

// Validate same project
if (srcEntity.project_id !== dstEntity.project_id) {
	throw new Error('Cross-project edges are not allowed');
}

await createEdge({
	src_kind: srcKind,
	src_id: srcId,
	dst_kind: dstKind,
	dst_id: dstId,
	rel: relationship,
	project_id: srcEntity.project_id // Stamped from source
});
```

### Decision 3: Keep Edges for Structure

`project_id` is for **filtering**, edges are for **structure**.

- `project_id` answers: "What belongs to this project?"
- Edges answer: "How are things connected?"

Both are needed. This is intentional denormalization, not replacement.

### Decision 4: Frontend Graph Reconstruction

The frontend receives flat arrays of entities and edges, then builds the graph structure locally. This:

- Minimizes server-side computation
- Enables flexible client-side views (tree, graph, list)
- Keeps queries simple (no joins, no recursive CTEs)

### Decision 5: Canonical Edge Direction

**Convention:** Store edges directionally, query bidirectionally.

This specification integrates with the **Edge Direction Utility** (`apps/web/src/lib/services/ontology/edge-direction.ts`) which defines:

- **Canonical relationship types** (e.g., `has_task` instead of deprecated `belongs_to_plan`)
- **Direction normalization** for backwards compatibility
- **VALID_RELS** constant for relationship validation

All edges use canonical direction (parent → child):

- `project` → `has_plan` → `plan`
- `plan` → `has_task` → `task`
- `project` → `has_goal` → `goal`

Deprecated reverse relationships (e.g., `belongs_to_plan`) are automatically converted to canonical form.

---

## Integration with Edge Direction Utility

This specification depends on the edge direction utility for consistent relationship handling.

### Importing from Edge Direction Utility

```typescript
// apps/web/src/lib/services/ontology/edge-direction.ts provides:
import {
	normalizeEdgeDirection, // Converts deprecated rels to canonical form
	VALID_RELS, // Array of all valid relationship types
	RELATIONSHIP_DIRECTIONS, // Canonical direction rules per relationship
	type EntityKind, // 'project' | 'plan' | 'task' | ...
	type RelationshipType, // 'has_task' | 'has_plan' | 'depends_on' | ...
	type EdgeInput, // Edge creation input type
	type NormalizedEdge // Normalized edge output type
} from '$lib/services/ontology/edge-direction';
```

### Type Consolidation

The `EntityKind` type should be imported from `edge-direction.ts` rather than redefined:

```typescript
// File: apps/web/src/lib/types/project-graph.types.ts

// Import EntityKind from edge-direction utility for consistency
import type { EntityKind } from '$lib/services/ontology/edge-direction';

// Re-export for convenience
export type { EntityKind };

// Or extend if needed (e.g., adding 'decision' which may not be in edge-direction)
export type ExtendedEntityKind = EntityKind | 'decision';
```

---

## Data Model Changes

### Edge Table Schema Update

**Current Schema:**

```sql
create table onto_edges (
  id uuid primary key default gen_random_uuid(),
  src_kind text not null,
  src_id uuid not null,
  rel text not null,
  dst_kind text not null,
  dst_id uuid not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

**New Schema:**

```sql
create table onto_edges (
  id uuid primary key default gen_random_uuid(),
  src_kind text not null,
  src_id uuid not null,
  rel text not null,
  dst_kind text not null,
  dst_id uuid not null,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  project_id uuid not null references onto_projects(id) on delete cascade  -- NEW
);

-- NEW INDEX (critical for performance)
create index idx_onto_edges_project on onto_edges(project_id);
```

### TypeScript Type Update

```typescript
// File: apps/web/src/lib/types/onto-api.ts

export interface OntoEdge {
	id: string;
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
	props: Record<string, unknown> | null;
	created_at: string;
	project_id: string; // NEW
}
```

---

## Query Pattern

### Loading a Full Project Graph

```typescript
// File: apps/web/src/lib/services/ontology/project-graph-loader.ts

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectGraphData } from '$lib/types/project-graph.types';

/**
 * Load all ontology data for a project in parallel.
 * Uses project_id index on all tables for O(1) lookups.
 */
export async function loadProjectGraphData(
	supabase: SupabaseClient,
	projectId: string
): Promise<ProjectGraphData> {
	const [
		projectResult,
		plansResult,
		tasksResult,
		goalsResult,
		milestonesResult,
		documentsResult,
		risksResult,
		edgesResult
	] = await Promise.all([
		supabase.from('onto_projects').select('*').eq('id', projectId).single(),
		supabase.from('onto_plans').select('*').eq('project_id', projectId),
		supabase.from('onto_tasks').select('*').eq('project_id', projectId),
		supabase.from('onto_goals').select('*').eq('project_id', projectId),
		supabase.from('onto_milestones').select('*').eq('project_id', projectId),
		supabase.from('onto_documents').select('*').eq('project_id', projectId),
		supabase.from('onto_risks').select('*').eq('project_id', projectId),
		supabase.from('onto_edges').select('*').eq('project_id', projectId)
	]);

	// Handle errors
	if (projectResult.error) throw projectResult.error;

	return {
		project: projectResult.data,
		plans: plansResult.data ?? [],
		tasks: tasksResult.data ?? [],
		goals: goalsResult.data ?? [],
		milestones: milestonesResult.data ?? [],
		documents: documentsResult.data ?? [],
		risks: risksResult.data ?? [],
		edges: edgesResult.data ?? []
	};
}
```

### Query Complexity Analysis

| Query Type             | Before                                          | After                             |
| ---------------------- | ----------------------------------------------- | --------------------------------- |
| Entities (per type)    | `O(n)` index scan on `project_id`               | Same (no change)                  |
| Edges                  | `O(e * b)` batched queries on `src_id`/`dst_id` | `O(1)` index scan on `project_id` |
| Total for full project | Sequential + batching                           | **10 parallel queries**           |

Where `n` = entity count, `e` = edge count, `b` = batch count.

---

## Graph Building Utility

### Purpose

Transform flat arrays of entities and edges into a structured graph with:

- Parent-child relationships resolved
- Entities indexed by ID for O(1) lookup
- Typed accessors for common traversals

### Type Definitions

```typescript
// File: apps/web/src/lib/types/project-graph.types.ts

import type {
	OntoProject,
	OntoPlan,
	OntoTask,
	OntoGoal,
	OntoMilestone,
	OntoOutput,
	OntoDocument,
	OntoRisk,
	OntoDecision,
	OntoEdge
} from './onto-api';

// Import and re-export EntityKind from edge-direction utility for consistency
import type { EntityKind as BaseEntityKind } from '$lib/services/ontology/edge-direction';

/** Raw data returned from loadProjectGraphData */
export interface ProjectGraphData {
	project: OntoProject;
	plans: OntoPlan[];
	tasks: OntoTask[];
	goals: OntoGoal[];
	milestones: OntoMilestone[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
	risks: OntoRisk[];
	decisions: OntoDecision[];
	edges: OntoEdge[];
}

/**
 * Entity kinds in the ontology system
 * Extended from base EntityKind to include 'decision'
 */
export type EntityKind = BaseEntityKind | 'decision';

/** Union of all entity types */
export type AnyEntity =
	| OntoProject
	| OntoPlan
	| OntoTask
	| OntoGoal
	| OntoMilestone
	| OntoOutput
	| OntoDocument
	| OntoRisk
	| OntoDecision;

/** Map from entity kind to entity type */
export interface EntityTypeMap {
	project: OntoProject;
	plan: OntoPlan;
	task: OntoTask;
	goal: OntoGoal;
	milestone: OntoMilestone;
	output: OntoOutput;
	document: OntoDocument;
	risk: OntoRisk;
	decision: OntoDecision;
}

/** Edge grouped by relationship type */
export interface EdgesByRelationship {
	[rel: string]: OntoEdge[];
}

/** Edges indexed for fast lookup */
export interface EdgeIndex {
	/** All edges where this entity is the source */
	outgoing: Map<string, OntoEdge[]>;
	/** All edges where this entity is the destination */
	incoming: Map<string, OntoEdge[]>;
	/** Edges grouped by relationship type */
	byRelationship: EdgesByRelationship;
}

/** The built project graph with indexes and traversal methods */
export interface ProjectGraph {
	/** The root project */
	project: OntoProject;

	/** All entities indexed by ID */
	entitiesById: Map<string, AnyEntity>;

	/** Entities grouped by kind */
	entitiesByKind: {
		[K in EntityKind]: Map<string, EntityTypeMap[K]>;
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
	getEntityByKind<K extends EntityKind>(kind: K, id: string): EntityTypeMap[K] | undefined;

	/** Get all entities of a specific kind */
	getAllOfKind<K extends EntityKind>(kind: K): EntityTypeMap[K][];

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
}
```

### Implementation

````typescript
// File: apps/web/src/lib/services/ontology/project-graph-builder.ts

import type {
	ProjectGraphData,
	ProjectGraph,
	EntityTypeMap,
	AnyEntity,
	EdgeIndex
} from '$lib/types/project-graph.types';
import type { OntoEdge, OntoTask, OntoPlan, OntoGoal } from '$lib/types/onto-api';
// Import EntityKind from edge-direction utility for consistency
import type { EntityKind } from '$lib/services/ontology/edge-direction';

/**
 * Containment relationship types (parent → child direction)
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
	'has_output'
]);

/** Dependency relationship types */
const DEPENDENCY_RELATIONSHIPS = new Set(['depends_on', 'requires', 'blocks']);

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
		output: new Map(),
		document: new Map(),
		risk: new Map(),
		decision: new Map()
	};

	// Index project
	entitiesById.set(data.project.id, data.project);
	entitiesByKind.project.set(data.project.id, data.project);

	// Index all entity types
	const indexEntities = <K extends EntityKind>(entities: EntityTypeMap[K][], kind: K) => {
		for (const entity of entities) {
			entitiesById.set(entity.id, entity);
			(entitiesByKind[kind] as Map<string, EntityTypeMap[K]>).set(entity.id, entity);
		}
	};

	indexEntities(data.plans, 'plan');
	indexEntities(data.tasks, 'task');
	indexEntities(data.goals, 'goal');
	indexEntities(data.milestones, 'milestone');
	indexEntities(data.outputs, 'output');
	indexEntities(data.documents, 'document');
	indexEntities(data.risks, 'risk');
	indexEntities(data.decisions, 'decision');

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
		byRelationship[edge.rel].push(edge);
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
		}
	};

	return graph;
}

/**
 * Build a hierarchical tree structure from the project graph.
 * Useful for tree views and nested rendering.
 */
export interface TreeNode {
	entity: AnyEntity;
	kind: EntityKind;
	children: TreeNode[];
}

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

/** Determine the kind of an entity by checking which map contains it */
function getEntityKind(entity: AnyEntity, graph: ProjectGraph): EntityKind {
	for (const [kind, map] of Object.entries(graph.entitiesByKind)) {
		if (map.has(entity.id)) {
			return kind as EntityKind;
		}
	}
	return 'project'; // Fallback
}
````

---

## Migration Plan

### Prerequisites: Edge Direction Normalization

**IMPORTANT:** Before running the project_id migration, ensure the edge direction normalization migration has been applied:

```
Migration Order:
1. 20251216_normalize_edge_directions.sql  ← Run FIRST (cleans up deprecated rels)
2. YYYYMMDDHHMMSS_add_project_id_to_edges.sql  ← Run SECOND (adds project_id)
```

**Why this order matters:**

- The `normalize_edge_directions` migration removes redundant reverse edges (e.g., `belongs_to_plan`)
- It converts deprecated relationships to canonical form with correct direction
- The `add_project_id_to_edges` migration derives `project_id` from the source entity
- If edges have inconsistent direction, the backfill will derive `project_id` from the wrong entity

**Edge Normalization Migration:** `supabase/migrations/20251216_normalize_edge_directions.sql`

- Removes duplicate `belongs_to_plan` edges where `has_task` exists
- Converts remaining deprecated rels to canonical form
- See: `apps/web/src/lib/services/ontology/edge-direction.ts` for canonical rules

### Phase 1: Database Migration (Add project_id)

**File:** `supabase/migrations/YYYYMMDDHHMMSS_add_project_id_to_edges.sql`

```sql
-- Add project_id column to onto_edges
ALTER TABLE onto_edges
ADD COLUMN project_id uuid REFERENCES onto_projects(id) ON DELETE CASCADE;

-- Create index for efficient project-scoped queries
CREATE INDEX idx_onto_edges_project ON onto_edges(project_id);

-- Backfill existing edges by deriving project_id from source entity
-- This handles all entity types that have project_id

-- Plans
UPDATE onto_edges e
SET project_id = p.project_id
FROM onto_plans p
WHERE e.src_kind = 'plan' AND e.src_id = p.id AND e.project_id IS NULL;

-- Tasks
UPDATE onto_edges e
SET project_id = t.project_id
FROM onto_tasks t
WHERE e.src_kind = 'task' AND e.src_id = t.id AND e.project_id IS NULL;

-- Goals
UPDATE onto_edges e
SET project_id = g.project_id
FROM onto_goals g
WHERE e.src_kind = 'goal' AND e.src_id = g.id AND e.project_id IS NULL;

-- Milestones
UPDATE onto_edges e
SET project_id = m.project_id
FROM onto_milestones m
WHERE e.src_kind = 'milestone' AND e.src_id = m.id AND e.project_id IS NULL;

-- Documents
UPDATE onto_edges e
SET project_id = d.project_id
FROM onto_documents d
WHERE e.src_kind = 'document' AND e.src_id = d.id AND e.project_id IS NULL;

-- Risks
UPDATE onto_edges e
SET project_id = r.project_id
FROM onto_risks r
WHERE e.src_kind = 'risk' AND e.src_id = r.id AND e.project_id IS NULL;

-- Projects as source (edge from project to child)
UPDATE onto_edges e
SET project_id = e.src_id
WHERE e.src_kind = 'project' AND e.project_id IS NULL;

-- Handle any remaining edges by checking destination entity
-- (for edges where source was deleted but edge remains)
UPDATE onto_edges e
SET project_id = p.project_id
FROM onto_plans p
WHERE e.dst_kind = 'plan' AND e.dst_id = p.id AND e.project_id IS NULL;

UPDATE onto_edges e
SET project_id = t.project_id
FROM onto_tasks t
WHERE e.dst_kind = 'task' AND e.dst_id = t.id AND e.project_id IS NULL;

-- ... repeat for other entity types if needed

-- Delete orphan edges that couldn't be assigned a project_id
-- (edges referencing deleted entities)
DELETE FROM onto_edges WHERE project_id IS NULL;

-- Now make the column NOT NULL
ALTER TABLE onto_edges ALTER COLUMN project_id SET NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN onto_edges.project_id IS
  'Denormalized project reference for efficient project-scoped queries.
   Set at edge creation, never modified. Derived from source entity.';
```

### Phase 2: Update Edge Creation Logic

**File:** `apps/web/src/routes/api/onto/edges/+server.ts`

Update the POST handler to:

1. Normalize edge direction using the edge-direction utility
2. Include `project_id` derived from the (normalized) source entity

```typescript
import {
	normalizeEdgeDirection,
	VALID_RELS,
	type EdgeInput
} from '$lib/services/ontology/edge-direction';

// ... in POST handler:

// 1. Validate relationship type
if (!VALID_RELS.includes(edge.rel)) {
	return ApiResponse.error(`Invalid relationship: ${edge.rel}`, 400);
}

// 2. Normalize edge to canonical direction
// This handles deprecated rels (e.g., 'belongs_to_plan' → 'has_task' with swapped src/dst)
const normalizedEdge = normalizeEdgeDirection(edge);
if (!normalizedEdge) {
	return ApiResponse.error('Failed to normalize edge direction', 400);
}

// 3. Get source entity (using NORMALIZED src_id/src_kind)
const srcEntity = await getEntityByKindAndId(
	supabase,
	normalizedEdge.src_kind,
	normalizedEdge.src_id
);
if (!srcEntity) {
	return ApiResponse.error('Source entity not found', 404);
}

// 4. Derive project_id from normalized source
const projectId =
	normalizedEdge.src_kind === 'project' ? normalizedEdge.src_id : srcEntity.project_id;

// 5. Validate destination belongs to same project (if applicable)
if (normalizedEdge.dst_kind !== 'project') {
	const dstEntity = await getEntityByKindAndId(
		supabase,
		normalizedEdge.dst_kind,
		normalizedEdge.dst_id
	);
	if (dstEntity && dstEntity.project_id !== projectId) {
		return ApiResponse.error('Cross-project edges are not allowed', 400);
	}
}

// 6. Create edge with normalized values and project_id
const { data: createdEdge, error } = await supabase
	.from('onto_edges')
	.insert({
		src_kind: normalizedEdge.src_kind,
		src_id: normalizedEdge.src_id,
		dst_kind: normalizedEdge.dst_kind,
		dst_id: normalizedEdge.dst_id,
		rel: normalizedEdge.rel, // Canonical relationship type
		props: normalizedEdge.props ?? {},
		project_id: projectId // NEW
	})
	.select()
	.single();
```

**Key Integration Points:**

- Import `VALID_RELS` instead of defining a local array
- Use `normalizeEdgeDirection()` to convert deprecated rels automatically
- Derive `project_id` from the **normalized** source entity (after direction swap if needed)

### Phase 3: Update TypeScript Types

**File:** `apps/web/src/lib/types/onto-api.ts`

```typescript
export interface OntoEdge {
	id: string;
	src_kind: string;
	src_id: string;
	dst_kind: string;
	dst_id: string;
	rel: string;
	props: Record<string, unknown> | null;
	created_at: string;
	project_id: string; // NEW
}
```

### Phase 4: Create Utility Files

1. **Types:** `apps/web/src/lib/types/project-graph.types.ts`
2. **Loader:** `apps/web/src/lib/services/ontology/project-graph-loader.ts`
3. **Builder:** `apps/web/src/lib/services/ontology/project-graph-builder.ts`

### Phase 5: Update Graph API Endpoint

**File:** `apps/web/src/routes/api/onto/graph/+server.ts`

Simplify to use new query pattern:

```typescript
// Before: Complex batched queries
// After: Simple parallel queries

import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import { buildProjectGraph } from '$lib/services/ontology/project-graph-builder';

export async function GET({ locals, url }) {
	const projectId = url.searchParams.get('projectId');

	if (!projectId) {
		// Load all projects for user (existing logic)
		// ...
	}

	// Single project: use new efficient pattern
	const data = await loadProjectGraphData(locals.supabase, projectId);
	const graph = buildProjectGraph(data);

	// Convert to visualization format if needed
	return ApiResponse.success(graph);
}
```

---

## Implementation Locations

| Component                        | File Path                                                          | Status  |
| -------------------------------- | ------------------------------------------------------------------ | ------- |
| **Prerequisites (Dependencies)** |                                                                    |         |
| Edge Direction Utility           | `apps/web/src/lib/services/ontology/edge-direction.ts`             | ✅ DONE |
| Edge Normalization Migration     | `supabase/migrations/20251216_normalize_edge_directions.sql`       | ✅ DONE |
| **This Specification**           |                                                                    |         |
| Database Migration (project_id)  | `supabase/migrations/20251216_add_project_id_to_edges.sql`         | ✅ DONE |
| TypeScript Types                 | `apps/web/src/lib/types/project-graph.types.ts`                    | ✅ DONE |
| Type Update                      | `apps/web/src/lib/types/onto-api.ts`                               | ✅ DONE |
| Graph Loader                     | `apps/web/src/lib/services/ontology/project-graph-loader.ts`       | ✅ DONE |
| Graph Builder                    | `apps/web/src/lib/services/ontology/project-graph-builder.ts`      | ✅ DONE |
| Graph Builder Tests              | `apps/web/src/lib/services/ontology/project-graph-builder.test.ts` | ✅ DONE |
| Edge API Update                  | `apps/web/src/routes/api/onto/edges/+server.ts`                    | ✅ DONE |
| Task Create API Update           | `apps/web/src/routes/api/onto/tasks/create/+server.ts`             | ✅ DONE |
| Graph API Update                 | `apps/web/src/routes/api/onto/graph/+server.ts`                    | ✅ DONE |
| Project Graph API Update         | `apps/web/src/routes/api/onto/projects/[id]/graph/+server.ts`      | ✅ DONE |

---

## Usage Examples

### Loading and Using a Project Graph

```typescript
import { loadProjectGraphData } from '$lib/services/ontology/project-graph-loader';
import { buildProjectGraph, buildProjectTree } from '$lib/services/ontology/project-graph-builder';

// In a +page.server.ts or API route
export async function load({ locals, params }) {
	const data = await loadProjectGraphData(locals.supabase, params.projectId);
	const graph = buildProjectGraph(data);

	return {
		project: graph.project,
		plans: graph.getPlansForProject(),
		// Or return the full graph for client-side traversal
		graphData: data // Serializable
	};
}
```

### Client-Side Graph Traversal

```svelte
<script lang="ts">
	import { buildProjectGraph } from '$lib/services/ontology/project-graph-builder';
	import type { ProjectGraphData } from '$lib/types/project-graph.types';

	let { data } = $props<{ graphData: ProjectGraphData }>();

	// Build graph on client
	const graph = $derived(buildProjectGraph(data.graphData));

	// Reactive traversals
	const plans = $derived(graph.getPlansForProject());
	const tasksPerPlan = $derived(
		plans.map((plan) => ({
			plan,
			tasks: graph.getTasksForPlan(plan.id)
		}))
	);
</script>

{#each tasksPerPlan as { plan, tasks }}
	<div class="plan">
		<h3>{plan.name}</h3>
		{#each tasks as task}
			<div class="task">{task.title}</div>
		{/each}
	</div>
{/each}
```

### Filtering by Relationship Type

```typescript
// Get all dependency edges
const dependencyEdges = graph.getEdgesByRelationship('depends_on');

// Find all tasks with dependencies
const tasksWithDeps = graph
	.getAllOfKind('task')
	.filter((task) => graph.getDependencies(task.id).length > 0);

// Build a dependency graph visualization
const depGraph = dependencyEdges.map((edge) => ({
	from: graph.getEntity(edge.src_id),
	to: graph.getEntity(edge.dst_id)
}));
```

---

## Testing Strategy

### Unit Tests

```typescript
// File: apps/web/src/lib/services/ontology/project-graph-builder.test.ts

import { describe, it, expect } from 'vitest';
import { buildProjectGraph } from './project-graph-builder';
import type { ProjectGraphData } from '$lib/types/project-graph.types';

describe('buildProjectGraph', () => {
	const mockData: ProjectGraphData = {
		project: { id: 'proj-1', name: 'Test Project' /* ... */ },
		plans: [
			{ id: 'plan-1', project_id: 'proj-1', name: 'Plan A' },
			{ id: 'plan-2', project_id: 'proj-1', name: 'Plan B' }
		],
		tasks: [
			{ id: 'task-1', project_id: 'proj-1', title: 'Task 1' },
			{ id: 'task-2', project_id: 'proj-1', title: 'Task 2' }
		],
		goals: [],
		milestones: [],
		outputs: [],
		documents: [],
		risks: [],
		decisions: [],
		edges: [
			{
				id: 'e1',
				src_kind: 'project',
				src_id: 'proj-1',
				dst_kind: 'plan',
				dst_id: 'plan-1',
				rel: 'has_plan',
				project_id: 'proj-1'
			},
			{
				id: 'e2',
				src_kind: 'plan',
				src_id: 'plan-1',
				dst_kind: 'task',
				dst_id: 'task-1',
				rel: 'has_task',
				project_id: 'proj-1'
			},
			{
				id: 'e3',
				src_kind: 'task',
				src_id: 'task-1',
				dst_kind: 'task',
				dst_id: 'task-2',
				rel: 'depends_on',
				project_id: 'proj-1'
			}
		]
	};

	it('indexes entities by ID', () => {
		const graph = buildProjectGraph(mockData);
		expect(graph.getEntity('task-1')).toEqual(mockData.tasks[0]);
	});

	it('resolves parent-child relationships', () => {
		const graph = buildProjectGraph(mockData);
		const children = graph.getChildren('proj-1');
		expect(children).toHaveLength(1);
		expect(children[0].id).toBe('plan-1');
	});

	it('resolves plan tasks', () => {
		const graph = buildProjectGraph(mockData);
		const tasks = graph.getTasksForPlan('plan-1');
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe('Task 1');
	});

	it('resolves dependencies', () => {
		const graph = buildProjectGraph(mockData);
		const deps = graph.getDependencies('task-1');
		expect(deps).toHaveLength(1);
		expect(deps[0].id).toBe('task-2');
	});

	it('resolves dependents', () => {
		const graph = buildProjectGraph(mockData);
		const dependents = graph.getDependents('task-2');
		expect(dependents).toHaveLength(1);
		expect(dependents[0].id).toBe('task-1');
	});
});
```

### Integration Tests

```typescript
// File: apps/web/src/lib/services/ontology/project-graph-loader.test.ts

import { describe, it, expect } from 'vitest';
import { loadProjectGraphData } from './project-graph-loader';
import { createTestSupabaseClient } from '$lib/test-utils/supabase';

describe('loadProjectGraphData', () => {
	it('loads all entity types in parallel', async () => {
		const supabase = createTestSupabaseClient();
		const projectId = 'test-project-id';

		const data = await loadProjectGraphData(supabase, projectId);

		expect(data.project).toBeDefined();
		expect(Array.isArray(data.plans)).toBe(true);
		expect(Array.isArray(data.tasks)).toBe(true);
		expect(Array.isArray(data.edges)).toBe(true);
	});
});
```

---

## Performance Considerations

### Index Usage

Ensure the following indexes exist:

```sql
-- Entity tables (already exist)
CREATE INDEX idx_onto_plans_project ON onto_plans(project_id);
CREATE INDEX idx_onto_tasks_project ON onto_tasks(project_id);
-- ... etc

-- Edge table (NEW)
CREATE INDEX idx_onto_edges_project ON onto_edges(project_id);
```

### Query Analysis

Run `EXPLAIN ANALYZE` on production-like data:

```sql
EXPLAIN ANALYZE
SELECT * FROM onto_edges WHERE project_id = 'some-uuid';

-- Should show: Index Scan using idx_onto_edges_project
-- NOT: Seq Scan
```

### Memory Considerations

For very large projects (1000+ entities), consider:

1. Lazy loading of entity details
2. Pagination of entity lists
3. Server-side graph building for initial render

---

## Future Enhancements

### 1. Multi-Project Loading

```typescript
export async function loadMultipleProjectGraphs(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<Map<string, ProjectGraphData>> {
  // Batch load with single query per entity type
  const [projects, plans, tasks, edges, ...] = await Promise.all([
    supabase.from('onto_projects').select('*').in('id', projectIds),
    supabase.from('onto_plans').select('*').in('project_id', projectIds),
    supabase.from('onto_tasks').select('*').in('project_id', projectIds),
    supabase.from('onto_edges').select('*').in('project_id', projectIds),
    // ...
  ]);

  // Group by project_id
  // ...
}
```

### 2. Incremental Updates

```typescript
export function applyGraphUpdate(graph: ProjectGraph, update: GraphUpdate): ProjectGraph {
	// Handle entity additions, deletions, edge changes
	// Without full rebuild
}
```

### 3. Graph Subscriptions

```typescript
// Real-time updates via Supabase subscriptions
supabase
	.channel('project-graph')
	.on(
		'postgres_changes',
		{
			event: '*',
			schema: 'public',
			table: 'onto_edges',
			filter: `project_id=eq.${projectId}`
		},
		handleEdgeChange
	)
	.subscribe();
```

---

## Appendix: Entity Reference

| Entity    | Table             | Has `project_id` | Containment Relationship                  |
| --------- | ----------------- | ---------------- | ----------------------------------------- |
| Project   | `onto_projects`   | N/A (is root)    | -                                         |
| Plan      | `onto_plans`      | ✅               | `project` → `has_plan` → `plan`           |
| Task      | `onto_tasks`      | ✅               | `plan` → `has_task` → `task`              |
| Goal      | `onto_goals`      | ✅               | `project` → `has_goal` → `goal`           |
| Milestone | `onto_milestones` | ✅               | `project` → `has_milestone` → `milestone` |
| Document  | `onto_documents`  | ✅               | `project` → `has_document` → `document`   |
| Risk      | `onto_risks`      | ✅               | `project` → `has_risk` → `risk`           |
| Edge      | `onto_edges`      | ✅ (NEW)         | N/A                                       |
