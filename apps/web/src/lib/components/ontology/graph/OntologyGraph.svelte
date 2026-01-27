<!-- apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte -->
<!--
	Ontology Graph Visualization Component

	A Cytoscape-powered graph visualization with semantically meaningful styling:
	- Shape carries primary meaning (instantly recognizable silhouettes)
	- Color indicates state (active, complete, blocked, etc.)
	- Size reflects scale/importance
	- Border style shows entity lifecycle stage

	Design Spec: /apps/web/docs/technical/components/ONTOLOGY_GRAPH_DESIGN_SPEC.md

	Shape Reference:
	- Project: round-rectangle (container)
	- Goal: star (north star)
	- Task: ellipse (atomic work)
	- Plan: round-rectangle dashed (temporal scaffolding)
	- Document: rectangle (knowledge page)
	- Milestone: triangle (checkpoint)
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import cola from 'cytoscape-cola';
	import coseBilkent from 'cytoscape-cose-bilkent';
	import { OntologyGraphService, GRAPH_COLORS } from './lib/graph.service';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from './lib/graph.types';

	// Register Cytoscape plugins once
	const CYTOSCAPE_PLUGINS_KEY = '__buildos_cytoscape_layouts_registered__';
	if (!(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_PLUGINS_KEY]) {
		cytoscape.use(dagre);
		cytoscape.use(cola);
		cytoscape.use(coseBilkent);
		(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_PLUGINS_KEY] = true;
	}

	let {
		data,
		viewMode,
		selectedNode = $bindable<GraphNode | null>(),
		graphInstance = $bindable<OntologyGraphInstance | null>()
	}: {
		data: GraphSourceData;
		viewMode: ViewMode;
		selectedNode: GraphNode | null;
		graphInstance: OntologyGraphInstance | null;
	} = $props();

	let container: HTMLElement;
	let cy: cytoscape.Core | null = null;
	let currentLayout = $state('dagre');
	let highlightTimeouts: Array<ReturnType<typeof setTimeout>> = [];

	// Dark mode detection
	let isDark = $state(false);

	onMount(() => {
		// Check initial dark mode state
		isDark = document.documentElement.classList.contains('dark');

		// Watch for dark mode changes
		const observer = new MutationObserver((mutations) => {
			mutations.forEach((mutation) => {
				if (mutation.attributeName === 'class') {
					const newIsDark = document.documentElement.classList.contains('dark');
					if (newIsDark !== isDark) {
						isDark = newIsDark;
						// Rebuild graph with new colors
						if (cy) {
							rebuildGraphColors();
						}
					}
				}
			});
		});

		observer.observe(document.documentElement, { attributes: true });

		initializeGraph();

		return () => {
			observer.disconnect();
			destroyGraph();
		};
	});

	onDestroy(() => {
		destroyGraph();
	});

	function destroyGraph() {
		highlightTimeouts.forEach((timeout) => clearTimeout(timeout));
		highlightTimeouts = [];

		if (cy) {
			cy.destroy();
			cy = null;
		}

		graphInstance = null;
	}

	/**
	 * Get the Cytoscape style array based on current theme.
	 */
	function getCytoscapeStyles(): cytoscape.StylesheetStyle[] {
		const accent = isDark ? GRAPH_COLORS.accent.dark : GRAPH_COLORS.accent.light;
		const labelColor = isDark ? '#e2e8f0' : '#1e293b';
		const labelBg = isDark ? '#1e293b' : '#ffffff';

		return [
			// Base node style - uses data-driven properties
			{
				selector: 'node',
				style: {
					// Shape and size from data
					shape: 'data(shape)' as any,
					width: 'data(width)' as any,
					height: 'data(height)' as any,
					// Colors from data
					'background-color': 'data(color)' as any,
					'border-color': 'data(borderColor)' as any,
					'border-width': 'data(borderWidth)' as any,
					// Label styling
					label: 'data(label)' as any,
					'font-size': 'data(fontSize)' as any,
					'font-family': 'Inter, system-ui, sans-serif',
					'font-weight': 'data(fontWeight)' as any,
					'text-valign': 'data(labelValign)' as any,
					'text-halign': 'center',
					'text-wrap': 'wrap',
					'text-max-width': '75px',
					'text-margin-y': 'data(labelMarginY)' as any,
					color: labelColor
				}
			},
			// Draft state - dotted border
			{
				selector: 'node[state = "draft"]',
				style: {
					'border-style': 'dotted'
				}
			},
			// Review/pending state - dashed border
			{
				selector: 'node[state = "review"], node[state = "pending"]',
				style: {
					'border-style': 'dashed'
				}
			},
			// Plans always have dashed border
			{
				selector: 'node[type = "plan"]',
				style: {
					'border-style': 'dashed'
				}
			},
			// Blocked state - thick red border, attention-grabbing
			{
				selector: 'node[state = "blocked"]',
				style: {
					'border-width': 3,
					'border-color': isDark ? '#f87171' : '#ef4444'
				}
			},
			// Base edge style
			{
				selector: 'edge',
				style: {
					width: 'data(width)' as any,
					'line-color': 'data(color)' as any,
					'target-arrow-color': 'data(color)' as any,
					'target-arrow-shape': 'data(arrowShape)' as any,
					'curve-style': 'bezier',
					'line-style': 'data(lineStyle)' as any,
					// Edge labels (hidden by default for cleaner look)
					label: '',
					'font-size': '8px',
					'text-background-color': labelBg,
					'text-background-opacity': 0.9,
					'text-background-padding': '2px',
					color: isDark ? '#94a3b8' : '#64748b'
				}
			},
			// Blocking edges - stand out more
			{
				selector: 'edge[category = "blocking"]',
				style: {
					'line-style': 'solid',
					width: 3
				}
			},
			// Hover state - accent border, slight scale
			{
				selector: 'node.hover',
				style: {
					'border-color': accent,
					'border-width': 3,
					'z-index': 999
				}
			},
			// Selected state - accent colors, strong highlight
			{
				selector: 'node:selected',
				style: {
					'background-color': isDark ? '#431407' : '#fff7ed',
					'border-color': accent,
					'border-width': 4,
					'z-index': 1000
				}
			},
			// Highlight state (search results)
			{
				selector: 'node.highlight',
				style: {
					'background-color': isDark ? '#451a03' : '#fef3c7',
					'border-color': isDark ? '#fbbf24' : '#f59e0b',
					'border-width': 4
				}
			},
			// Connected edges of selected node
			{
				selector: 'node:selected ~ edge',
				style: {
					'line-color': accent,
					'target-arrow-color': accent,
					width: 3,
					'z-index': 998
				}
			},
			// Dimmed state (for filtering)
			{
				selector: 'node.dimmed, edge.dimmed',
				style: {
					opacity: 0.15
				}
			},
			// Faded state (related but not primary)
			{
				selector: 'node.faded',
				style: {
					opacity: 0.5
				}
			}
		];
	}

	/**
	 * Rebuild graph with updated colors (for theme changes).
	 */
	function rebuildGraphColors() {
		if (!cy) return;

		const graphData = OntologyGraphService.buildGraphData(data, viewMode, isDark);

		cy.batch(() => {
			// Update node data
			graphData.nodes.forEach((node) => {
				const existing = cy!.getElementById(node.data.id);
				if (existing.length > 0) {
					existing.data(node.data);
				}
			});

			// Update edge data
			graphData.edges.forEach((edge) => {
				const existing = cy!.getElementById(edge.data.id);
				if (existing.length > 0) {
					existing.data(edge.data);
				}
			});
		});

		// Update styles
		cy.style(getCytoscapeStyles() as any);
	}

	function initializeGraph() {
		destroyGraph();

		const graphData = OntologyGraphService.buildGraphData(data, viewMode, isDark);

		cy = cytoscape({
			container,
			elements: [...graphData.nodes, ...graphData.edges],
			style: getCytoscapeStyles() as any,
			layout: getLayoutOptions(currentLayout),
			minZoom: 0.1,
			maxZoom: 4,
			wheelSensitivity: 0.35
		});

		// Node tap - select
		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			selectedNode = {
				...(node.data() as GraphNode),
				connectedEdges: node.connectedEdges().length,
				neighbors: node.neighborhood().nodes().length
			};
		});

		// Background tap - deselect
		cy.on('tap', (evt) => {
			if (evt.target === cy) {
				selectedNode = null;
			}
		});

		// Hover effects
		cy.on('mouseover', 'node', (evt) => {
			const node = evt.target;
			node.addClass('hover');

			// Show edge labels on connected edges
			node.connectedEdges().style({ label: 'data(label)' });
		});

		cy.on('mouseout', 'node', (evt) => {
			const node = evt.target;
			node.removeClass('hover');

			// Hide edge labels
			node.connectedEdges().style({ label: '' });
		});

		graphInstance = buildGraphInstance();
	}

	function buildGraphInstance(): OntologyGraphInstance | null {
		if (!cy) return null;

		const api: OntologyGraphInstance = {
			cy,
			changeLayout: (layoutName: string) => {
				if (!cy) return;
				currentLayout = layoutName;
				const layout = cy.layout(getLayoutOptions(layoutName));
				layout.run();
			},
			fitToView: () => {
				if (!cy) return;
				cy.fit(undefined, 50);
			},
			centerOnNode: (nodeId: string) => {
				if (!cy) return;
				const node = cy.getElementById(nodeId);
				if (node && node.length > 0) {
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
				if (!cy) return;
				cy.batch(() => {
					// Dim all nodes and edges
					cy!.nodes().addClass('dimmed');
					cy!.edges().addClass('dimmed');

					// Show matching nodes
					const matchingNodes = cy!.nodes(`[type = "${type}"]`);
					matchingNodes.removeClass('dimmed');

					// Show connected edges and fade connected nodes
					const relatedEdges = matchingNodes.connectedEdges();
					relatedEdges.removeClass('dimmed');

					const relatedNodes = relatedEdges.connectedNodes().difference(matchingNodes);
					relatedNodes.removeClass('dimmed').addClass('faded');
				});
			},
			resetFilters: () => {
				if (!cy) return;
				cy.batch(() => {
					cy!.nodes().removeClass('dimmed faded');
					cy!.edges().removeClass('dimmed');
				});
			},
			search: (query: string) => {
				if (!cy) return;
				const trimmed = query.trim().toLowerCase();
				if (!trimmed) return;

				cy.nodes().removeClass('highlight');
				highlightTimeouts.forEach((timeout) => clearTimeout(timeout));
				highlightTimeouts = [];

				const results = cy
					.nodes()
					.filter((node) => node.data('label')?.toLowerCase().includes(trimmed));

				if (results.length > 0) {
					cy.fit(results, 50);
					results.forEach((node) => {
						node.addClass('highlight');
						const timeout = setTimeout(() => node.removeClass('highlight'), 2000);
						highlightTimeouts.push(timeout);
					});
				}
			}
		};

		return api;
	}

	function getLayoutOptions(layoutName: string): cytoscape.LayoutOptions {
		const defaultLayout: cytoscape.LayoutOptions = {
			name: 'dagre',
			rankDir: 'TB',
			nodeSep: 60,
			rankSep: 80,
			animate: true,
			animationDuration: 400
		} as any;

		const layouts: Record<string, cytoscape.LayoutOptions> = {
			dagre: defaultLayout,
			cola: {
				name: 'cola',
				animate: true,
				nodeSpacing: 60,
				flow: { axis: 'y' }
			} as any,
			'cose-bilkent': {
				name: 'cose-bilkent',
				animate: true,
				idealEdgeLength: 120,
				nodeOverlap: 25,
				nodeRepulsion: 6000
			} as any,
			circle: {
				name: 'circle',
				animate: true
			}
		};

		return layouts[layoutName] || defaultLayout;
	}

	// React to data/viewMode changes
	$effect(() => {
		if (!cy) return;
		const graphData = OntologyGraphService.buildGraphData(data, viewMode, isDark);

		cy.batch(() => {
			cy!.elements().remove();
			cy!.add([...graphData.nodes, ...graphData.edges]);
		});

		cy!.layout(getLayoutOptions(currentLayout)).run();
		graphInstance?.resetFilters();
		selectedNode = null;
	});
</script>

<div bind:this={container} class="graph-container w-full h-full bg-background"></div>

<style>
	.graph-container {
		touch-action: pan-x pan-y pinch-zoom;
		-webkit-user-select: none;
		user-select: none;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}
</style>
