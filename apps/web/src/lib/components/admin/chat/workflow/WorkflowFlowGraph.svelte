<!-- apps/web/src/lib/components/admin/chat/workflow/WorkflowFlowGraph.svelte -->
<!--
	SVG rendering of the saved workflow graph. Columns are dependency depth (from the saved
	plan), lanes separate agents that ran in parallel. Evidence handoffs are thick edges,
	Jev shadow observation is dashed and never connects to an executing agent.
-->
<script lang="ts">
	import type {
		WorkflowAuditGraph,
		WorkflowAuditGraphEdge,
		WorkflowAuditGraphNode
	} from '$lib/services/admin/chat-workflow-audit-types';

	let {
		graph,
		selectedNodeId = null,
		onSelect
	}: {
		graph: WorkflowAuditGraph;
		selectedNodeId?: string | null;
		onSelect: (nodeId: string) => void;
	} = $props();

	const COL_W = 236;
	const LANE_H = 104;
	const NODE_W = 196;
	const NODE_H = 70;
	const PAD = 20;

	const width = $derived(Math.max(1, graph.columns) * COL_W + PAD * 2);
	const height = $derived(Math.max(1, graph.lanes) * LANE_H + PAD * 2 + 8);
	const nodeById = $derived(new Map(graph.nodes.map((node) => [node.id, node])));

	function x(node: WorkflowAuditGraphNode): number {
		return PAD + node.column * COL_W + (COL_W - NODE_W) / 2;
	}
	function y(node: WorkflowAuditGraphNode): number {
		return PAD + node.lane * LANE_H + (LANE_H - NODE_H) / 2;
	}
	function edgePath(edge: WorkflowAuditGraphEdge): string | null {
		const from = nodeById.get(edge.from);
		const to = nodeById.get(edge.to);
		if (!from || !to) return null;
		const x1 = x(from) + NODE_W;
		const y1 = y(from) + NODE_H / 2;
		const x2 = x(to);
		const y2 = y(to) + NODE_H / 2;
		if (from.column === to.column) {
			// Same column (tool under its agent): drop straight down from the bottom.
			const sx = x(from) + NODE_W / 2;
			const sy = y(from) + NODE_H;
			const tx = x(to) + NODE_W / 2;
			const ty = y(to);
			return `M ${sx} ${sy} C ${sx} ${sy + 24}, ${tx} ${ty - 24}, ${tx} ${ty}`;
		}
		const dx = Math.max(40, (x2 - x1) / 2);
		return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
	}
	function edgeLabelPoint(edge: WorkflowAuditGraphEdge): { x: number; y: number } | null {
		const from = nodeById.get(edge.from);
		const to = nodeById.get(edge.to);
		if (!from || !to) return null;
		if (from.column === to.column) {
			return { x: x(from) + NODE_W / 2 + 6, y: (y(from) + NODE_H + y(to)) / 2 };
		}
		return { x: (x(from) + NODE_W + x(to)) / 2, y: (y(from) + y(to)) / 2 + NODE_H / 2 - 6 };
	}
	function edgeClass(edge: WorkflowAuditGraphEdge): string {
		switch (edge.kind) {
			case 'evidence':
				return 'stroke-accent stroke-[3]';
			case 'observation':
				return 'stroke-muted-foreground stroke-[1.5] [stroke-dasharray:5_4]';
			case 'synthesis':
				return 'stroke-foreground/60 stroke-[1.75]';
			case 'tool':
				return 'stroke-foreground/50 stroke-[1.25]';
			default:
				return 'stroke-foreground/45 stroke-[1.5]';
		}
	}
	function nodeFill(node: WorkflowAuditGraphNode): string {
		switch (node.state) {
			case 'accepted':
			case 'finalized':
			case 'available':
			case 'observed':
				return 'fill-success/10 stroke-success/60';
			case 'partial':
				return 'fill-warning/10 stroke-warning/70';
			case 'failed':
				return 'fill-destructive/10 stroke-destructive/70';
			case 'running':
				return 'fill-accent/15 stroke-accent';
			case 'cancelled':
			case 'not_completed':
			case 'skipped':
			case 'unavailable':
			case 'missing':
				return 'fill-muted stroke-muted-foreground/60';
			default:
				return 'fill-background stroke-border';
		}
	}
	function groupBox(group: { step_keys: string[] }) {
		const nodes = group.step_keys
			.map((key) => nodeById.get(`step:${key}`))
			.filter((node): node is WorkflowAuditGraphNode => Boolean(node));
		if (nodes.length === 0) return null;
		const minX = Math.min(...nodes.map((n) => x(n))) - 10;
		const maxX = Math.max(...nodes.map((n) => x(n) + NODE_W)) + 10;
		const minY = Math.min(...nodes.map((n) => y(n))) - 14;
		const maxY = Math.max(...nodes.map((n) => y(n) + NODE_H)) + 8;
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
	function handleKey(event: KeyboardEvent, id: string) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onSelect(id);
		}
	}
	const stateLabel = (state: string) => state.replace(/_/g, ' ');
</script>

{#if graph.nodes.length === 0}
	<div class="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
		No saved plan or step rows for this run, so there is no graph to draw. The raw records and
		coverage notes below describe what was recorded.
	</div>
{:else}
	<div class="overflow-x-auto rounded-lg border border-border bg-background">
		<svg
			viewBox={`0 0 ${width} ${height}`}
			{width}
			{height}
			class="block min-w-full"
			role="img"
			aria-label="Saved workflow graph"
		>
			<defs>
				<marker
					id="wf-arrow"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="8"
					markerHeight="8"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" class="fill-foreground/60" />
				</marker>
				<marker
					id="wf-arrow-accent"
					viewBox="0 0 10 10"
					refX="9"
					refY="5"
					markerWidth="8"
					markerHeight="8"
					orient="auto-start-reverse"
				>
					<path d="M 0 0 L 10 5 L 0 10 z" class="fill-accent" />
				</marker>
			</defs>

			{#each graph.parallel_groups as group (group.id)}
				{@const box = groupBox(group)}
				{#if box}
					<rect
						x={box.x}
						y={box.y}
						width={box.w}
						height={box.h}
						rx="12"
						class="fill-accent/5 stroke-accent/30 [stroke-dasharray:3_3]"
					/>
					<text
						x={box.x + 8}
						y={box.y + 11}
						class="fill-accent text-[10px] font-semibold uppercase tracking-wider"
						>parallel</text
					>
				{/if}
			{/each}

			{#each graph.edges as edge (edge.id)}
				{@const d = edgePath(edge)}
				{@const point = edgeLabelPoint(edge)}
				{#if d}
					<path
						{d}
						fill="none"
						class={edgeClass(edge)}
						marker-end={edge.kind === 'evidence'
							? 'url(#wf-arrow-accent)'
							: 'url(#wf-arrow)'}
					/>
					{#if edge.label && point}
						<text
							x={point.x}
							y={point.y}
							text-anchor="middle"
							class="fill-muted-foreground text-[10px]"
							>{edge.label.length > 34
								? `${edge.label.slice(0, 33)}…`
								: edge.label}</text
						>
					{/if}
				{/if}
			{/each}

			{#each graph.nodes as node (node.id)}
				{@const nx = x(node)}
				{@const ny = y(node)}
				{@const selected = node.id === selectedNodeId}
				<g
					role="button"
					tabindex="0"
					aria-label={`${node.label}: ${stateLabel(node.state)}`}
					aria-pressed={selected}
					class="cursor-pointer outline-none"
					onclick={() => onSelect(node.id)}
					onkeydown={(event) => handleKey(event, node.id)}
				>
					<rect
						x={nx}
						y={ny}
						width={NODE_W}
						height={NODE_H}
						rx={node.kind === 'answer' ? 28 : 10}
						class={`${nodeFill(node)} ${selected ? 'stroke-[3]' : 'stroke-[1.5]'} ${node.kind === 'shadow' ? '[stroke-dasharray:5_4]' : ''} transition-[stroke-width]`}
					/>
					{#if node.kind === 'tool'}
						<rect
							x={nx + 4}
							y={ny + 4}
							width={NODE_W - 8}
							height={NODE_H - 8}
							rx="6"
							fill="none"
							class="stroke-foreground/20"
						/>
					{/if}
					<text x={nx + 12} y={ny + 22} class="fill-foreground text-[12px] font-semibold"
						>{node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}</text
					>
					{#if node.sublabel}
						<text x={nx + 12} y={ny + 39} class="fill-muted-foreground text-[10px]"
							>{node.sublabel.length > 32
								? `${node.sublabel.slice(0, 31)}…`
								: node.sublabel}</text
						>
					{/if}
					<text
						x={nx + 12}
						y={ny + 57}
						class="fill-muted-foreground text-[10px] uppercase tracking-wider"
						>{node.kind === 'shadow'
							? `observation · ${stateLabel(node.state)}`
							: stateLabel(node.state)}</text
					>
				</g>
			{/each}
		</svg>
	</div>
	<ul class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
		<li>
			<span class="inline-block h-0.5 w-5 bg-accent align-middle"></span> saved evidence handoff
		</li>
		<li>
			<span class="inline-block h-px w-5 bg-foreground/50 align-middle"></span> plan dependency
			/ report
		</li>
		<li>
			<span
				class="inline-block w-5 border-t border-dashed border-muted-foreground align-middle"
			></span> Jev shadow observation (no execution authority)
		</li>
		<li>
			<span
				class="inline-block h-3 w-3 rounded-sm border border-dashed border-accent/40 bg-accent/5 align-middle"
			></span> ran in parallel
		</li>
	</ul>
{/if}
