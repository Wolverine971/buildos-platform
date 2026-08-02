<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeCanvas.svelte -->
<script lang="ts">
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
		selectedNodeId = $bindable<string | null>(null)
	}: {
		nodes: TreeNode[];
		proposals: QuestionTreeProposal[];
		searchQuery?: string;
		rootActive?: boolean;
		selectedNodeId: string | null;
	} = $props();

	const nodeTypes = { question: QuestionTreeNode } as unknown as NodeTypes;

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
				data: { node, matched, rootActive: rootActive && node.node_kind === 'root' },
				selected: selectedNodeId === node.id,
				draggable: false
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
				return {
					id: `edge:${node.parent_node_id}:${node.id}`,
					source: node.parent_node_id as string,
					target: node.id,
					type: 'smoothstep',
					label: proposal?.purpose.replace('_', ' '),
					animated: node.status === 'running',
					style: 'stroke-width: 1.5px;'
				};
			});
		return { nodes: flowNodes, edges: flowEdges };
	}

	const graphData = $derived.by(buildGraph);

	function handleNodeClick({ node }: { node: Node }) {
		selectedNodeId = node.id;
	}
</script>

<div class="question-tree-canvas h-full w-full min-w-0 max-w-full overflow-hidden">
	<SvelteFlow
		nodes={graphData.nodes}
		edges={graphData.edges}
		{nodeTypes}
		fitView
		fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
		minZoom={0.08}
		maxZoom={2.5}
		onnodeclick={handleNodeClick}
		onpaneclick={() => (selectedNodeId = null)}
	>
		<Background variant={BackgroundVariant.Dots} gap={22} size={1} />
		<QuestionTreeViewportAnchor nodes={graphData.nodes} {selectedNodeId} />
		<Controls position="bottom-left" />
		<MiniMap position="bottom-right" pannable zoomable class="!bg-card" />
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
		background: hsl(var(--card));
		fill: hsl(var(--foreground));
	}
</style>
