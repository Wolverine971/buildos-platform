<!-- G6Graph.svelte - High-performance ontology graph using G6 by AntV -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { G6GraphService } from '../lib/g6.service';
	import type { GraphNode, GraphSourceData, ViewMode } from '../lib/graph.types';

	let {
		data,
		viewMode,
		selectedNode = $bindable<GraphNode | null>()
	}: {
		data: GraphSourceData;
		viewMode: ViewMode;
		selectedNode: GraphNode | null;
	} = $props();

	let container: HTMLDivElement;
	let graph: any = null;
	let resizeObserver: ResizeObserver | null = null;
	let currentGraphData: ReturnType<typeof G6GraphService.buildGraphData> | null = null;

	// Get node shape based on type
	function getNodeShape(nodeType: string): string {
		const shapes: Record<string, string> = {
			template: 'diamond',
			project: 'rect',
			task: 'circle',
			plan: 'rect',
			goal: 'star',
			milestone: 'triangle',
			output: 'diamond',
			document: 'rect'
		};
		return shapes[nodeType] ?? 'circle';
	}

	// Get node size based on type
	function getNodeSize(
		nodeType: string,
		originalSize: number | [number, number] | undefined
	): number | [number, number] {
		if (originalSize) return originalSize;
		const sizes: Record<string, number | [number, number]> = {
			template: 36,
			project: [120, 44],
			task: 28,
			plan: [100, 36],
			goal: 40,
			milestone: 32,
			output: 32,
			document: [90, 32]
		};
		return sizes[nodeType] ?? 30;
	}

	async function initGraph() {
		if (!container || typeof window === 'undefined') return;

		// Dynamically import G6 to avoid SSR issues
		const G6 = await import('@antv/g6');

		currentGraphData = G6GraphService.buildGraphData(data, viewMode);

		// Clean up existing graph
		if (graph) {
			graph.destroy();
			graph = null;
		}

		const width = container.clientWidth || 800;
		const height = container.clientHeight || 600;

		// Create new graph instance with improved styling
		graph = new G6.Graph({
			container,
			width,
			height,
			autoFit: 'view',
			padding: [60, 60, 60, 60],
			zoomRange: [0.02, 3],
			data: {
				nodes: currentGraphData.nodes.map((node) => ({
					id: node.id,
					data: {
						label: node.label,
						nodeType: node.nodeType,
						metadata: node.metadata
					},
					style: {
						type: getNodeShape(node.nodeType),
						size: getNodeSize(
							node.nodeType,
							node.size as number | [number, number] | undefined
						),
						fill: node.style.fill,
						stroke: node.style.stroke,
						lineWidth: 2,
						radius: node.nodeType === 'project' || node.nodeType === 'plan' ? 8 : 4,
						shadowColor: 'rgba(0, 0, 0, 0.15)',
						shadowBlur: 8,
						shadowOffsetX: 0,
						shadowOffsetY: 2,
						cursor: 'pointer',
						// Label styling
						labelText: node.label,
						labelFill: node.labelCfg?.style?.fill ?? '#1f2937',
						labelFontSize: node.labelCfg?.style?.fontSize ?? 11,
						labelFontWeight:
							node.nodeType === 'project' || node.nodeType === 'goal' ? 600 : 400,
						labelFontFamily: 'Inter, system-ui, sans-serif',
						labelPlacement: 'center',
						labelMaxWidth: node.nodeType === 'project' ? 110 : 80,
						labelWordWrap: true,
						labelMaxLines: 2,
						labelTextOverflow: 'ellipsis'
					}
				})),
				edges: currentGraphData.edges.map((edge) => ({
					id: edge.id,
					source: edge.source,
					target: edge.target,
					data: {
						label: edge.label,
						relationship: edge.relationship
					},
					style: {
						stroke: edge.style.stroke,
						lineWidth: edge.style.lineWidth,
						lineDash: edge.style.lineDash,
						opacity: 0.7,
						endArrow: true,
						endArrowSize: 8,
						endArrowFill: edge.style.stroke,
						// Label styling
						labelText: '',
						labelFontSize: 9,
						labelFill: '#6b7280',
						labelBackground: true,
						labelBackgroundFill: '#ffffff',
						labelBackgroundOpacity: 0.9,
						labelBackgroundRadius: 3,
						labelBackgroundPadding: [3, 6, 3, 6]
					}
				}))
			},
			node: {
				state: {
					selected: {
						stroke: '#f59e0b',
						lineWidth: 3,
						shadowColor: 'rgba(245, 158, 11, 0.4)',
						shadowBlur: 16
					},
					active: {
						stroke: '#3b82f6',
						lineWidth: 2,
						shadowColor: 'rgba(59, 130, 246, 0.3)',
						shadowBlur: 12
					}
				}
			},
			edge: {
				type: 'cubic-vertical',
				state: {
					active: {
						stroke: '#3b82f6',
						lineWidth: 2,
						opacity: 1
					}
				}
			},
			layout: {
				type: 'antv-dagre',
				rankdir: 'TB',
				nodesep: 80, // Horizontal spacing between nodes
				ranksep: 120, // Vertical spacing between ranks/levels
				align: 'UL',
				controlPoints: true, // Add control points for better edge routing
				nodeSize: [120, 60], // Default node size for layout calculations
				preventOverlap: true,
				sortByCombo: false
			},
			behaviors: [
				{
					type: 'drag-canvas',
					enableOptimize: true
				},
				{
					type: 'zoom-canvas',
					sensitivity: 1.2,
					minZoom: 0.02,
					maxZoom: 3
				},
				'drag-element',
				{
					type: 'click-select',
					multiple: false
				},
				{
					type: 'hover-activate',
					degree: 1,
					state: 'active',
					inactiveState: ''
				}
			],
			plugins: [
				{
					type: 'background',
					background: '#f9fafb'
				},
				{
					type: 'grid-line',
					follow: true,
					line: {
						stroke: '#e5e7eb',
						lineWidth: 0.5
					}
				},
				{
					type: 'minimap',
					size: [160, 100],
					position: 'bottom-right',
					padding: 12
				}
			],
			animation: {
				duration: 300,
				easing: 'ease-out'
			}
		});

		// Event handlers
		graph.on('node:click', (evt: any) => {
			const nodeId = evt.target?.id;
			if (!nodeId || !currentGraphData) return;

			const nodeData = currentGraphData.nodes.find((n) => n.id === nodeId);
			if (nodeData) {
				selectedNode = {
					id: nodeData.id,
					label: nodeData.label,
					type: nodeData.nodeType as GraphNode['type'],
					metadata: nodeData.metadata as Record<string, unknown> | undefined
				};
			}
		});

		graph.on('canvas:click', () => {
			selectedNode = null;
		});

		// Render the graph
		await graph.render();
	}

	function updateGraph() {
		if (!graph) return;

		currentGraphData = G6GraphService.buildGraphData(data, viewMode);

		graph.setData({
			nodes: currentGraphData.nodes.map((node) => ({
				id: node.id,
				data: {
					label: node.label,
					nodeType: node.nodeType,
					metadata: node.metadata
				},
				style: {
					type: getNodeShape(node.nodeType),
					size: getNodeSize(
						node.nodeType,
						node.size as number | [number, number] | undefined
					),
					fill: node.style.fill,
					stroke: node.style.stroke,
					lineWidth: 2,
					radius: node.nodeType === 'project' || node.nodeType === 'plan' ? 8 : 4,
					shadowColor: 'rgba(0, 0, 0, 0.15)',
					shadowBlur: 8,
					shadowOffsetX: 0,
					shadowOffsetY: 2,
					cursor: 'pointer',
					labelText: node.label,
					labelFill: node.labelCfg?.style?.fill ?? '#1f2937',
					labelFontSize: node.labelCfg?.style?.fontSize ?? 11,
					labelFontWeight:
						node.nodeType === 'project' || node.nodeType === 'goal' ? 600 : 400,
					labelFontFamily: 'Inter, system-ui, sans-serif',
					labelPlacement: 'center',
					labelMaxWidth: node.nodeType === 'project' ? 110 : 80,
					labelWordWrap: true,
					labelMaxLines: 2,
					labelTextOverflow: 'ellipsis'
				}
			})),
			edges: currentGraphData.edges.map((edge) => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				data: {
					label: edge.label,
					relationship: edge.relationship
				},
				style: {
					stroke: edge.style.stroke,
					lineWidth: edge.style.lineWidth,
					lineDash: edge.style.lineDash,
					opacity: 0.7,
					endArrow: true,
					endArrowSize: 8,
					endArrowFill: edge.style.stroke,
					labelText: '',
					labelFontSize: 9,
					labelFill: '#6b7280',
					labelBackground: true,
					labelBackgroundFill: '#ffffff',
					labelBackgroundOpacity: 0.9,
					labelBackgroundRadius: 3,
					labelBackgroundPadding: [3, 6, 3, 6]
				}
			}))
		});

		graph.render();
	}

	function handleResize() {
		if (!graph || !container) return;
		const width = container.clientWidth;
		const height = container.clientHeight;
		graph.setSize(width, height);
	}

	onMount(async () => {
		await initGraph();

		// Set up resize observer
		resizeObserver = new ResizeObserver(() => {
			handleResize();
		});
		if (container) {
			resizeObserver.observe(container);
		}
	});

	onDestroy(() => {
		if (resizeObserver) {
			resizeObserver.disconnect();
			resizeObserver = null;
		}
		if (graph) {
			graph.destroy();
			graph = null;
		}
	});

	// Update when data or viewMode changes
	$effect(() => {
		data;
		viewMode;
		if (graph) {
			updateGraph();
		}
	});
</script>

<div bind:this={container} class="g6-container w-full h-full"></div>

<style>
	.g6-container {
		position: relative;
		overflow: hidden;
		background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
	}

	:global(.dark) .g6-container {
		background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
	}

	/* Style the minimap */
	.g6-container :global(.g6-minimap) {
		background: rgba(255, 255, 255, 0.95) !important;
		border: 1px solid #e5e7eb !important;
		border-radius: 10px !important;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
		overflow: hidden;
	}

	:global(.dark) .g6-container :global(.g6-minimap) {
		background: rgba(31, 41, 55, 0.95) !important;
		border-color: #374151 !important;
	}

	/* Style the toolbar if present */
	.g6-container :global(.g6-toolbar) {
		background: white !important;
		border-radius: 10px !important;
		border: 1px solid #e5e7eb !important;
		box-shadow:
			0 4px 6px -1px rgba(0, 0, 0, 0.1),
			0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
		padding: 4px !important;
	}

	:global(.dark) .g6-container :global(.g6-toolbar) {
		background: #374151 !important;
		border-color: #4b5563 !important;
	}

	.g6-container :global(.g6-toolbar-item) {
		border-radius: 6px !important;
		transition: background-color 0.15s ease !important;
	}

	.g6-container :global(.g6-toolbar-item:hover) {
		background-color: #f3f4f6 !important;
	}

	:global(.dark) .g6-container :global(.g6-toolbar-item:hover) {
		background-color: #4b5563 !important;
	}

	/* Grid line styling for dark mode */
	:global(.dark) .g6-container :global(.g6-grid-line line) {
		stroke: #374151 !important;
	}
</style>
