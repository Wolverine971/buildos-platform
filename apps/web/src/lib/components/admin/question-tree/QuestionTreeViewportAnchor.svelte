<!-- apps/web/src/lib/components/admin/question-tree/QuestionTreeViewportAnchor.svelte -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { useSvelteFlow, type Node } from '@xyflow/svelte';

	let {
		nodes,
		selectedNodeId,
		initialNodeIds = []
	}: {
		nodes: Node[];
		selectedNodeId: string | null;
		initialNodeIds?: string[];
	} = $props();
	let previousPositions = new Map<string, { x: number; y: number }>();
	let previousNodeCount = 0;
	let previousSelectedNodeId: string | null = null;
	let initialFitComplete = false;
	let viewportFrame: number | null = null;
	const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce', false);
	const { fitView, getViewport, setCenter, setViewport } = useSvelteFlow();

	function cancelViewportUpdate(): void {
		if (viewportFrame === null) return;
		cancelAnimationFrame(viewportFrame);
		viewportFrame = null;
	}

	function scheduleViewportUpdate(update: () => void): void {
		cancelViewportUpdate();
		viewportFrame = requestAnimationFrame(() => {
			viewportFrame = null;
			update();
		});
	}

	onDestroy(cancelViewportUpdate);

	$effect(() => {
		const currentNodes = nodes;
		const selectedId = selectedNodeId;
		const focusIds = initialNodeIds;
		const nextPositions = new Map(
			currentNodes.map((node) => [node.id, { x: node.position.x, y: node.position.y }])
		);
		const priorPosition = selectedId ? previousPositions.get(selectedId) : null;
		const nextPosition = selectedId ? nextPositions.get(selectedId) : null;
		const addedNodes = currentNodes.length > previousNodeCount;
		previousPositions = nextPositions;
		previousNodeCount = currentNodes.length;

		if (!initialFitComplete && currentNodes.length > 0) {
			scheduleViewportUpdate(() => {
				initialFitComplete = true;
				previousSelectedNodeId = selectedId;
				const focusNodes = currentNodes.filter((node) => focusIds.includes(node.id));
				void fitView({
					nodes: focusNodes.length ? focusNodes : currentNodes.slice(0, 1),
					padding: 0.24,
					minZoom: 0.35,
					maxZoom: 0.9,
					duration: reducedMotion.current ? 0 : 280
				});
			});
			return;
		}

		if (selectedId !== previousSelectedNodeId) {
			previousSelectedNodeId = selectedId;
			if (!selectedId) {
				cancelViewportUpdate();
				return;
			}
			const node = currentNodes.find((entry) => entry.id === selectedId);
			if (!node) return;
			scheduleViewportUpdate(() => {
				const viewport = getViewport();
				void setCenter(node.position.x + 125, node.position.y + 66, {
					zoom: Math.max(viewport.zoom, 0.72),
					duration: reducedMotion.current ? 0 : 220
				});
			});
			return;
		}

		if (!addedNodes || !priorPosition || !nextPosition) return;
		const deltaX = nextPosition.x - priorPosition.x;
		const deltaY = nextPosition.y - priorPosition.y;
		if (deltaX === 0 && deltaY === 0) return;

		scheduleViewportUpdate(() => {
			const viewport = getViewport();
			void setViewport(
				{
					x: viewport.x - deltaX * viewport.zoom,
					y: viewport.y - deltaY * viewport.zoom,
					zoom: viewport.zoom
				},
				{ duration: reducedMotion.current ? 0 : 120 }
			);
		});
	});
</script>
