---
title: "Admin Ontology Graph View - Cytoscape.js Visualization Spec"
status: design-phase
date: 2026-02-06
category: ontology
path: thoughts/shared/ideas/ontology/admin-ontology-graph-view-spec.md
---

<!-- thoughts/shared/ideas/ontology/admin-ontology-graph-view-spec.md -->
# Cytoscape.js Ontology Visualization Specification

## Project Context

Building an admin panel visualization for a project ontology system using SvelteKit, TypeScript, Supabase, and Tailwind CSS. The ontology consists of multiple `onto_*` tables representing projects, templates, tasks, documents, and their relationships.

## Installation Requirements

```bash
npm install cytoscape @types/cytoscape cytoscape-dagre cytoscape-cola cytoscape-cose-bilkent
npm install --save-dev @types/cytoscape
```

## File Structure

```
src/routes/admin/ontology/
├── +page.svelte          # Main page component
├── +page.ts              # Load function for data
├── OntologyGraph.svelte  # Graph visualization component
├── NodeDetails.svelte    # Node detail panel component
├── GraphControls.svelte  # Control panel component
└── ontology.service.ts   # Data transformation service
```

## 1. Main Page Component (`+page.svelte`)

```typescript
<!-- High-level structure -->
<script lang="ts">
  import OntologyGraph from './OntologyGraph.svelte';
  import NodeDetails from './NodeDetails.svelte';
  import GraphControls from './GraphControls.svelte';

  export let data; // From +page.ts load function

  let selectedNode = null;
  let graphInstance = null;
  let viewMode = 'templates'; // 'templates', 'projects', 'full'
</script>

<div class="flex h-screen bg-gray-50">
  <!-- Left sidebar: Controls -->
  <div class="w-64 bg-white shadow-lg p-4">
    <GraphControls
      bind:viewMode
      {graphInstance}
      stats={data.stats}
    />
  </div>

  <!-- Center: Graph -->
  <div class="flex-1 relative">
    <OntologyGraph
      {data}
      {viewMode}
      bind:selectedNode
      bind:graphInstance
    />
  </div>

  <!-- Right sidebar: Details -->
  {#if selectedNode}
    <div class="w-96 bg-white shadow-lg">
      <NodeDetails node={selectedNode} />
    </div>
  {/if}
</div>
```

## 2. Data Loading (`+page.ts`)

```typescript
// Fetch all ontology data from Supabase
import type { PageLoad } from './$types';
import { supabase } from '$lib/supabase';

export const load: PageLoad = async () => {
	// Fetch all relevant tables
	const [templates, projects, edges, tasks, documents, actors, facets] = await Promise.all([
		supabase.from('onto_templates').select('*'),
		supabase.from('onto_projects').select('*'),
		supabase.from('onto_edges').select('*'),
		supabase.from('onto_tasks').select('*'),
		supabase.from('onto_documents').select('*'),
		supabase.from('onto_actors').select('*'),
		supabase.from('onto_facet_definitions').select('*')
	]);

	// Calculate statistics
	const stats = {
		totalTemplates: templates.data?.length || 0,
		activeProjects: projects.data?.filter((p) => p.state_key === 'active').length || 0,
		totalEdges: edges.data?.length || 0
		// Add more stats
	};

	return {
		templates: templates.data || [],
		projects: projects.data || [],
		edges: edges.data || [],
		tasks: tasks.data || [],
		documents: documents.data || [],
		actors: actors.data || [],
		facets: facets.data || [],
		stats
	};
};
```

## 3. Ontology Service (`ontology.service.ts`)

```typescript
// Transform Supabase data into Cytoscape format
export interface CytoscapeNode {
	data: {
		id: string;
		label: string;
		type: 'template' | 'project' | 'task' | 'document' | 'actor';
		parent?: string;
		metadata: any;
		// Add visual properties
		color?: string;
		size?: number;
		shape?: string;
	};
}

export interface CytoscapeEdge {
	data: {
		id: string;
		source: string;
		target: string;
		label: string;
		relationship: string;
		strength?: number;
	};
}

export class OntologyService {
	// Convert templates to hierarchical nodes
	static templatesToNodes(templates: any[]): CytoscapeNode[] {
		return templates.map((t) => ({
			data: {
				id: t.id,
				label: t.name,
				type: 'template',
				parent: t.parent_template_id,
				metadata: {
					scope: t.scope,
					status: t.status,
					isAbstract: t.is_abstract,
					schema: t.schema,
					defaultProps: t.default_props
				},
				color: t.is_abstract ? '#9ca3af' : '#3b82f6', // gray for abstract, blue for concrete
				shape: t.parent_template_id ? 'ellipse' : 'hexagon' // different shape for root nodes
			}
		}));
	}

	// Convert projects to nodes
	static projectsToNodes(projects: any[]): CytoscapeNode[] {
		return projects.map((p) => ({
			data: {
				id: p.id,
				label: p.name,
				type: 'project',
				metadata: {
					description: p.description,
					state: p.state_key,
					stage: p.facet_stage,
					context: p.facet_context,
					scale: p.facet_scale,
					createdBy: p.created_by,
					startAt: p.start_at,
					endAt: p.end_at
				},
				color: p.state_key === 'active' ? '#10b981' : '#f59e0b', // green for active, amber for others
				size: p.facet_scale === 'large' ? 40 : 30
			}
		}));
	}

	// Convert edges with relationship types
	static edgesToCytoscape(edges: any[]): CytoscapeEdge[] {
		return edges.map((e) => ({
			data: {
				id: e.id,
				source: e.src_id,
				target: e.dst_id,
				label: e.rel,
				relationship: e.rel,
				strength: e.props?.weight || 1
			}
		}));
	}

	// Build complete graph data
	static buildGraphData(data: any, viewMode: string) {
		let nodes: CytoscapeNode[] = [];
		let edges: CytoscapeEdge[] = [];

		switch (viewMode) {
			case 'templates':
				nodes = this.templatesToNodes(data.templates);
				// Filter edges to only template relationships
				edges = this.edgesToCytoscape(
					data.edges.filter((e) => e.src_kind === 'template' && e.dst_kind === 'template')
				);
				break;

			case 'projects':
				nodes = [
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.documentsToNodes(data.documents)
				];
				edges = this.edgesToCytoscape(data.edges);
				break;

			case 'full':
				// Include everything
				nodes = [
					...this.templatesToNodes(data.templates),
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.documentsToNodes(data.documents),
					...this.actorsToNodes(data.actors)
				];
				edges = this.edgesToCytoscape(data.edges);
				break;
		}

		return { nodes, edges };
	}
}
```

## 4. Graph Component (`OntologyGraph.svelte`)

```typescript
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import cytoscape from 'cytoscape';
  import dagre from 'cytoscape-dagre';
  import cola from 'cytoscape-cola';
  import coseBilkent from 'cytoscape-cose-bilkent';
  import { OntologyService } from './ontology.service';

  // Register layouts
  cytoscape.use(dagre);
  cytoscape.use(cola);
  cytoscape.use(coseBilkent);

  export let data;
  export let viewMode: string;
  export let selectedNode: any = null;
  export let graphInstance: any = null;

  let container: HTMLElement;
  let cy: cytoscape.Core;
  let currentLayout: string = 'dagre';

  onMount(() => {
    initializeGraph();
  });

  function initializeGraph() {
    const graphData = OntologyService.buildGraphData(data, viewMode);

    cy = cytoscape({
      container,
      elements: [...graphData.nodes, ...graphData.edges],

      style: [
        // Node styles
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'background-color': 'data(color)',
            'shape': 'data(shape)',
            'width': 'data(size)',
            'height': 'data(size)',
            'border-width': 2,
            'border-color': '#1f2937',
            'font-size': '12px',
            'text-wrap': 'wrap',
            'text-max-width': '80px'
          }
        },

        // Edge styles
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#9ca3af',
            'target-arrow-color': '#9ca3af',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '10px',
            'text-background-color': '#ffffff',
            'text-background-opacity': 0.8,
            'text-background-padding': '2px'
          }
        },

        // Selected node
        {
          selector: 'node:selected',
          style: {
            'background-color': '#fbbf24',
            'border-color': '#f59e0b',
            'border-width': 4
          }
        },

        // Hover effects
        {
          selector: 'node:hover',
          style: {
            'background-color': '#60a5fa'
          }
        }
      ],

      layout: getLayoutOptions(currentLayout),

      // Interaction options
      minZoom: 0.1,
      maxZoom: 4,
      wheelSensitivity: 0.1
    });

    // Event handlers
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      selectedNode = {
        ...node.data(),
        connectedEdges: node.connectedEdges().length,
        neighbors: node.neighborhood().nodes().length
      };
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        selectedNode = null;
      }
    });

    // Expose instance for external control
    graphInstance = {
      cy,
      changeLayout: (layoutName: string) => {
        currentLayout = layoutName;
        const layout = cy.layout(getLayoutOptions(layoutName));
        layout.run();
      },
      fitToView: () => cy.fit(),
      centerOnNode: (nodeId: string) => {
        const node = cy.getElementById(nodeId);
        cy.animate({
          center: { eles: node },
          zoom: 2
        }, { duration: 500 });
      },
      filterByType: (type: string) => {
        cy.nodes().style('opacity', 0.1);
        cy.edges().style('opacity', 0.1);
        cy.nodes(`[type="${type}"]`).style('opacity', 1);
        cy.nodes(`[type="${type}"]`).connectedEdges().style('opacity', 1);
      },
      resetFilters: () => {
        cy.nodes().style('opacity', 1);
        cy.edges().style('opacity', 1);
      },
      search: (query: string) => {
        const results = cy.nodes().filter(node =>
          node.data('label').toLowerCase().includes(query.toLowerCase())
        );
        if (results.length > 0) {
          cy.fit(results, 50);
          results.flashClass('highlight', 1000);
        }
      }
    };
  }

  function getLayoutOptions(layoutName: string) {
    const layouts = {
      dagre: {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 50,
        rankSep: 100,
        animate: true,
        animationDuration: 500
      },
      cola: {
        name: 'cola',
        animate: true,
        nodeSpacing: 50,
        flow: { axis: 'y' }
      },
      'cose-bilkent': {
        name: 'cose-bilkent',
        animate: true,
        idealEdgeLength: 100,
        nodeOverlap: 20
      },
      circle: {
        name: 'circle',
        animate: true
      }
    };

    return layouts[layoutName] || layouts.dagre;
  }

  // React to view mode changes
  $: if (cy && viewMode) {
    const graphData = OntologyService.buildGraphData(data, viewMode);
    cy.elements().remove();
    cy.add([...graphData.nodes, ...graphData.edges]);
    cy.layout(getLayoutOptions(currentLayout)).run();
  }
</script>

<div bind:this={container} class="w-full h-full" />

<style>
  :global(.highlight) {
    background-color: #fbbf24 !important;
  }
</style>
```

## 5. Controls Component (`GraphControls.svelte`)

```typescript
<script lang="ts">
  export let viewMode: string;
  export let graphInstance: any;
  export let stats: any;

  let searchQuery = '';
  let selectedLayout = 'dagre';
  let selectedFilter = 'all';

  const layouts = [
    { value: 'dagre', label: 'Hierarchical' },
    { value: 'cola', label: 'Force-directed' },
    { value: 'cose-bilkent', label: 'Spring' },
    { value: 'circle', label: 'Circular' }
  ];

  const filters = [
    { value: 'all', label: 'All Nodes' },
    { value: 'template', label: 'Templates Only' },
    { value: 'project', label: 'Projects Only' },
    { value: 'task', label: 'Tasks Only' },
    { value: 'document', label: 'Documents Only' }
  ];
</script>

<div class="space-y-6">
  <!-- Stats -->
  <div class="bg-blue-50 p-4 rounded-lg">
    <h3 class="font-semibold text-blue-900 mb-2">Ontology Stats</h3>
    <div class="space-y-1 text-sm">
      <div>Templates: {stats.totalTemplates}</div>
      <div>Active Projects: {stats.activeProjects}</div>
      <div>Relationships: {stats.totalEdges}</div>
    </div>
  </div>

  <!-- View Mode -->
  <div>
    <label class="block text-sm font-medium mb-2">View Mode</label>
    <select
      bind:value={viewMode}
      class="w-full px-3 py-2 border rounded-lg"
    >
      <option value="templates">Templates Hierarchy</option>
      <option value="projects">Projects & Tasks</option>
      <option value="full">Complete Ontology</option>
    </select>
  </div>

  <!-- Layout -->
  <div>
    <label class="block text-sm font-medium mb-2">Layout</label>
    <select
      bind:value={selectedLayout}
      on:change={() => graphInstance?.changeLayout(selectedLayout)}
      class="w-full px-3 py-2 border rounded-lg"
    >
      {#each layouts as layout}
        <option value={layout.value}>{layout.label}</option>
      {/each}
    </select>
  </div>

  <!-- Search -->
  <div>
    <label class="block text-sm font-medium mb-2">Search Nodes</label>
    <input
      bind:value={searchQuery}
      on:input={() => graphInstance?.search(searchQuery)}
      placeholder="Type to search..."
      class="w-full px-3 py-2 border rounded-lg"
    />
  </div>

  <!-- Filter -->
  <div>
    <label class="block text-sm font-medium mb-2">Filter</label>
    <select
      bind:value={selectedFilter}
      on:change={() => {
        if (selectedFilter === 'all') {
          graphInstance?.resetFilters();
        } else {
          graphInstance?.filterByType(selectedFilter);
        }
      }}
      class="w-full px-3 py-2 border rounded-lg"
    >
      {#each filters as filter}
        <option value={filter.value}>{filter.label}</option>
      {/each}
    </select>
  </div>

  <!-- Actions -->
  <div class="space-y-2">
    <button
      on:click={() => graphInstance?.fitToView()}
      class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
    >
      Fit to View
    </button>

    <button
      on:click={() => window.print()}
      class="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
    >
      Export as Image
    </button>
  </div>
</div>
```

## 6. Node Details Panel (`NodeDetails.svelte`)

```typescript
<script lang="ts">
  export let node: any;

  // Format the metadata for display
  function formatMetadata(metadata: any) {
    return Object.entries(metadata || {})
      .filter(([key, value]) => value !== null && value !== undefined)
      .map(([key, value]) => ({
        key: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value: typeof value === 'object' ? JSON.stringify(value, null, 2) : value
      }));
  }
</script>

<div class="p-6 space-y-6">
  <!-- Header -->
  <div class="border-b pb-4">
    <h2 class="text-xl font-bold">{node.label}</h2>
    <span class="inline-block px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 mt-2">
      {node.type}
    </span>
  </div>

  <!-- Basic Info -->
  <div>
    <h3 class="font-semibold mb-2">Basic Information</h3>
    <dl class="space-y-2 text-sm">
      <div class="flex justify-between">
        <dt class="text-gray-500">ID:</dt>
        <dd class="font-mono text-xs">{node.id}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-gray-500">Connections:</dt>
        <dd>{node.connectedEdges || 0}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-gray-500">Neighbors:</dt>
        <dd>{node.neighbors || 0}</dd>
      </div>
    </dl>
  </div>

  <!-- Metadata -->
  {#if node.metadata}
    <div>
      <h3 class="font-semibold mb-2">Properties</h3>
      <dl class="space-y-2 text-sm">
        {#each formatMetadata(node.metadata) as {key, value}}
          <div>
            <dt class="text-gray-500">{key}:</dt>
            <dd class="mt-1">
              {#if typeof value === 'string' && value.startsWith('{')}
                <pre class="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{value}</pre>
              {:else}
                {value}
              {/if}
            </dd>
          </div>
        {/each}
      </dl>
    </div>
  {/if}

  <!-- Actions -->
  <div class="pt-4 border-t space-y-2">
    <button class="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
      View in Detail
    </button>
    <button class="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
      Show Related
    </button>
  </div>
</div>
```

## Key Features to Implement

1. **Multi-View Modes**: Templates hierarchy, Projects view, Complete ontology
2. **Interactive Features**: Node selection, hover effects, zoom/pan
3. **Search & Filter**: Real-time node search, type-based filtering
4. **Layout Options**: Hierarchical, force-directed, circular layouts
5. **Node Details**: Show metadata, relationships, properties
6. **Visual Encoding**:
    - Colors by state/type
    - Shapes for different entity types
    - Size based on importance/scale
7. **Performance**: Handle 1000+ nodes smoothly using WebGL renderer
8. **Export**: Save as PNG/SVG for documentation

## Performance Considerations

- Use `cy.batch()` for bulk updates
- Implement virtual rendering for very large graphs
- Cache layout calculations
- Debounce search input
- Use compound nodes for grouping related entities

## Extension Ideas

1. Add mini-map navigation
2. Implement undo/redo for graph manipulations
3. Add context menus for nodes
4. Enable drag-and-drop to reorganize
5. Show animation for data flow between nodes
6. Add timeline view for temporal data
7. Implement clustering for large datasets

## Testing Approach

- Test with varying dataset sizes (10, 100, 1000+ nodes)
- Verify all entity types render correctly
- Test layout switching performance
- Ensure search works across all node properties
- Test responsive behavior on different screen sizes

This specification provides a complete foundation for implementing the ontology visualization. The implementing LLM should follow these patterns while adapting to your specific data structures and requirements.
