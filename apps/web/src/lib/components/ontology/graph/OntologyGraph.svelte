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
	- Goal: target-in-circle (north star)
	- Task: ellipse (atomic work)
	- Plan: round-rectangle dashed (temporal scaffolding)
	- Document: rectangle (knowledge page)
	- Milestone: triangle (checkpoint)
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import cytoscape from 'cytoscape';
	import dagre from 'cytoscape-dagre';
	import cola from 'cytoscape-cola';
	import coseBilkent from 'cytoscape-cose-bilkent';
	import { OntologyGraphService, GRAPH_COLORS } from './lib/graph.service';
	import { getGraphLayoutOptions, GRAPH_FIT_PADDING } from './lib/graph.layout';
	import type {
		GraphNode,
		GraphSourceData,
		OntologyGraphInstance,
		ViewMode
	} from './lib/graph.types';

	// Register Cytoscape plugins once
	const CYTOSCAPE_PLUGINS_KEY = '__buildos_cytoscape_layouts_registered__';
	const registerCytoscapeExtension = (extension: unknown) => {
		(cytoscape as unknown as { use: (extension: unknown) => void }).use(extension);
	};

	if (!(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_PLUGINS_KEY]) {
		registerCytoscapeExtension(dagre);
		registerCytoscapeExtension(cola);
		registerCytoscapeExtension(coseBilkent);
		(cytoscape as unknown as Record<string, unknown>)[CYTOSCAPE_PLUGINS_KEY] = true;
	}

	let {
		data,
		viewMode,
		layoutName = 'cose-bilkent',
		onNodeSelect,
		selectedNode = $bindable<GraphNode | null>(),
		graphInstance = $bindable<OntologyGraphInstance | null>()
	}: {
		data: GraphSourceData;
		viewMode: ViewMode;
		layoutName?: string;
		onNodeSelect?: (node: GraphNode) => void;
		selectedNode?: GraphNode | null;
		graphInstance?: OntologyGraphInstance | null;
	} = $props();

	let container: HTMLElement;
	let cy: cytoscape.Core | null = null;
	let activeLayout: cytoscape.Layouts | null = null;
	let currentLayout = 'cose-bilkent';
	let renderedData: GraphSourceData | null = null;
	let renderedViewMode: ViewMode | null = null;
	let renderedIsDark: boolean | null = null;
	let highlightTimeouts: Array<ReturnType<typeof setTimeout>> = [];
	let layoutFitTimeout: ReturnType<typeof setTimeout> | null = null;
	let resizeFitTimeout: ReturnType<typeof setTimeout> | null = null;
	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce', false);

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

		let resizeFrame: number | null = null;
		const resizeObserver = new ResizeObserver(() => {
			if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
			resizeFrame = requestAnimationFrame(() => {
				scheduleResizeFit(reducedMotion.current ? 0 : 80);
				resizeFrame = null;
			});
		});
		resizeObserver.observe(container);

		return () => {
			observer.disconnect();
			resizeObserver.disconnect();
			if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
			destroyGraph();
		};
	});

	function destroyGraph() {
		highlightTimeouts.forEach((timeout) => clearTimeout(timeout));
		highlightTimeouts = [];
		if (layoutFitTimeout !== null) {
			clearTimeout(layoutFitTimeout);
			layoutFitTimeout = null;
		}
		if (resizeFitTimeout !== null) {
			clearTimeout(resizeFitTimeout);
			resizeFitTimeout = null;
		}
		const previousLayout = activeLayout;
		activeLayout = null;
		previousLayout?.stop();

		if (cy) {
			cy.destroy();
			cy = null;
		}
		renderedData = null;
		renderedViewMode = null;
		renderedIsDark = null;

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
					label: 'data(displayLabel)' as any,
					'font-size': 'data(fontSize)' as any,
					'font-family': 'system-ui, -apple-system, "Inter", sans-serif',
					'font-weight': 'data(fontWeight)' as any,
					'text-valign': 'data(labelValign)' as any,
					'text-halign': 'center',
					'text-wrap': 'wrap',
					'text-overflow-wrap': 'anywhere',
					'text-justification': 'center',
					'text-max-width': 'data(labelMaxWidth)' as any,
					'text-margin-y': 'data(labelMarginY)' as any,
					'text-background-color': labelBg,
					'text-background-opacity': 'data(labelBackgroundOpacity)' as any,
					'text-background-padding': 'data(labelBackgroundPadding)' as any,
					'text-background-shape': 'roundrectangle',
					color: labelColor
				}
			},
			// Canonical entity glyphs sit in a fixed, explicitly centered box. Keeping
			// image geometry independent from the node silhouette prevents circles,
			// portrait documents, and triangles from nudging their glyphs off-axis.
			{
				selector: 'node[iconImage]',
				style: {
					'background-image': 'data(iconImage)' as any,
					'background-fit': 'contain',
					'background-repeat': 'no-repeat',
					'background-position-x': '50%',
					'background-position-y': '50%',
					'background-offset-x': 0,
					'background-offset-y': 0,
					'background-width': 'data(iconSize)' as any,
					'background-height': 'data(iconSize)' as any,
					'background-width-relative-to': 'inner',
					'background-height-relative-to': 'inner',
					'background-image-containment': 'inside',
					'background-image-opacity': 0.96,
					'background-clip': 'node'
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
			// Projects get a permanent stamp-like halo and slightly heavier presence —
			// the closest Cytoscape can come to wt-card / tx-frame "frame" weight.
			{
				selector: 'node[type = "project"]',
				style: {
					'underlay-color': isDark ? '#e2e8f0' : '#0f172a',
					'underlay-opacity': 0.08,
					'underlay-padding': 5
				}
			},
			// A project is the workspace boundary for its ontology entities. Cytoscape
			// renders this as a compound parent node, so project membership reads as
			// containment instead of redundant edges radiating from the project.
			{
				selector: 'node[type = "project"]:parent',
				style: {
					'background-opacity': 0.08,
					'border-opacity': 0.55,
					'border-width': 2,
					padding: '46px',
					'compound-sizing-wrt-labels': 'include',
					'min-width': '260px',
					'min-height': '190px',
					'text-valign': 'top',
					'text-margin-y': 14,
					'font-size': 15,
					'font-weight': 800,
					'text-background-opacity': 0,
					'underlay-opacity': 0
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
			// Inferred project links come from project_id, not persisted ontology edges.
			{
				selector: 'edge[inferred]',
				style: {
					'line-style': 'dotted',
					'curve-style': 'straight',
					opacity: 0.55,
					'target-arrow-shape': 'none'
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
			// Selected state - keep state fill, add accent border + soft halo
			{
				selector: 'node:selected',
				style: {
					'border-color': accent,
					'border-width': 4,
					'overlay-color': accent,
					'overlay-opacity': 0.12,
					'overlay-padding': 6,
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
				selector: 'edge.connected',
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
		renderedData = data;
		renderedViewMode = viewMode;
		renderedIsDark = isDark;

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
		currentLayout = layoutName;

		const graphData = OntologyGraphService.buildGraphData(data, viewMode, isDark);
		renderedData = data;
		renderedViewMode = viewMode;
		renderedIsDark = isDark;

		cy = cytoscape({
			container,
			elements: [...graphData.nodes, ...graphData.edges],
			style: getCytoscapeStyles() as any,
			// Seed iterative layouts with non-overlapping positions. Starting every
			// node at (0, 0) makes Cola converge into an unnecessarily narrow column.
			layout: { name: 'random', fit: false, animate: false },
			minZoom: 0.1,
			maxZoom: 4
		});

		cy.on('select', 'node', (evt) => {
			cy?.edges().removeClass('connected');
			evt.target.connectedEdges().addClass('connected');
		});

		cy.on('unselect', 'node', () => {
			if (!cy) return;
			cy.edges().removeClass('connected');
			cy.nodes(':selected').connectedEdges().addClass('connected');
		});

		// Node tap - select
		cy.on('tap', 'node', (evt) => {
			const node = evt.target;
			const graphNode = {
				...(node.data() as GraphNode),
				connectedEdges: node.connectedEdges().length,
				neighbors: node.neighborhood().nodes().length
			};
			selectedNode = graphNode;
			onNodeSelect?.(graphNode);
		});

		// Background tap - deselect
		cy.on('tap', (evt) => {
			if (evt.target === cy) {
				selectedNode = null;
				cy?.nodes(':selected').unselect();
				cy?.edges().removeClass('connected');
			}
		});

		// Hover effects
		cy.on('mouseover', 'node', (evt) => {
			const node = evt.target;
			node.addClass('hover');

			// Show edge labels on connected edges
			node.connectedEdges().forEach((edge: cytoscape.EdgeSingular) => {
				edge.style('label', String(edge.data('label') ?? ''));
			});
		});

		cy.on('mouseout', 'node', (evt) => {
			const node = evt.target;
			node.removeClass('hover');

			// Hide edge labels
			node.connectedEdges().forEach((edge: cytoscape.EdgeSingular) =>
				edge.removeStyle('label')
			);
		});

		graphInstance = buildGraphInstance();
		runLayout(currentLayout);
	}

	function scheduleFit(delay: number, layoutName?: string) {
		if (layoutFitTimeout !== null) clearTimeout(layoutFitTimeout);
		layoutFitTimeout = setTimeout(() => {
			if (layoutName && currentLayout !== layoutName) {
				layoutFitTimeout = null;
				return;
			}
			cy?.resize();
			cy?.fit(undefined, GRAPH_FIT_PADDING);
			layoutFitTimeout = null;
		}, delay);
	}

	function scheduleResizeFit(delay: number) {
		if (resizeFitTimeout !== null) clearTimeout(resizeFitTimeout);
		resizeFitTimeout = setTimeout(() => {
			cy?.resize();
			cy?.fit(undefined, GRAPH_FIT_PADDING);
			resizeFitTimeout = null;
		}, delay);
	}

	function runLayout(layoutName: string) {
		if (!cy) return;

		const options = getGraphLayoutOptions(layoutName, reducedMotion.current);
		const animationDuration = (
			options as cytoscape.LayoutOptions & { animationDuration?: number }
		).animationDuration;
		const previousLayout = activeLayout;
		activeLayout = null;
		previousLayout?.stop();
		const layout = cy.layout(options);
		activeLayout = layout;

		if (layoutFitTimeout !== null) clearTimeout(layoutFitTimeout);
		layout.one('layoutstop', () => {
			if (activeLayout !== layout) return;
			activeLayout = null;
		});
		layout.run();

		// Layout plugins do not agree on when compound bounds are final. A single
		// guarded post-animation pass keeps both initial opens and later switches
		// deterministic.
		scheduleFit((animationDuration ?? 0) + (reducedMotion.current ? 0 : 100), layoutName);
	}

	function zoomBy(factor: number) {
		if (!cy) return;

		const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
		const zoom = {
			level,
			renderedPosition: {
				x: container.clientWidth / 2,
				y: container.clientHeight / 2
			}
		};

		if (reducedMotion.current) {
			cy.zoom(zoom);
			return;
		}

		cy.animate({ zoom }, { duration: 160 });
	}

	function buildGraphInstance(): OntologyGraphInstance | null {
		if (!cy) return null;

		const api: OntologyGraphInstance = {
			cy,
			changeLayout: (layoutName: string) => {
				if (!cy) return;
				currentLayout = layoutName;
				runLayout(layoutName);
			},
			fitToView: () => {
				if (!cy) return;
				cy.fit(undefined, GRAPH_FIT_PADDING);
			},
			zoomIn: () => zoomBy(1.25),
			zoomOut: () => zoomBy(0.8),
			centerOnNode: (nodeId: string) => {
				if (!cy) return;
				const node = cy.getElementById(nodeId);
				if (node && node.length > 0) {
					if (reducedMotion.current) {
						cy.center(node);
						cy.zoom({ level: 2, position: node.position() });
						return;
					}
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

	$effect(() => {
		const nextLayout = layoutName;
		if (!cy || nextLayout === currentLayout) return;

		currentLayout = nextLayout;
		runLayout(nextLayout);
	});

	// React to data/viewMode changes
	$effect(() => {
		const nextData = data;
		const nextViewMode = viewMode;
		const nextIsDark = isDark;
		if (!cy) return;
		if (
			nextData === renderedData &&
			nextViewMode === renderedViewMode &&
			nextIsDark === renderedIsDark
		) {
			return;
		}

		const graphData = OntologyGraphService.buildGraphData(nextData, nextViewMode, nextIsDark);
		renderedData = nextData;
		renderedViewMode = nextViewMode;
		renderedIsDark = nextIsDark;

		cy.batch(() => {
			cy!.elements().remove();
			cy!.add([...graphData.nodes, ...graphData.edges]);
		});

		runLayout(currentLayout);
		graphInstance?.resetFilters();
		selectedNode = null;
	});
</script>

<div
	bind:this={container}
	class="graph-container w-full h-full bg-background tx tx-grid tx-weak"
></div>

<style>
	.graph-container {
		touch-action: none;
		-webkit-user-select: none;
		user-select: none;
		-webkit-overflow-scrolling: touch;
		overscroll-behavior: contain;
	}
	/* Ensure Cytoscape canvases sit above the tx-grid texture pseudo-element */
	.graph-container :global(canvas) {
		position: relative;
		z-index: 2;
	}
</style>
