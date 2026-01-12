<!-- apps/web/src/lib/components/ontology/graph/svelteflow/SvelteFlowGraph.svelte -->
<!-- SvelteFlowGraph.svelte - Ontology graph using Svelte Flow -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		Position,
		type NodeTypes,
		type EdgeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import dagre from '@dagrejs/dagre';

	import { SvelteFlowGraphService } from '../lib/svelteflow.service';
	import type { GraphNode, GraphSourceData, ViewMode } from '../lib/graph.types';
	import type { SvelteFlowNode, SvelteFlowEdge } from '../lib/svelteflow.service';

	// Import custom node components
	import ProjectNode from './nodes/ProjectNode.svelte';
	import TaskNode from './nodes/TaskNode.svelte';
	import PlanNode from './nodes/PlanNode.svelte';
	import GoalNode from './nodes/GoalNode.svelte';
	import MilestoneNode from './nodes/MilestoneNode.svelte';
	import DocumentNode from './nodes/DocumentNode.svelte';

	let {
		data,
		viewMode,
		selectedNode = $bindable<GraphNode | null>()
	}: {
		data: GraphSourceData;
		viewMode: ViewMode;
		selectedNode: GraphNode | null;
	} = $props();

	let nodes = $state<SvelteFlowNode[]>([]);
	let edges = $state<SvelteFlowEdge[]>([]);

	// Define custom node types
	const nodeTypes: NodeTypes = {
		project: ProjectNode,
		task: TaskNode,
		plan: PlanNode,
		goal: GoalNode,
		milestone: MilestoneNode,
		document: DocumentNode
	} as unknown as NodeTypes;

	// Default edge type (can be customized later)
	const edgeTypes: EdgeTypes = {} as EdgeTypes;

	// Node dimensions by type for proper layout calculation
	const nodeDimensions: Record<string, { width: number; height: number }> = {
		project: { width: 180, height: 80 },
		task: { width: 160, height: 70 },
		plan: { width: 160, height: 70 },
		goal: { width: 150, height: 70 },
		milestone: { width: 150, height: 60 },
		document: { width: 140, height: 60 }
	};

	const defaultDimension = { width: 150, height: 60 };

	// Apply hierarchical layout using dagre
	function applyDagreLayout(
		inputNodes: SvelteFlowNode[],
		inputEdges: SvelteFlowEdge[],
		direction: 'TB' | 'LR' = 'TB'
	): SvelteFlowNode[] {
		if (inputNodes.length === 0) return [];

		// Create a new dagre graph for each layout to avoid stale state
		const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

		const isHorizontal = direction === 'LR';

		// Configure the graph layout
		dagreGraph.setGraph({
			rankdir: direction,
			nodesep: 60, // Horizontal spacing between nodes
			ranksep: 100, // Vertical spacing between ranks/levels
			marginx: 40,
			marginy: 40,
			acyclicer: 'greedy', // Handle cycles gracefully
			ranker: 'network-simplex' // Better for complex graphs
		});

		// Add nodes to dagre graph with their dimensions
		for (const node of inputNodes) {
			const nodeType = node.data?.type ?? 'default';
			const dim = nodeDimensions[nodeType] ?? defaultDimension;
			dagreGraph.setNode(node.id, { width: dim.width, height: dim.height });
		}

		// Add edges to dagre graph
		for (const edge of inputEdges) {
			if (edge.source && edge.target) {
				dagreGraph.setEdge(edge.source, edge.target);
			}
		}

		// Run the dagre layout algorithm
		dagre.layout(dagreGraph);

		// Apply the calculated positions to nodes
		const layoutedNodes: SvelteFlowNode[] = inputNodes.map((node) => {
			const nodeWithPosition = dagreGraph.node(node.id);
			const nodeType = node.data?.type ?? 'default';
			const dim = nodeDimensions[nodeType] ?? defaultDimension;

			// Dagre gives us center positions, we need top-left for Svelte Flow
			const position = nodeWithPosition
				? {
						x: nodeWithPosition.x - dim.width / 2,
						y: nodeWithPosition.y - dim.height / 2
					}
				: { x: 0, y: 0 };

			return {
				...node,
				position,
				// Set handle positions based on layout direction
				targetPosition: isHorizontal ? Position.Left : Position.Top,
				sourcePosition: isHorizontal ? Position.Right : Position.Bottom
			};
		});

		return layoutedNodes;
	}

	// Initialize graph data
	function updateGraphData() {
		const graphData = SvelteFlowGraphService.buildGraphData(data, viewMode);
		const layoutedNodes = applyDagreLayout(graphData.nodes, graphData.edges, 'TB');
		nodes = layoutedNodes;
		edges = graphData.edges;
	}

	onMount(() => {
		updateGraphData();
	});

	// Update when data or viewMode changes
	$effect(() => {
		data;
		viewMode;
		updateGraphData();
	});

	// Handle node selection
	function onNodeClick(event: CustomEvent<{ node: SvelteFlowNode }>) {
		const node = event.detail.node;
		selectedNode = {
			id: node.id,
			label: node.data.label,
			type: node.data.type as GraphNode['type'],
			metadata: node.data.metadata as Record<string, unknown> | undefined
		};
	}

	// Handle background click to deselect
	function onPaneClick() {
		selectedNode = null;
	}

	// MiniMap node color function
	function getMinimapNodeColor(node: SvelteFlowNode): string {
		return node.data.color ?? '#6b7280';
	}
</script>

<div class="svelte-flow-container w-full h-full">
	<SvelteFlow
		{nodes}
		{edges}
		{nodeTypes}
		{edgeTypes}
		fitView
		fitViewOptions={{ padding: 0.2 }}
		minZoom={0.01}
		maxZoom={4}
		defaultEdgeOptions={{
			type: 'smoothstep',
			style: 'stroke-width: 2px;'
		}}
		on:nodeclick={onNodeClick}
		on:paneclick={onPaneClick}
	>
		<Background variant="dots" gap={20} size={1} />
		<Controls position="bottom-left" />
		<MiniMap
			position="bottom-right"
			nodeColor={getMinimapNodeColor}
			maskColor="rgba(0,0,0,0.1)"
			class="!bg-white dark:!bg-gray-800"
		/>
	</SvelteFlow>
</div>

<style>
	.svelte-flow-container {
		--xy-background-color: #f9fafb;
		--xy-minimap-background-color: #ffffff;
	}

	:global(.dark) .svelte-flow-container {
		--xy-background-color: #111827;
		--xy-minimap-background-color: #1f2937;
	}

	.svelte-flow-container :global(.svelte-flow__controls) {
		background: white;
		border-radius: 8px;
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.12),
			0 1px 2px rgba(0, 0, 0, 0.24);
	}

	:global(.dark) .svelte-flow-container :global(.svelte-flow__controls) {
		background: #374151;
	}

	.svelte-flow-container :global(.svelte-flow__controls-button) {
		border: none;
	}

	:global(.dark) .svelte-flow-container :global(.svelte-flow__controls-button) {
		background: #374151;
		fill: #9ca3af;
	}

	:global(.dark) .svelte-flow-container :global(.svelte-flow__controls-button:hover) {
		background: #4b5563;
	}
</style>
