<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/MilestoneNode.svelte -->
<!-- MilestoneNode.svelte - Svelte Flow custom node for milestones -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Flag } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const formatDate = (dateStr: string | undefined) => {
		if (!dateStr) return null;
		try {
			return new Date(dateStr).toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric'
			});
		} catch {
			return null;
		}
	};

	const dueDate = $derived(formatDate(data.metadata?.dueAt as string | undefined));
</script>

<div
	class="milestone-node px-3 py-2 border-2 shadow-ink min-w-[110px] max-w-[170px] transition-all duration-200
		bg-success/10 border-success
		{selected ? 'ring-2 ring-accent ring-offset-2' : ''}"
	style="clip-path: polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%);"
>
	<Handle type="target" position={Position.Top} class="!bg-success !w-2 !h-2" />

	<div class="flex items-center gap-1.5 pb-2">
		<Flag class="w-4 h-4 flex-shrink-0 text-success" />
		<span class="text-xs font-semibold truncate text-success">
			{data.label}
		</span>
	</div>

	{#if dueDate}
		<div class="text-[10px] text-success/70">
			Due: {dueDate}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-success !w-2 !h-2" />
</div>

<style>
	.milestone-node {
		font-family: system-ui, sans-serif;
	}
</style>
