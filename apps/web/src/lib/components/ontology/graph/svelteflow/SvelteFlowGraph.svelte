<!-- SvelteFlowGraph.svelte - Ontology graph using Svelte Flow -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		SvelteFlow,
		Controls,
		Background,
		MiniMap,
		type NodeTypes,
		type EdgeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import { SvelteFlowGraphService } from '../lib/svelteflow.service';
	import type { GraphNode, GraphSourceData, ViewMode } from '../lib/graph.types';
	import type { SvelteFlowNode, SvelteFlowEdge } from '../lib/svelteflow.service';

	// Import custom node components
	import TemplateNode from './nodes/TemplateNode.svelte';
	import ProjectNode from './nodes/ProjectNode.svelte';
	import TaskNode from './nodes/TaskNode.svelte';
	import PlanNode from './nodes/PlanNode.svelte';
	import GoalNode from './nodes/GoalNode.svelte';
	import MilestoneNode from './nodes/MilestoneNode.svelte';
	import OutputNode from './nodes/OutputNode.svelte';
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
		template: TemplateNode,
		project: ProjectNode,
		task: TaskNode,
		plan: PlanNode,
		goal: GoalNode,
		milestone: MilestoneNode,
		output: OutputNode,
		document: DocumentNode
	} as unknown as NodeTypes;

	// Default edge type (can be customized later)
	const edgeTypes: EdgeTypes = {} as EdgeTypes;

	// Apply auto-layout using dagre-like positioning
	function applyLayout(inputNodes: SvelteFlowNode[], inputEdges: SvelteFlowEdge[]) {
		// Build adjacency map
		const children = new Map<string, string[]>();
		const parents = new Map<string, string[]>();

		for (const edge of inputEdges) {
			if (!children.has(edge.source)) children.set(edge.source, []);
			if (!parents.has(edge.target)) parents.set(edge.target, []);
			children.get(edge.source)!.push(edge.target);
			parents.get(edge.target)!.push(edge.source);
		}

		// Find root nodes (no parents)
		const roots = inputNodes.filter(
			(node) => !parents.has(node.id) || parents.get(node.id)!.length === 0
		);

		// BFS to assign levels
		const levels = new Map<string, number>();
		const queue = roots.map((r) => ({ id: r.id, level: 0 }));
		const visited = new Set<string>();

		while (queue.length > 0) {
			const { id, level } = queue.shift()!;
			if (visited.has(id)) continue;
			visited.add(id);
			levels.set(id, level);

			const nodeChildren = children.get(id) ?? [];
			for (const childId of nodeChildren) {
				if (!visited.has(childId)) {
					queue.push({ id: childId, level: level + 1 });
				}
			}
		}

		// Assign positions to nodes not in the hierarchy
		for (const node of inputNodes) {
			if (!levels.has(node.id)) {
				levels.set(node.id, 0);
			}
		}

		// Group nodes by level
		const levelGroups = new Map<number, SvelteFlowNode[]>();
		for (const node of inputNodes) {
			const level = levels.get(node.id) ?? 0;
			if (!levelGroups.has(level)) levelGroups.set(level, []);
			levelGroups.get(level)!.push(node);
		}

		// Position nodes
		const HORIZONTAL_SPACING = 220;
		const VERTICAL_SPACING = 150;

		const positioned: SvelteFlowNode[] = [];
		for (const [level, levelNodes] of levelGroups) {
			const totalWidth = levelNodes.length * HORIZONTAL_SPACING;
			const startX = -totalWidth / 2 + HORIZONTAL_SPACING / 2;

			levelNodes.forEach((node, i) => {
				positioned.push({
					...node,
					position: {
						x: startX + i * HORIZONTAL_SPACING,
						y: level * VERTICAL_SPACING
					}
				});
			});
		}

		return positioned;
	}

	// Initialize graph data
	function updateGraphData() {
		const graphData = SvelteFlowGraphService.buildGraphData(data, viewMode);
		const layoutedNodes = applyLayout(graphData.nodes, graphData.edges);
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
