<!-- apps/web/src/lib/components/ontology/graph/OntologyGraph.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import cola from 'cytoscape-cola';
	import coseBilkent from 'cytoscape-cose-bilkent';
	import { OntologyGraphService } from './lib/graph.service';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from './lib/graph.types';

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

	onMount(() => {
		initializeGraph();
		return () => destroyGraph();
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

	function initializeGraph() {
		destroyGraph();

		const graphData = OntologyGraphService.buildGraphData(data, viewMode);

		cy = cytoscape({
			container,
			elements: [...graphData.nodes, ...graphData.edges],
			style: [
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
						'border-color': '#1f2937',
						'font-size': '11px',
						'font-family': 'Inter, system-ui, sans-serif',
						'text-wrap': 'wrap',
						'text-max-width': '80px',
						color: '#ffffff'
					}
				},
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
				{
					selector: 'node:selected',
					style: {
						'background-color': '#fbbf24',
						'border-color': '#f59e0b',
						'border-width': 4
					}
				},
				{
					selector: 'node.hover',
					style: {
						'background-color': '#60a5fa'
					}
				},
				{
					selector: '.highlight',
					style: {
						'background-color': '#fbbf24',
						'border-color': '#f59e0b',
						'border-width': 4
					}
				}
			],
			layout: getLayoutOptions(currentLayout),
			minZoom: 0.1,
			maxZoom: 4,
			wheelSensitivity: 0.35
		});

		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			selectedNode = {
				...(node.data() as GraphNode),
				connectedEdges: node.connectedEdges().length,
				neighbors: node.neighborhood().nodes().length
			};
		});

		cy.on('tap', (evt) => {
			if (evt.target === cy) {
				selectedNode = null;
			}
		});

		cy.on('mouseover', 'node', (evt) => {
			evt.target.addClass('hover');
		});

		cy.on('mouseout', 'node', (evt) => {
			evt.target.removeClass('hover');
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
					cy.nodes().style({
						opacity: 0.1,
						display: 'none'
					});
					cy.edges().style({
						opacity: 0.1,
						display: 'none'
					});
					const matchingNodes = cy.nodes(`[type = "${type}"]`);
					const relatedEdges = matchingNodes.connectedEdges();
					const relatedNodes = relatedEdges.connectedNodes().difference(matchingNodes);

					matchingNodes.style({
						opacity: 1,
						display: 'element'
					});

					relatedNodes.style({
						opacity: 0.6,
						display: 'element'
					});

					relatedEdges.style({
						opacity: 0.9,
						display: 'element'
					});
				});
			},
			resetFilters: () => {
				if (!cy) return;
				cy.batch(() => {
					cy.nodes().style({
						opacity: 1,
						display: 'element'
					});
					cy.edges().style({
						opacity: 1,
						display: 'element'
					});
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
						const timeout = setTimeout(() => node.removeClass('highlight'), 1000);
						highlightTimeouts.push(timeout);
					});
				}
			}
		};

		return api;
	}

	function getLayoutOptions(layoutName: string) {
		const layouts: Record<string, Record<string, unknown>> = {
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

		return layouts[layoutName] ?? layouts.dagre;
	}

	$effect(() => {
		if (!cy) return;
		const graphData = OntologyGraphService.buildGraphData(data, viewMode);

		cy.batch(() => {
			cy.elements().remove();
			cy.add([...graphData.nodes, ...graphData.edges]);
		});

		cy.layout(getLayoutOptions(currentLayout)).run();
		graphInstance?.resetFilters();
		selectedNode = null;
	});
</script>

<div bind:this={container} class="graph-container w-full h-full bg-gray-50 dark:bg-gray-900"></div>

<style>
	.graph-container {
		touch-action: pan-x pan-y pinch-zoom;
		-webkit-user-select: none;
		user-select: none;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}

	:global(.highlight) {
		background-color: #fbbf24 !important;
	}
</style>
