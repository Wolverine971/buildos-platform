<!-- apps/web/docs/features/ontology/GRAPH_ENHANCEMENT_SPEC.md -->

# Ontology Graph Enhancement Specification

**Created**: 2025-12-09
**Status**: Draft
**Author**: Claude (AI Assistant)
**Scope**: `/admin/ontology/graph` page improvements

---

## Executive Summary

This specification defines enhancements to the admin ontology graph viewer to:

1. Display **all entity types** connected to projects (not just 5 of 15)
2. Show **complete edge relationships** between all entities
3. Apply **best practice styling** for node/edge visualization
4. Improve **performance, accessibility, and dark mode support**

---

## Current State Analysis

### What's Currently Loaded (5 of 15 Entity Types)

| Entity    | Table            | Loaded | Visualized |
| --------- | ---------------- | ------ | ---------- |
| Templates | `onto_templates` | Yes    | Yes        |
| Projects  | `onto_projects`  | Yes    | Yes        |
| Tasks     | `onto_tasks`     | Yes    | Yes        |
| Documents | `onto_documents` | Yes    | Yes        |

### What's Missing (10 Entity Types)

| Entity         | Table                | Has Edges                         | Priority |
| -------------- | -------------------- | --------------------------------- | -------- |
| **Plans**      | `onto_plans`         | Yes (belongs_to_plan, has_task)   | HIGH     |
| **Goals**      | `onto_goals`         | Yes (supports_goal, requires)     | HIGH     |
| **Milestones** | `onto_milestones`    | Yes (targets_milestone, contains) | HIGH     |
| Requirements   | `onto_requirements`  | Yes (has_requirement)             | MEDIUM   |
| Risks          | `onto_risks`         | Possible                          | MEDIUM   |
| Metrics        | `onto_metrics`       | Possible                          | LOW      |
| Metric Points  | `onto_metric_points` | No (data points)                  | SKIP     |
| Sources        | `onto_sources`       | Yes (has_source)                  | LOW      |
| Signals        | `onto_signals`       | Yes (has_signal)                  | LOW      |

### Current Edge Problem

The graph currently filters edges to only include those where **both source AND target** are in the loaded node set. Since Plans, Goals, Milestones aren't loaded, their edges are filtered out:

```typescript
// Current behavior in graph.service.ts:219
const filteredEdges = edges.filter(
	(edge) => nodeIds.has(edge.data.source) && nodeIds.has(edge.data.target)
);
```

This means if a Task has a `supports_goal` edge to a Goal, that edge is **invisible** because Goals aren't loaded.

---

## Proposed Changes

### Phase 1: Core Entity Expansion (HIGH Priority)

#### 1.1 Update Data Loading (`+page.server.ts`)

Add queries for missing high-priority entities:

```typescript
const [
	templatesRes,
	projectsRes,
	edgesRes,
	tasksRes,
	outputsRes,
	documentsRes,
	// NEW:
	plansRes,
	goalsRes,
	milestonesRes
] = await Promise.all([
	adminClient.from('onto_templates').select('*').eq('status', 'active'),
	adminClient.from('onto_projects').select('*'),
	adminClient.from('onto_edges').select('*'),
	adminClient.from('onto_tasks').select('*'),
	adminClient.from('onto_documents').select('*'),
	// NEW:
	adminClient.from('onto_plans').select('*'),
	adminClient.from('onto_goals').select('*'),
	adminClient.from('onto_milestones').select('*')
]);
```

#### 1.2 Update Type Definitions (`graph.types.ts`)

```typescript
// Add new database row types
export type OntoPlan = Database['public']['Tables']['onto_plans']['Row'];
export type OntoGoal = Database['public']['Tables']['onto_goals']['Row'];
export type OntoMilestone = Database['public']['Tables']['onto_milestones']['Row'];

// Expand NodeType union
export type NodeType =
	| 'template'
	| 'project'
	| 'task'
	| 'output'
	| 'document'
	| 'plan' // NEW
	| 'goal' // NEW
	| 'milestone'; // NEW

// Update GraphSourceData
export interface GraphSourceData {
	templates: OntoTemplate[];
	projects: OntoProject[];
	edges: OntoEdge[];
	tasks: OntoTask[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
	// NEW:
	plans: OntoPlan[];
	goals: OntoGoal[];
	milestones: OntoMilestone[];
}

// Update GraphStats
export interface GraphStats {
	totalTemplates: number;
	totalProjects: number;
	activeProjects: number;
	totalEdges: number;
	totalTasks: number;
	totalOutputs: number;
	totalDocuments: number;
	// NEW:
	totalPlans: number;
	totalGoals: number;
	totalMilestones: number;
}
```

#### 1.3 Add Node Transformation Methods (`graph.service.ts`)

```typescript
static plansToNodes(plans: OntoPlan[]): CytoscapeNode[] {
  return plans.map((plan) => ({
    data: {
      id: plan.id,
      label: plan.name,
      type: 'plan',
      metadata: {
        projectId: plan.project_id,
        typeKey: plan.type_key,
        state: plan.state_key,
        props: plan.props
      },
      color: '#8b5cf6', // Purple - planning entities
      size: 35,
      shape: 'round-rectangle' // Rounded for planning abstractions
    }
  }));
}

static goalsToNodes(goals: OntoGoal[]): CytoscapeNode[] {
  return goals.map((goal) => ({
    data: {
      id: goal.id,
      label: goal.name,
      type: 'goal',
      metadata: {
        projectId: goal.project_id,
        typeKey: goal.type_key,
        props: goal.props
      },
      color: '#ef4444', // Red - strategic importance
      size: 45,
      shape: 'star' // Stars for goals/aspirations
    }
  }));
}

static milestonesToNodes(milestones: OntoMilestone[]): CytoscapeNode[] {
  return milestones.map((milestone) => ({
    data: {
      id: milestone.id,
      label: milestone.title,
      type: 'milestone',
      metadata: {
        projectId: milestone.project_id,
        dueAt: milestone.due_at,
        props: milestone.props
      },
      color: '#06b6d4', // Cyan - temporal markers
      size: 30,
      shape: 'diamond' // Diamond for key moments
    }
  }));
}
```

#### 1.4 Update `buildGraphData` Method

```typescript
case 'projects': {
  const allowedKinds = new Set([
    'project', 'task', 'output', 'document',
    'plan', 'goal', 'milestone' // NEW
  ]);
  nodes = [
    ...this.projectsToNodes(data.projects),
    ...this.tasksToNodes(data.tasks),
    ...this.outputsToNodes(data.outputs),
    ...this.documentsToNodes(data.documents),
    // NEW:
    ...this.plansToNodes(data.plans),
    ...this.goalsToNodes(data.goals),
    ...this.milestonesToNodes(data.milestones)
  ];
  const projectEdges = data.edges.filter(
    (edge) => allowedKinds.has(edge.src_kind) && allowedKinds.has(edge.dst_kind)
  );
  edges = this.edgesToCytoscape(projectEdges);
  break;
}
```

#### 1.5 Update GraphControls Filters

```typescript
const filters = [
	{ value: 'all', label: 'All Nodes' },
	{ value: 'template', label: 'Templates' },
	{ value: 'project', label: 'Projects' },
	{ value: 'task', label: 'Tasks' },
	{ value: 'plan', label: 'Plans' }, // NEW
	{ value: 'goal', label: 'Goals' }, // NEW
	{ value: 'milestone', label: 'Milestones' }, // NEW
	{ value: 'output', label: 'Outputs' },
	{ value: 'document', label: 'Documents' }
];
```

---

### Phase 2: Visual Styling Improvements (MEDIUM Priority)

#### 2.1 Comprehensive Node Color Palette

Design a cohesive color system for all entity types with light/dark mode support:

| Entity Type         | Light Mode | Dark Mode | Shape           | Size Range | Semantic             |
| ------------------- | ---------- | --------- | --------------- | ---------- | -------------------- |
| Template (abstract) | `#9ca3af`  | `#6b7280` | hexagon         | 40         | Gray - meta          |
| Template (concrete) | `#3b82f6`  | `#60a5fa` | hexagon         | 40         | Blue - definition    |
| Project (draft)     | `#9ca3af`  | `#6b7280` | round-rectangle | 30-60      | Gray - inactive      |
| Project (active)    | `#10b981`  | `#34d399` | round-rectangle | 30-60      | Green - active       |
| Project (complete)  | `#3b82f6`  | `#60a5fa` | round-rectangle | 30-60      | Blue - done          |
| Task (todo)         | `#f59e0b`  | `#fbbf24` | ellipse         | 25         | Amber - pending      |
| Task (done)         | `#10b981`  | `#34d399` | ellipse         | 25         | Green - complete     |
| Plan                | `#8b5cf6`  | `#a78bfa` | round-rectangle | 35         | Purple - planning    |
| Goal                | `#ef4444`  | `#f87171` | star            | 45         | Red - strategic      |
| Milestone           | `#06b6d4`  | `#22d3ee` | diamond         | 30         | Cyan - temporal      |
| Output              | `#8b5cf6`  | `#a78bfa` | diamond         | 30         | Purple - deliverable |
| Document            | `#06b6d4`  | `#22d3ee` | rectangle       | 25         | Cyan - reference     |

#### 2.2 Edge Styling by Relationship Type

Color-code edges based on relationship semantics:

| Relationship Category | Edge Types                                    | Color     | Style          |
| --------------------- | --------------------------------------------- | --------- | -------------- |
| Hierarchical          | `belongs_to_plan`, `has_task`, `contains`     | `#6b7280` | solid          |
| Goal Support          | `supports_goal`, `requires`, `achieved_by`    | `#ef4444` | solid, thicker |
| Dependencies          | `depends_on`, `blocks`                        | `#f59e0b` | dashed         |
| Temporal              | `targets_milestone`                           | `#06b6d4` | dotted         |
| Knowledge             | `references`, `referenced_by`, `has_document` | `#8b5cf6` | solid, thin    |
| Production            | `produces`, `produced_by`                     | `#10b981` | solid          |
| Generic               | `relates_to`                                  | `#9ca3af` | dotted, thin   |

Implementation in `edgesToCytoscape`:

```typescript
static getEdgeStyle(rel: string): { color: string; style: string; width: number } {
  const styles: Record<string, { color: string; style: string; width: number }> = {
    // Hierarchical
    belongs_to_plan: { color: '#6b7280', style: 'solid', width: 2 },
    has_task: { color: '#6b7280', style: 'solid', width: 2 },
    contains: { color: '#6b7280', style: 'solid', width: 2 },
    // Goal support
    supports_goal: { color: '#ef4444', style: 'solid', width: 3 },
    requires: { color: '#ef4444', style: 'solid', width: 3 },
    achieved_by: { color: '#ef4444', style: 'solid', width: 3 },
    // Dependencies
    depends_on: { color: '#f59e0b', style: 'dashed', width: 2 },
    blocks: { color: '#f59e0b', style: 'dashed', width: 2 },
    // Temporal
    targets_milestone: { color: '#06b6d4', style: 'dotted', width: 2 },
    // Knowledge
    references: { color: '#8b5cf6', style: 'solid', width: 1 },
    referenced_by: { color: '#8b5cf6', style: 'solid', width: 1 },
    has_document: { color: '#8b5cf6', style: 'solid', width: 1 },
    // Production
    produces: { color: '#10b981', style: 'solid', width: 2 },
    produced_by: { color: '#10b981', style: 'solid', width: 2 }
  };
  return styles[rel] ?? { color: '#9ca3af', style: 'dotted', width: 1 };
}
```

#### 2.3 Dark Mode Support

Add CSS variable-based theming:

```typescript
// In OntologyGraph.svelte, detect dark mode and adjust colors
const isDarkMode = $derived(
	typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
);

// Apply theme-aware colors when building graph
function getThemedColor(lightColor: string, darkColor: string): string {
	return isDarkMode ? darkColor : lightColor;
}
```

---

### Phase 3: Performance & UX Improvements (MEDIUM Priority)

#### 3.1 Layout Algorithm Selection Guide

Add intelligent layout selection based on graph characteristics:

```typescript
function selectOptimalLayout(nodeCount: number, edgeCount: number): string {
	const density = edgeCount / nodeCount;

	if (density < 2) {
		return 'dagre'; // Hierarchical, sparse graphs
	} else if (density < 4 && nodeCount < 500) {
		return 'cola'; // Moderate density, constraint-based
	} else {
		return 'cose-bilkent'; // Dense, force-directed
	}
}
```

#### 3.2 Node Limit Warning

Add warning when graph exceeds performance thresholds:

```typescript
const PERFORMANCE_THRESHOLDS = {
	warning: 1000, // Show performance warning
	limit: 2000 // Hard limit with filtering suggestion
};
```

#### 3.3 Compound Node Grouping (Future)

Consider grouping entities by project using Cytoscape compound nodes:

```typescript
// Each project becomes a compound parent node
// Child entities (tasks, plans, goals) are nested inside
{
  data: {
    id: task.id,
    parent: task.project_id, // Compound parent
    // ...
  }
}
```

---

### Phase 4: Statistics & Controls Enhancement (LOW Priority)

#### 4.1 Enhanced Statistics Panel

Update `GraphControls.svelte` to show all entity counts:

```svelte
<div class="space-y-2 text-xs text-gray-900 dark:text-white">
	<!-- Existing -->
	<div class="flex justify-between">
		<span class="text-gray-600 dark:text-gray-400">Templates</span>
		<span class="font-semibold">{stats.totalTemplates}</span>
	</div>
	<!-- ... projects, tasks, outputs, documents ... -->

	<!-- NEW -->
	<div class="flex justify-between">
		<span class="text-gray-600 dark:text-gray-400">Plans</span>
		<span class="font-semibold">{stats.totalPlans}</span>
	</div>
	<div class="flex justify-between">
		<span class="text-gray-600 dark:text-gray-400">Goals</span>
		<span class="font-semibold text-red-600 dark:text-red-400">{stats.totalGoals}</span>
	</div>
	<div class="flex justify-between">
		<span class="text-gray-600 dark:text-gray-400">Milestones</span>
		<span class="font-semibold text-cyan-600 dark:text-cyan-400">{stats.totalMilestones}</span>
	</div>
</div>
```

#### 4.2 Edge Type Legend

Add a visual legend showing edge colors and their meanings:

```svelte
<Card variant="default">
	<CardHeader variant="gradient">
		<h3 class="font-semibold text-white text-sm">Relationship Legend</h3>
	</CardHeader>
	<CardBody padding="md">
		<div class="space-y-1 text-xs">
			<div class="flex items-center gap-2">
				<div class="w-4 h-0.5 bg-gray-500"></div>
				<span>Hierarchical</span>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-4 h-0.5 bg-red-500"></div>
				<span>Goal Support</span>
			</div>
			<div class="flex items-center gap-2">
				<div class="w-4 h-0.5 bg-amber-500 border-dashed"></div>
				<span>Dependencies</span>
			</div>
			<!-- ... -->
		</div>
	</CardBody>
</Card>
```

---

## Implementation Checklist

### Phase 1: Core Entity Expansion (COMPLETED 2025-12-09)

- [x] Update `+page.server.ts` to load plans, goals, milestones
- [x] Add type definitions for new entities in `graph.types.ts`
- [x] Add transformation methods in `graph.service.ts`
- [x] Update `buildGraphData` for all view modes
- [x] Update `GraphStats` interface and calculations
- [x] Update filter options in `GraphControls.svelte`
- [x] Add node legend and edge legend to GraphControls
- [x] Update NodeDetailsPanel for new entity types

### Phase 2: Visual Styling (COMPLETED 2025-12-09)

- [x] Implement comprehensive color palette
- [x] Add edge styling by relationship type
- [x] Add dark mode color variants (via semantic classes)
- [x] Update node shapes for semantic meaning
- [ ] Test contrast ratios (WCAG AA)

### Phase 3: Performance & UX

- [ ] Add layout selection logic
- [ ] Add performance warning for large graphs
- [ ] Debounce graph updates
- [ ] Test with 500-2000 nodes

### Phase 4: Statistics & Controls (COMPLETED 2025-12-09)

- [x] Update statistics panel
- [x] Add node legend
- [x] Add edge legend
- [ ] Add edge type filter (future)

---

## Files Modified (2025-12-09)

| File                                                                 | Changes                                                                                                                                                         |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/admin/ontology/graph/+page.server.ts`           | Added plan/goal/milestone queries, updated stats                                                                                                                |
| `apps/web/src/lib/components/ontology/graph/lib/graph.types.ts`      | Added OntoPlan, OntoGoal, OntoMilestone types; expanded NodeType union; updated GraphSourceData and GraphStats                                                  |
| `apps/web/src/lib/components/ontology/graph/lib/graph.service.ts`    | Added plansToNodes, goalsToNodes, milestonesToNodes methods; added getEdgeStyle for relationship-based coloring; updated buildGraphData to include all entities |
| `apps/web/src/lib/components/ontology/graph/GraphControls.svelte`    | Added Plan/Goal/Milestone filters; updated stats display; added Node Legend and Edge Legend cards                                                               |
| `apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte`    | Updated edge styling to use data(color) and data(width) from edge data                                                                                          |
| `apps/web/src/lib/components/ontology/graph/NodeDetailsPanel.svelte` | Added colors for plan, goal, milestone types; added URL routing for new entity types                                                                            |

---

## Testing Strategy

1. **Unit Tests**: Test each transformation method with sample data
2. **Integration Tests**: Verify all edges display correctly
3. **Visual Tests**: Screenshot comparisons for styling changes
4. **Performance Tests**: Measure render time with 500, 1000, 2000 nodes
5. **Accessibility Tests**: Verify contrast ratios, keyboard navigation

---

## Open Questions

1. Should we load all 15 entity types or only the 8 that have common edge relationships?
2. Should compound nodes (grouping by project) be implemented now or deferred?
3. Should edge filtering by relationship type be added to controls?
4. What is the acceptable performance threshold (max nodes before warning)?

---

## Phase 5: Alternative Graph Library Implementations (COMPLETED 2025-12-09)

Three graph library implementations are now available on the admin page:

### Implementation 1: Cytoscape.js (Default/Stable)

- **Status:** Production-ready
- **File:** `OntologyGraph.svelte`
- **Features:** Full-featured with dagre, cola, cose-bilkent layouts
- **Best for:** General use, moderate-sized graphs

### Implementation 2: Svelte Flow (Native Svelte)

- **Status:** Implemented
- **Files:**
    - `svelteflow/SvelteFlowGraph.svelte` - Main component
    - `svelteflow/nodes/` - Custom node components with Lucide icons
    - `lib/svelteflow.service.ts` - Data transformation service
- **Features:**
    - Native Svelte components for custom nodes
    - Custom node components: TemplateNode, ProjectNode, TaskNode, PlanNode, GoalNode, MilestoneNode, OutputNode, DocumentNode
    - Built-in Controls, MiniMap, Background
    - Dark mode support via CSS variables
- **Best for:** Svelte-native development, custom node interactions

### Implementation 3: G6 by AntV (High Performance)

- **Status:** Implemented
- **Files:**
    - `g6/G6Graph.svelte` - Wrapper component
    - `lib/g6.service.ts` - Data transformation service
- **Features:**
    - High-performance rendering (30k+ nodes)
    - Built-in dagre layout
    - Minimap and toolbar plugins
    - Click-to-select, drag canvas, zoom behaviors
- **Best for:** Large graphs, performance-critical applications

### Library Switcher

The admin page now includes a toggle to switch between implementations:

- Location: Top of the graph page, below the header
- Options: Cytoscape (stable), Svelte Flow (native), G6 (performance)

---

## References

- [Cytoscape.js Documentation](http://js.cytoscape.org)
- [Svelte Flow Documentation](https://svelteflow.dev)
- [G6 by AntV Documentation](https://g6.antv.antgroup.com)
- [Ontology Data Models](/apps/web/docs/features/ontology/DATA_MODELS.md)
- [Linked Entities Component](/apps/web/docs/features/ontology/LINKED_ENTITIES_COMPONENT.md)
- [Type Key Taxonomy](/apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md)
