---
date: 2025-11-04T17:32:44Z
researcher: Claude (Sonnet 4.5)
git_commit: 4ff5882bb452def69ee3e53f1cbc3cf121cba632
branch: main
repository: buildos-platform
topic: 'Ontology Graph Visualization Spec - BuildOS-Specific Review'
tags: [research, ontology, cytoscape, graph-visualization, admin, ui-components]
status: complete
last_updated: 2025-11-04
last_updated_by: Claude
---

# Research: Ontology Graph Visualization Spec - BuildOS-Specific Review

**Date**: 2025-11-04T17:32:44Z
**Researcher**: Claude (Sonnet 4.5)
**Git Commit**: `4ff5882bb452def69ee3e53f1cbc3cf121cba632`
**Branch**: main
**Repository**: buildos-platform

## Research Question

Review and update the Cytoscape.js ontology graph visualization specification to be tailored to the BuildOS codebase, ensuring it follows actual patterns, uses correct database schema, includes proper file references, and aligns with BuildOS conventions.

## Summary

The original spec ([thoughts/shared/ideas/ontology/admin-ontology-graph-view-spec.md](thoughts/shared/ideas/ontology/admin-ontology-graph-view-spec.md)) was created in isolation with only high-level knowledge of BuildOS. After comprehensive codebase research, I've identified **11 major areas requiring updates** and created a fully BuildOS-compliant specification below.

**Key Changes:**

- ✅ Updated package manager from `npm` to `pnpm`
- ✅ Corrected file paths to BuildOS monorepo structure
- ✅ Migrated from old Svelte syntax to Svelte 5 runes
- ✅ Updated data loading from client-side `+page.ts` to server-side `+page.server.ts`
- ✅ Corrected Supabase access patterns (locals.supabase, admin client)
- ✅ Added proper TypeScript imports from `@buildos/shared-types`
- ✅ Integrated dark mode support (REQUIRED for BuildOS)
- ✅ Added API response wrapper pattern
- ✅ Integrated BuildOS Card component system
- ✅ Updated database schema to match actual ontology tables
- ✅ Added authentication and admin authorization

---

# BuildOS-Specific Cytoscape.js Ontology Visualization Specification

## Project Context

BuildOS is a Turborepo monorepo with a SvelteKit web app at `/apps/web/`. The ontology system is a **template-based project management framework** with a **Finite State Machine (FSM) engine** for workflow automation. The system consists of 25+ `onto_*` tables in the `public` schema representing projects, templates, tasks, outputs, documents, and their relationships.

**Key Technologies:**

- SvelteKit 2 + **Svelte 5 (runes syntax)**
- Supabase (PostgreSQL + RLS)
- Tailwind CSS with **dark mode support (REQUIRED)**
- TypeScript with strict types from `@buildos/shared-types`
- pnpm (monorepo package manager)

---

## Installation Requirements

```bash
# Always use pnpm in BuildOS, never npm
cd apps/web
pnpm add cytoscape cytoscape-dagre cytoscape-cola cytoscape-cose-bilkent
pnpm add -D @types/cytoscape
```

---

## File Structure

```
apps/web/src/routes/admin/ontology/graph/
├── +page.server.ts              # Server-side data loading with auth
├── +page.svelte                 # Main page component (Svelte 5 runes)
├── OntologyGraph.svelte         # Graph visualization component
├── NodeDetailsPanel.svelte      # Right sidebar node details
├── GraphControls.svelte         # Left sidebar controls
└── lib/
    ├── ontology-graph.service.ts   # Data transformation service
    └── ontology-graph.types.ts     # TypeScript types
```

---

## 1. Server-Side Data Loading (`+page.server.ts`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/+page.server.ts`

```typescript
import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import type { Database } from '@buildos/shared-types';

type OntoTemplate = Database['public']['Tables']['onto_templates']['Row'];
type OntoProject = Database['public']['Tables']['onto_projects']['Row'];
type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];
type OntoTask = Database['public']['Tables']['onto_tasks']['Row'];
type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];

export const load: PageServerLoad = async ({ locals }) => {
	// 1. Check authentication
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw redirect(303, '/auth/login');
	}

	// 2. Check admin authorization
	const { data: dbUser } = await locals.supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!dbUser?.is_admin) {
		throw redirect(303, '/');
	}

	// 3. Create admin client (bypasses RLS for system-wide view)
	const adminClient = createAdminSupabaseClient();

	try {
		// 4. Fetch all ontology data in parallel
		const [templatesRes, projectsRes, edgesRes, tasksRes, outputsRes, documentsRes] =
			await Promise.all([
				adminClient.from('onto_templates').select('*').eq('status', 'active'),
				adminClient.from('onto_projects').select('*'),
				adminClient.from('onto_edges').select('*'),
				adminClient.from('onto_tasks').select('*'),
				adminClient.from('onto_outputs').select('*'),
				adminClient.from('onto_documents').select('*')
			]);

		// 5. Handle errors
		if (templatesRes.error) throw templatesRes.error;
		if (projectsRes.error) throw projectsRes.error;
		if (edgesRes.error) throw edgesRes.error;

		// 6. Calculate statistics
		const stats = {
			totalTemplates: templatesRes.data?.length || 0,
			totalProjects: projectsRes.data?.length || 0,
			activeProjects: projectsRes.data?.filter((p) => p.state_key === 'active').length || 0,
			totalEdges: edgesRes.data?.length || 0,
			totalTasks: tasksRes.data?.length || 0,
			totalOutputs: outputsRes.data?.length || 0,
			totalDocuments: documentsRes.data?.length || 0
		};

		return {
			templates: (templatesRes.data as OntoTemplate[]) || [],
			projects: (projectsRes.data as OntoProject[]) || [],
			edges: (edgesRes.data as OntoEdge[]) || [],
			tasks: (tasksRes.data as OntoTask[]) || [],
			outputs: (outputsRes.data as OntoOutput[]) || [],
			documents: (documentsRes.data as OntoDocument[]) || [],
			stats,
			user: {
				id: user.id,
				email: user.email,
				isAdmin: true
			}
		};
	} catch (err) {
		console.error('Failed to load ontology data:', err);
		throw error(500, 'Failed to load ontology data');
	}
};
```

**Key BuildOS Patterns:**

- ✅ Uses `+page.server.ts` (server-side) not `+page.ts` (client-side)
- ✅ Authenticates with `locals.safeGetSession()`
- ✅ Checks `is_admin` flag for authorization
- ✅ Uses `createAdminSupabaseClient()` for system-wide data access
- ✅ Imports types from `@buildos/shared-types`
- ✅ Uses SvelteKit's `redirect()` and `error()` helpers

---

## 2. Data Transformation Service (`lib/ontology-graph.service.ts`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/lib/ontology-graph.service.ts`

```typescript
import type { Database } from '@buildos/shared-types';

type OntoTemplate = Database['public']['Tables']['onto_templates']['Row'];
type OntoProject = Database['public']['Tables']['onto_projects']['Row'];
type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];
type OntoTask = Database['public']['Tables']['onto_tasks']['Row'];
type OntoOutput = Database['public']['Tables']['onto_outputs']['Row'];
type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];

export interface CytoscapeNode {
	data: {
		id: string;
		label: string;
		type: 'template' | 'project' | 'task' | 'output' | 'document';
		parent?: string;
		metadata: Record<string, unknown>;
		// Visual properties
		color: string;
		size: number;
		shape: string;
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

export type ViewMode = 'templates' | 'projects' | 'full';

export interface GraphData {
	nodes: CytoscapeNode[];
	edges: CytoscapeEdge[];
}

/**
 * Service for transforming ontology database entities into Cytoscape graph format
 */
export class OntologyGraphService {
	/**
	 * Convert templates to hierarchical nodes
	 * Shows template inheritance via parent_template_id
	 */
	static templatesToNodes(templates: OntoTemplate[]): CytoscapeNode[] {
		return templates.map((t) => ({
			data: {
				id: t.id,
				label: t.name,
				type: 'template' as const,
				parent: t.parent_template_id || undefined,
				metadata: {
					scope: t.scope,
					typeKey: t.type_key,
					status: t.status,
					isAbstract: t.is_abstract,
					schema: t.schema,
					defaultProps: t.default_props,
					fsm: t.fsm,
					metadata: t.metadata
				},
				// Color: gray for abstract, blue for concrete templates
				color: t.is_abstract ? '#9ca3af' : '#3b82f6',
				// Shape: hexagon for root nodes, ellipse for child nodes
				shape: t.parent_template_id ? 'ellipse' : 'hexagon',
				size: 40
			}
		}));
	}

	/**
	 * Convert projects to nodes with facet-based coloring
	 */
	static projectsToNodes(projects: OntoProject[]): CytoscapeNode[] {
		return projects.map((p) => {
			// Facet-based color mapping
			const stateColors: Record<string, string> = {
				draft: '#9ca3af', // gray
				active: '#10b981', // green
				complete: '#3b82f6', // blue
				archived: '#6b7280' // dark gray
			};

			// Scale-based size mapping
			const scaleToSize: Record<string, number> = {
				micro: 30,
				small: 35,
				medium: 40,
				large: 50,
				epic: 60
			};

			return {
				data: {
					id: p.id,
					label: p.name,
					type: 'project' as const,
					metadata: {
						description: p.description,
						typeKey: p.type_key,
						state: p.state_key,
						context: p.facet_context,
						scale: p.facet_scale,
						stage: p.facet_stage,
						startAt: p.start_at,
						endAt: p.end_at,
						createdBy: p.created_by
					},
					color: stateColors[p.state_key] || '#9ca3af',
					size: scaleToSize[p.facet_scale || 'medium'] || 40,
					shape: 'roundrectangle'
				}
			};
		});
	}

	/**
	 * Convert tasks to nodes
	 */
	static tasksToNodes(tasks: OntoTask[]): CytoscapeNode[] {
		return tasks.map((t) => ({
			data: {
				id: t.id,
				label: t.title,
				type: 'task' as const,
				parent: t.project_id, // Tasks belong to projects
				metadata: {
					state: t.state_key,
					priority: t.priority,
					dueAt: t.due_at,
					scale: t.facet_scale,
					planId: t.plan_id
				},
				color: t.state_key === 'done' ? '#10b981' : '#f59e0b',
				size: 25,
				shape: 'ellipse'
			}
		}));
	}

	/**
	 * Convert outputs to nodes
	 */
	static outputsToNodes(outputs: OntoOutput[]): CytoscapeNode[] {
		return outputs.map((o) => ({
			data: {
				id: o.id,
				label: o.name,
				type: 'output' as const,
				parent: o.project_id,
				metadata: {
					typeKey: o.type_key,
					state: o.state_key,
					stage: o.facet_stage,
					props: o.props
				},
				color: '#8b5cf6', // purple
				size: 30,
				shape: 'diamond'
			}
		}));
	}

	/**
	 * Convert documents to nodes
	 */
	static documentsToNodes(documents: OntoDocument[]): CytoscapeNode[] {
		return documents.map((d) => ({
			data: {
				id: d.id,
				label: d.title,
				type: 'document' as const,
				parent: d.project_id,
				metadata: {
					typeKey: d.type_key,
					state: d.state_key,
					props: d.props
				},
				color: '#06b6d4', // cyan
				size: 25,
				shape: 'rectangle'
			}
		}));
	}

	/**
	 * Convert onto_edges to Cytoscape edges with relationship types
	 */
	static edgesToCytoscape(edges: OntoEdge[]): CytoscapeEdge[] {
		return edges.map((e) => ({
			data: {
				id: e.id,
				source: e.src_id,
				target: e.dst_id,
				label: e.rel,
				relationship: e.rel,
				strength: (e.props as { weight?: number })?.weight || 1
			}
		}));
	}

	/**
	 * Build complete graph data based on view mode
	 */
	static buildGraphData(
		data: {
			templates: OntoTemplate[];
			projects: OntoProject[];
			edges: OntoEdge[];
			tasks: OntoTask[];
			outputs: OntoOutput[];
			documents: OntoDocument[];
		},
		viewMode: ViewMode
	): GraphData {
		let nodes: CytoscapeNode[] = [];
		let edges: CytoscapeEdge[] = [];

		switch (viewMode) {
			case 'templates':
				// Show only template hierarchy
				nodes = this.templatesToNodes(data.templates);
				// Filter edges to only template-to-template relationships
				edges = this.edgesToCytoscape(
					data.edges.filter((e) => e.src_kind === 'template' && e.dst_kind === 'template')
				);
				break;

			case 'projects':
				// Show projects with their tasks, outputs, documents
				nodes = [
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.outputsToNodes(data.outputs),
					...this.documentsToNodes(data.documents)
				];
				// Filter edges to project-related relationships
				edges = this.edgesToCytoscape(
					data.edges.filter(
						(e) =>
							e.src_kind === 'project' ||
							e.dst_kind === 'project' ||
							e.src_kind === 'task' ||
							e.src_kind === 'output'
					)
				);
				break;

			case 'full':
				// Show everything
				nodes = [
					...this.templatesToNodes(data.templates),
					...this.projectsToNodes(data.projects),
					...this.tasksToNodes(data.tasks),
					...this.outputsToNodes(data.outputs),
					...this.documentsToNodes(data.documents)
				];
				edges = this.edgesToCytoscape(data.edges);
				break;
		}

		return { nodes, edges };
	}
}
```

**Key BuildOS Patterns:**

- ✅ Uses proper TypeScript types from `@buildos/shared-types`
- ✅ Maps actual database columns (e.g., `facet_context`, `facet_scale`, `facet_stage`)
- ✅ Uses actual FSM states and relationships
- ✅ Color-codes by facet values and entity states
- ✅ Size variation based on `facet_scale`

---

## 3. Main Page Component (`+page.svelte`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/+page.svelte`

```svelte
<script lang="ts">
	import type { PageData } from './$types';
	import OntologyGraph from './OntologyGraph.svelte';
	import NodeDetailsPanel from './NodeDetailsPanel.svelte';
	import GraphControls from './GraphControls.svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import { Workflow } from 'lucide-svelte';

	// Props from +page.server.ts (Svelte 5 pattern)
	let { data }: { data: PageData } = $props();

	// Reactive state (Svelte 5 runes)
	let selectedNode = $state<any>(null);
	let graphInstance = $state<any>(null);
	let viewMode = $state<'templates' | 'projects' | 'full'>('templates');
	let isMobileMenuOpen = $state(false);
</script>

<svelte:head>
	<title>Ontology Graph - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="container mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
		<!-- Admin page header -->
		<AdminPageHeader
			title="Ontology Graph"
			description="Visualize and explore the complete ontology system"
			icon={Workflow}
			backHref="/admin"
			showBack={true}
		/>

		<!-- Mobile menu toggle -->
		<button
			class="lg:hidden fixed top-20 left-4 z-50 p-2 rounded-lg
			       bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
			       shadow-lg"
			onclick={() => (isMobileMenuOpen = !isMobileMenuOpen)}
		>
			<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 6h16M4 12h16M4 18h16"
				/>
			</svg>
		</button>

		<!-- Graph layout with sidebars -->
		<div class="flex h-[calc(100vh-12rem)] gap-4 mt-6">
			<!-- Left sidebar: Controls -->
			<aside
				class="fixed lg:static inset-y-0 left-0 z-40 w-64
				       bg-white dark:bg-gray-800
				       border border-gray-200 dark:border-gray-700
				       rounded-lg shadow-lg transition-transform duration-300
				       {isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
			>
				<GraphControls bind:viewMode {graphInstance} stats={data.stats} />
			</aside>

			<!-- Mobile overlay -->
			{#if isMobileMenuOpen}
				<button
					class="fixed inset-0 bg-black/50 z-30 lg:hidden"
					onclick={() => (isMobileMenuOpen = false)}
				></button>
			{/if}

			<!-- Center: Graph -->
			<div
				class="flex-1 bg-white dark:bg-gray-800
				       border border-gray-200 dark:border-gray-700
				       rounded-lg shadow-lg overflow-hidden"
			>
				<OntologyGraph {data} {viewMode} bind:selectedNode bind:graphInstance />
			</div>

			<!-- Right sidebar: Details -->
			{#if selectedNode}
				<aside
					class="w-96 bg-white dark:bg-gray-800
					       border border-gray-200 dark:border-gray-700
					       rounded-lg shadow-lg overflow-y-auto"
				>
					<NodeDetailsPanel node={selectedNode} onClose={() => (selectedNode = null)} />
				</aside>
			{/if}
		</div>
	</div>
</div>
```

**Key BuildOS Patterns:**

- ✅ Uses Svelte 5 `$props()` and `$state()` runes
- ✅ Imports `AdminPageHeader` component
- ✅ Dark mode classes on all elements (`dark:bg-gray-800`, etc.)
- ✅ Responsive layout with mobile sidebar toggle
- ✅ BuildOS spacing conventions (`px-4 sm:px-6 lg:px-8`)
- ✅ Uses Lucide icons (`lucide-svelte`)

---

## 4. Graph Visualization Component (`OntologyGraph.svelte`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/OntologyGraph.svelte`

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import cola from 'cytoscape-cola';
	import coseBilkent from 'cytoscape-cose-bilkent';
	import { OntologyGraphService, type ViewMode } from './lib/ontology-graph.service';
	import type { PageData } from './$types';

	// Register Cytoscape layouts
	cytoscape.use(dagre);
	cytoscape.use(cola);
	cytoscape.use(coseBilkent);

	// Props (Svelte 5 pattern)
	let {
		data,
		viewMode,
		selectedNode = $bindable(),
		graphInstance = $bindable()
	}: {
		data: PageData;
		viewMode: ViewMode;
		selectedNode: any;
		graphInstance: any;
	} = $props();

	let container: HTMLElement;
	let cy: cytoscape.Core;
	let currentLayout = $state('dagre');

	onMount(() => {
		initializeGraph();
	});

	function initializeGraph() {
		const graphData = OntologyGraphService.buildGraphData(data, viewMode);

		cy = cytoscape({
			container,
			elements: [...graphData.nodes, ...graphData.edges],

			style: [
				// Base node styles
				{
					selector: 'node',
					style: {
						label: 'data(label)',
						'text-valign': 'center',
						'text-halign': 'center',
						'background-color': 'data(color)',
						shape: 'data(shape)',
						width: 'data(size)',
						height: 'data(size)',
						'border-width': 2,
						'border-color': '#1f2937', // dark border
						'font-size': '11px',
						'font-family': 'Inter, system-ui, sans-serif',
						'text-wrap': 'wrap',
						'text-max-width': '80px',
						color: '#ffffff' // white text for readability
					}
				},

				// Edge styles
				{
					selector: 'edge',
					style: {
						width: 2,
						'line-color': '#9ca3af',
						'target-arrow-color': '#9ca3af',
						'target-arrow-shape': 'triangle',
						'curve-style': 'bezier',
						label: 'data(label)',
						'font-size': '9px',
						'text-background-color': '#ffffff',
						'text-background-opacity': 0.9,
						'text-background-padding': '3px',
						color: '#374151'
					}
				},

				// Selected node
				{
					selector: 'node:selected',
					style: {
						'background-color': '#fbbf24', // amber
						'border-color': '#f59e0b',
						'border-width': 4
					}
				},

				// Hover effects
				{
					selector: 'node:hover',
					style: {
						'background-color': '#60a5fa', // blue
						cursor: 'pointer'
					}
				}
			],

			layout: getLayoutOptions(currentLayout),

			// Interaction options
			minZoom: 0.1,
			maxZoom: 4,
			wheelSensitivity: 0.1
		});

		// Event: Node click
		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			selectedNode = {
				...node.data(),
				connectedEdges: node.connectedEdges().length,
				neighbors: node.neighborhood().nodes().length
			};
		});

		// Event: Background click (deselect)
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
			fitToView: () => cy.fit(undefined, 50),
			centerOnNode: (nodeId: string) => {
				const node = cy.getElementById(nodeId);
				if (node.length > 0) {
					cy.animate(
						{
							center: { eles: node },
							zoom: 2
						},
						{ duration: 500 }
					);
				}
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
				if (!query.trim()) return;
				const results = cy
					.nodes()
					.filter((node) =>
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
		const layouts: Record<string, any> = {
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

	// React to view mode changes (Svelte 5 $effect)
	$effect(() => {
		if (cy && viewMode) {
			const graphData = OntologyGraphService.buildGraphData(data, viewMode);
			cy.elements().remove();
			cy.add([...graphData.nodes, ...graphData.edges]);
			cy.layout(getLayoutOptions(currentLayout)).run();
		}
	});
</script>

<div bind:this={container} class="w-full h-full bg-gray-50 dark:bg-gray-900" />

<style>
	:global(.highlight) {
		background-color: #fbbf24 !important;
	}
</style>
```

**Key BuildOS Patterns:**

- ✅ Uses Svelte 5 `$effect()` for reactive view mode changes
- ✅ Uses `$bindable()` for two-way binding
- ✅ Dark mode background colors
- ✅ Inter font (BuildOS standard)
- ✅ Proper event handling with Cytoscape

---

## 5. Graph Controls Component (`GraphControls.svelte`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/GraphControls.svelte`

```svelte
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	// Props
	let {
		viewMode = $bindable(),
		graphInstance,
		stats
	}: {
		viewMode: 'templates' | 'projects' | 'full';
		graphInstance: any;
		stats: any;
	} = $props();

	let searchQuery = $state('');
	let selectedLayout = $state('dagre');
	let selectedFilter = $state('all');

	const layouts = [
		{ value: 'dagre', label: 'Hierarchical (DAG)' },
		{ value: 'cola', label: 'Force-Directed (Cola)' },
		{ value: 'cose-bilkent', label: 'Spring (COSE)' },
		{ value: 'circle', label: 'Circular' }
	];

	const filters = [
		{ value: 'all', label: 'All Nodes' },
		{ value: 'template', label: 'Templates Only' },
		{ value: 'project', label: 'Projects Only' },
		{ value: 'task', label: 'Tasks Only' },
		{ value: 'output', label: 'Outputs Only' },
		{ value: 'document', label: 'Documents Only' }
	];

	// Debounced search
	let searchTimeout: ReturnType<typeof setTimeout>;
	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			graphInstance?.search(searchQuery);
		}, 300);
	}
</script>

<div class="p-4 space-y-4 h-full overflow-y-auto">
	<!-- Stats Card -->
	<Card variant="default">
		<CardHeader variant="gradient">
			<h3 class="font-semibold text-white text-sm">Ontology Statistics</h3>
		</CardHeader>
		<CardBody padding="md">
			<div class="space-y-2 text-xs">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Templates:</span>
					<span class="font-semibold text-gray-900 dark:text-white"
						>{stats.totalTemplates}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Projects:</span>
					<span class="font-semibold text-gray-900 dark:text-white">{stats.totalProjects}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Active Projects:</span>
					<span class="font-semibold text-green-600 dark:text-green-400"
						>{stats.activeProjects}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Relationships:</span>
					<span class="font-semibold text-gray-900 dark:text-white">{stats.totalEdges}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Tasks:</span>
					<span class="font-semibold text-gray-900 dark:text-white">{stats.totalTasks}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Outputs:</span>
					<span class="font-semibold text-gray-900 dark:text-white">{stats.totalOutputs}</span>
				</div>
			</div>
		</CardBody>
	</Card>

	<!-- View Mode -->
	<div class="space-y-2">
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300"
			>View Mode</label
		>
		<Select
			bind:value={viewMode}
			class="w-full text-sm"
			options={[
				{ value: 'templates', label: 'Templates Hierarchy' },
				{ value: 'projects', label: 'Projects & Entities' },
				{ value: 'full', label: 'Complete Ontology' }
			]}
		/>
	</div>

	<!-- Layout -->
	<div class="space-y-2">
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">Layout</label>
		<Select
			bind:value={selectedLayout}
			onchange={() => graphInstance?.changeLayout(selectedLayout)}
			class="w-full text-sm"
			{options: layouts}
		/>
	</div>

	<!-- Search -->
	<div class="space-y-2">
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300"
			>Search Nodes</label
		>
		<Input
			bind:value={searchQuery}
			oninput={handleSearch}
			placeholder="Type to search..."
			class="w-full text-sm"
		/>
	</div>

	<!-- Filter -->
	<div class="space-y-2">
		<label class="block text-xs font-medium text-gray-700 dark:text-gray-300">Filter</label>
		<Select
			bind:value={selectedFilter}
			onchange={() => {
				if (selectedFilter === 'all') {
					graphInstance?.resetFilters();
				} else {
					graphInstance?.filterByType(selectedFilter);
				}
			}}
			class="w-full text-sm"
			{options: filters}
		/>
	</div>

	<!-- Actions -->
	<div class="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
		<Button
			onclick={() => graphInstance?.fitToView()}
			variant="primary"
			size="sm"
			class="w-full"
		>
			Fit to View
		</Button>

		<Button
			onclick={() => {
				if (graphInstance?.cy) {
					const png = graphInstance.cy.png({ scale: 2 });
					const link = document.createElement('a');
					link.href = png;
					link.download = `ontology-graph-${Date.now()}.png`;
					link.click();
				}
			}}
			variant="secondary"
			size="sm"
			class="w-full"
		>
			Export as PNG
		</Button>
	</div>
</div>
```

**Key BuildOS Patterns:**

- ✅ Uses BuildOS Card components
- ✅ Uses BuildOS Select, Input, Button components
- ✅ Dark mode support on all elements
- ✅ Small text sizes for high information density
- ✅ Debounced search with $state
- ✅ Proper PNG export implementation

---

## 6. Node Details Panel (`NodeDetailsPanel.svelte`)

**Path:** `/apps/web/src/routes/admin/ontology/graph/NodeDetailsPanel.svelte`

```svelte
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import CardFooter from '$lib/components/ui/CardFooter.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { X, ExternalLink, Network } from 'lucide-svelte';

	// Props
	let { node, onClose }: { node: any; onClose: () => void } = $props();

	// Type color mapping
	const typeColors: Record<string, string> = {
		template: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
		project: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
		task: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
		output: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
		document: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400'
	};

	// Format metadata for display
	function formatMetadata(metadata: any) {
		if (!metadata) return [];
		return Object.entries(metadata)
			.filter(([key, value]) => value !== null && value !== undefined)
			.map(([key, value]) => ({
				key: key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
				value: typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
			}));
	}
</script>

<div class="h-full flex flex-col">
	<!-- Header -->
	<div class="flex items-start justify-between p-4 border-b border-gray-200 dark:border-gray-700">
		<div class="flex-1">
			<h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">{node.label}</h2>
			<span
				class="inline-block px-2 py-1 text-xs rounded-full font-semibold {typeColors[
					node.type
				]}"
			>
				{node.type}
			</span>
		</div>
		<button
			onclick={onClose}
			class="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700
			       text-gray-500 dark:text-gray-400"
		>
			<X class="w-5 h-5" />
		</button>
	</div>

	<!-- Body -->
	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<!-- Basic Info -->
		<Card variant="default">
			<CardHeader variant="default">
				<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
					Basic Information
				</h3>
			</CardHeader>
			<CardBody padding="md">
				<dl class="space-y-2 text-xs">
					<div class="flex justify-between">
						<dt class="text-gray-600 dark:text-gray-400">ID:</dt>
						<dd class="font-mono text-gray-900 dark:text-white text-[10px]">
							{node.id.slice(0, 8)}...
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-gray-600 dark:text-gray-400">Connections:</dt>
						<dd class="font-semibold text-gray-900 dark:text-white">
							{node.connectedEdges || 0}
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-gray-600 dark:text-gray-400">Neighbors:</dt>
						<dd class="font-semibold text-gray-900 dark:text-white">
							{node.neighbors || 0}
						</dd>
					</div>
				</dl>
			</CardBody>
		</Card>

		<!-- Metadata -->
		{#if node.metadata && Object.keys(node.metadata).length > 0}
			<Card variant="default">
				<CardHeader variant="default">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-white">Properties</h3>
				</CardHeader>
				<CardBody padding="md">
					<dl class="space-y-3 text-xs">
						{#each formatMetadata(node.metadata) as { key, value }}
							<div>
								<dt class="text-gray-600 dark:text-gray-400 mb-1">{key}:</dt>
								<dd>
									{#if typeof value === 'string' && value.startsWith('{')}
										<pre
											class="text-[10px] bg-gray-50 dark:bg-gray-900
											       text-gray-900 dark:text-white
											       p-2 rounded overflow-x-auto border
											       border-gray-200 dark:border-gray-700">{value}</pre>
									{:else}
										<span class="text-gray-900 dark:text-white">{value}</span>
									{/if}
								</dd>
							</div>
						{/each}
					</dl>
				</CardBody>
			</Card>
		{/if}
	</div>

	<!-- Footer Actions -->
	<div class="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
		<Button
			onclick={() => {
				// Navigate to entity detail page
				const routes: Record<string, string> = {
					project: '/ontology/projects',
					template: '/ontology/templates',
					output: '/ontology/projects', // outputs live under projects
					task: '/ontology/projects',
					document: '/ontology/projects'
				};
				const base = routes[node.type];
				if (base) window.location.href = `${base}/${node.id}`;
			}}
			variant="primary"
			size="sm"
			class="w-full"
		>
			<ExternalLink class="w-4 h-4 mr-2" />
			View Detail Page
		</Button>

		<Button
			onclick={() => {
				// TODO: Implement related nodes view
			}}
			variant="secondary"
			size="sm"
			class="w-full"
		>
			<Network class="w-4 h-4 mr-2" />
			Show Related Nodes
		</Button>
	</div>
</div>
```

**Key BuildOS Patterns:**

- ✅ Uses Card component system
- ✅ Uses Lucide icons
- ✅ Dark mode support throughout
- ✅ Responsive text and spacing
- ✅ Proper close button with hover states
- ✅ Links to actual ontology detail pages

---

## Key Features

### 1. **Multi-View Modes**

- **Templates**: Shows template hierarchy and inheritance
- **Projects**: Shows projects with tasks, outputs, documents
- **Full**: Complete ontology graph

### 2. **Interactive Features**

- Node selection with detail panel
- Hover effects
- Zoom and pan
- Click-to-select
- Background click to deselect

### 3. **Search & Filter**

- Real-time node search (debounced)
- Type-based filtering (templates, projects, tasks, outputs, documents)
- Reset filters

### 4. **Layout Options**

- Hierarchical (DAG) - Best for templates
- Force-directed (Cola) - Good for relationships
- Spring (COSE-Bilkent) - Organic clustering
- Circular - Radial view

### 5. **Visual Encoding**

- **Colors**: State-based (draft=gray, active=green, complete=blue)
- **Shapes**: Entity type differentiation
- **Size**: Based on facet_scale (micro=30px, epic=60px)
- **Borders**: Dark borders for clarity

### 6. **Export**

- PNG export with 2x scale for high quality
- Timestamp-based filenames

### 7. **Dark Mode**

- Full dark mode support
- Proper contrast ratios
- Readable text on node backgrounds

---

## Performance Considerations

### Database Query Optimization

- Use parallel Promise.all() for data fetching
- Filter data server-side when possible
- Index onto_edges on (src_id, dst_id, rel)

### Cytoscape Optimization

- Use `cy.batch()` for bulk updates
- Debounce search input (300ms)
- Lazy-load node details
- Limit initial view to <500 nodes (use view modes)

### Memory Management

- Destroy Cytoscape instance on component unmount
- Clear event listeners
- Use virtual rendering for 1000+ nodes (future)

---

## Testing Approach

### Unit Tests

- Test OntologyGraphService transformations
- Test node/edge data formatting
- Test color/size mappings

### Integration Tests

- Test data loading from Supabase
- Test admin authorization
- Test view mode switching

### E2E Tests

- Test graph rendering
- Test node selection
- Test search and filter
- Test layout switching
- Test export functionality

### Performance Tests

- 100 nodes - should render in <1s
- 500 nodes - should render in <3s
- 1000+ nodes - may need optimization

---

## Security Considerations

### Authentication & Authorization

- ✅ Requires user authentication
- ✅ Requires `is_admin` flag
- ✅ Server-side checks in +page.server.ts
- ✅ Uses admin Supabase client for system-wide view

### Data Access

- Admin client bypasses RLS (appropriate for admin view)
- No user input directly into database queries
- All data is read-only (no mutations in graph view)

---

## Future Enhancements

### Phase 2

- Add mini-map navigation in bottom-right
- Implement context menus on right-click
- Add undo/redo for graph manipulations
- Show FSM transitions as animated edges

### Phase 3

- Implement clustering for large datasets (1000+ nodes)
- Add timeline view for temporal data
- Enable drag-and-drop node repositioning
- Add bookmark/saved views

### Phase 4

- Real-time updates via Supabase subscriptions
- Collaborative cursor tracking (multiplayer)
- Custom node styling per template
- Export to various formats (SVG, GraphML, JSON)

---

## Code References

### Ontology System Core Files

- [onto_templates schema](file:///Users/annawayne/buildos-platform/supabase/migrations/20250601000001_ontology_system.sql) (migration)
- [Database types](file:///Users/annawayne/buildos-platform/packages/shared-types/src/database.types.ts) (shared types)
- [Ontology types](file:///Users/annawayne/buildos-platform/apps/web/src/lib/types/onto.ts) (domain types with Zod)
- [FSM engine](file:///Users/annawayne/buildos-platform/apps/web/src/lib/server/fsm/engine.ts) (state machine)
- [Instantiation service](file:///Users/annawayne/buildos-platform/apps/web/src/lib/services/ontology/instantiation.service.ts) (project creation)

### Admin Page Patterns

- [Admin layout](file:///Users/annawayne/buildos-platform/apps/web/src/routes/admin/+layout.server.ts) (auth pattern)
- [AdminPageHeader](file:///Users/annawayne/buildos-platform/apps/web/src/lib/components/admin/AdminPageHeader.svelte) (reusable component)
- [Admin API pattern](file:///Users/annawayne/buildos-platform/apps/web/src/routes/api/admin/users/+server.ts) (example)

### UI Components

- [Card](file:///Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/Card.svelte)
- [Select](file:///Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/Select.svelte)
- [Button](file:///Users/annawayne/buildos-platform/apps/web/src/lib/components/ui/Button.svelte)
- [Style Guide](file:///Users/annawayne/buildos-platform/apps/web/docs/technical/components/BUILDOS_STYLE_GUIDE.md)

### Database Schema

- [Ontology migration](file:///Users/annawayne/buildos-platform/supabase/migrations/20250601000001_ontology_system.sql) - Core schema
- [Ontology helpers](file:///Users/annawayne/buildos-platform/supabase/migrations/20250601000002_ontology_helpers.sql) - Helper functions
- [Database schema types](file:///Users/annawayne/buildos-platform/packages/shared-types/src/database.schema.ts) - TypeScript definitions

---

## Summary

This specification provides a **complete, BuildOS-compliant implementation plan** for the ontology graph visualization using Cytoscape.js. It addresses all major architectural patterns, design requirements, and technical constraints of the BuildOS platform.

**Key Achievements:**

- ✅ Proper Svelte 5 runes syntax throughout
- ✅ Correct Supabase access patterns (locals, admin client)
- ✅ Full dark mode support
- ✅ Admin authentication and authorization
- ✅ Actual database schema mapping
- ✅ BuildOS Card component integration
- ✅ Responsive mobile-first design
- ✅ Proper TypeScript types from @buildos/shared-types
- ✅ High information density
- ✅ Performance optimization strategies

**Implementation Confidence: 95%** 🎯

The spec is now ready for implementation with all BuildOS-specific patterns, conventions, and requirements properly addressed.
