<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeCanvas.svelte -->
<script lang="ts">
	import { MediaQuery } from 'svelte/reactivity';
	import {
		Background,
		BackgroundVariant,
		Controls,
		MiniMap,
		Position,
		SvelteFlow,
		type Edge,
		type Node,
		type NodeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import dagre from '@dagrejs/dagre';
	import type {
		QuestionTreeNode as TreeNode,
		QuestionTreeProposal
	} from '$lib/services/question-tree/types';
	import QuestionTreeNode from './QuestionTreeNode.svelte';
	import QuestionTreeViewportAnchor from './QuestionTreeViewportAnchor.svelte';

	let {
		nodes,
		proposals,
		searchQuery = '',
		rootActive = false,
		selectedNodeId = $bindable<string | null>(null),
		onSelectNode
	}: {
		nodes: TreeNode[];
		proposals: QuestionTreeProposal[];
		searchQuery?: string;
		rootActive?: boolean;
		selectedNodeId: string | null;
		onSelectNode?: (nodeId: string) => void;
	} = $props();

	const nodeTypes = { question: QuestionTreeNode } as unknown as NodeTypes;
	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce', false);
	let hoveredNodeId = $state<string | null>(null);

	function spotlightNodeIds(nodeId: string | null): string[] {
		const spotlight: string[] = [];
		if (!nodeId) return spotlight;
		const nodeById = new Map(nodes.map((node) => [node.id, node]));
		let current = nodeById.get(nodeId);
		while (current) {
			spotlight.push(current.id);
			current = current.parent_node_id ? nodeById.get(current.parent_node_id) : undefined;
		}
		for (const node of nodes) {
			if (node.parent_node_id === nodeId) spotlight.push(node.id);
		}
		return spotlight;
	}

	function buildGraph(): { nodes: Node[]; edges: Edge[] } {
		const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
		graph.setGraph({
			rankdir: 'LR',
			nodesep: 42,
			ranksep: 100,
			marginx: 50,
			marginy: 50,
			acyclicer: 'greedy',
			ranker: 'network-simplex'
		});
		const query = searchQuery.trim().toLowerCase();
		const spotlight = spotlightNodeIds(hoveredNodeId ?? selectedNodeId);
		const hasSpotlight = spotlight.length > 0;
		for (const node of nodes) graph.setNode(node.id, { width: 250, height: 132 });
		for (const node of nodes) {
			if (node.parent_node_id) graph.setEdge(node.parent_node_id, node.id);
		}
		dagre.layout(graph);
		const flowNodes: Node[] = nodes.map((node) => {
			const point = graph.node(node.id) ?? { x: 125, y: 66 };
			const matched =
				query.length > 0 &&
				[node.question, node.answer, node.thesis].some((value) =>
					value?.toLowerCase().includes(query)
				);
			return {
				id: node.id,
				type: 'question',
				position: { x: point.x - 125, y: point.y - 66 },
				targetPosition: Position.Left,
				sourcePosition: Position.Right,
				data: {
					node,
					matched,
					spotlighted: !hasSpotlight || spotlight.includes(node.id),
					rootActive: rootActive && node.node_kind === 'root'
				},
				selected: selectedNodeId === node.id,
				draggable: false,
				focusable: false,
				ariaLabel: `${node.node_kind === 'root' ? 'Original question' : `Node ${node.node_number}`}: ${node.question}`
			};
		});
		const proposalByChild = new Map(
			proposals
				.filter((proposal) => proposal.child_node_id)
				.map((proposal) => [proposal.child_node_id as string, proposal])
		);
		const flowEdges: Edge[] = nodes
			.filter((node) => node.parent_node_id)
			.map((node) => {
				const proposal = proposalByChild.get(node.id);
				const spotlighted =
					!hasSpotlight ||
					(spotlight.includes(node.parent_node_id as string) &&
						spotlight.includes(node.id));
				return {
					id: `edge:${node.parent_node_id}:${node.id}`,
					source: node.parent_node_id as string,
					target: node.id,
					type: 'smoothstep',
					label: proposal?.purpose.replaceAll('_', ' '),
					animated: node.status === 'running' && !reducedMotion.current,
					focusable: false,
					style: `stroke-width: ${spotlighted ? '2px' : '1.25px'}; opacity: ${spotlighted ? '1' : '0.18'}; transition: opacity 140ms ease, stroke-width 140ms ease;`
				};
			});
		return { nodes: flowNodes, edges: flowEdges };
	}

	const graphData = $derived.by(buildGraph);

	function handleNodeClick({ node }: { node: Node }) {
		selectedNodeId = node.id;
		onSelectNode?.(node.id);
	}

	function handleNodePointerEnter({ node }: { node: Node }) {
		hoveredNodeId = node.id;
	}
</script>

<div
	class="question-tree-canvas h-full w-full min-w-0 max-w-full overflow-hidden"
	aria-label="Interactive research tree. Drag to pan, scroll or pinch to zoom, and click a node to inspect it."
>
	<SvelteFlow
		nodes={graphData.nodes}
		edges={graphData.edges}
		{nodeTypes}
		minZoom={0.12}
		maxZoom={2.5}
		nodesFocusable={false}
		edgesFocusable={false}
		nodesConnectable={false}
		panOnDrag
		zoomOnScroll
		zoomOnPinch
		zoomOnDoubleClick
		onnodeclick={handleNodeClick}
		onnodepointerenter={handleNodePointerEnter}
		onnodepointerleave={() => (hoveredNodeId = null)}
		onpaneclick={() => (selectedNodeId = null)}
	>
		<Background variant={BackgroundVariant.Dots} gap={22} size={1} />
		<QuestionTreeViewportAnchor
			nodes={graphData.nodes}
			{selectedNodeId}
			initialNodeIds={nodes.filter((node) => node.depth <= 2).map((node) => node.id)}
		/>
		<Controls position="bottom-left" fitViewOptions={{ padding: 0.16, maxZoom: 0.9 }} />
		<MiniMap
			position="bottom-right"
			pannable
			zoomable
			ariaLabel="Research tree overview"
			class="!bg-card"
		/>
	</SvelteFlow>
</div>

<style>
	.question-tree-canvas {
		--xy-background-color: hsl(var(--background));
		--xy-edge-stroke: hsl(var(--border));
		--xy-edge-label-color: hsl(var(--muted-foreground));
		--xy-edge-label-background-color: hsl(var(--card));
	}

	.question-tree-canvas :global(.svelte-flow__controls) {
		border: 1px solid hsl(var(--border));
		border-radius: 0.65rem;
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
		overflow: hidden;
	}

	.question-tree-canvas :global(.svelte-flow__controls-button) {
		border: 0;
		width: 44px;
		height: 44px;
		background: hsl(var(--card));
		fill: hsl(var(--foreground));
	}

	.question-tree-canvas :global(.svelte-flow__controls-button:focus-visible) {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	@media (max-width: 639px) {
		.question-tree-canvas :global(.svelte-flow__minimap) {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.question-tree-canvas :global(.svelte-flow__edge-path) {
			transition: none !important;
		}
	}
</style>
