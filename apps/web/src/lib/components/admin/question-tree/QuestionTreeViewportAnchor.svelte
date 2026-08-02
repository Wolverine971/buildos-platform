<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeViewportAnchor.svelte -->
<script lang="ts">
	import { useSvelteFlow, type Node } from '@xyflow/svelte';

	let { nodes, selectedNodeId }: { nodes: Node[]; selectedNodeId: string | null } = $props();
	let previousPositions = new Map<string, { x: number; y: number }>();
	let previousNodeCount = 0;
	const { getViewport, setViewport } = useSvelteFlow();

	$effect(() => {
		const currentNodes = nodes;
		const selectedId = selectedNodeId;
		const nextPositions = new Map(
			currentNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
		);
		const priorPosition = selectedId ? previousPositions.get(selectedId) : null;
		const nextPosition = selectedId ? nextPositions.get(selectedId) : null;
		const addedNodes = currentNodes.length > previousNodeCount;
		previousPositions = nextPositions;
		previousNodeCount = currentNodes.length;

		if (!addedNodes || !priorPosition || !nextPosition) return;
		const deltaX = nextPosition.x - priorPosition.x;
		const deltaY = nextPosition.y - priorPosition.y;
		if (deltaX === 0 && deltaY === 0) return;

		const frame = requestAnimationFrame(() => {
			const viewport = getViewport();
			void setViewport({
				x: viewport.x - deltaX * viewport.zoom,
				y: viewport.y - deltaY * viewport.zoom,
				zoom: viewport.zoom
			});
		});
		return () => cancelAnimationFrame(frame);
	});
</script>
