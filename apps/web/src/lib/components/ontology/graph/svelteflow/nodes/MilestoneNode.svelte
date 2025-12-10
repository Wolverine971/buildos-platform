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

	const dueDate = formatDate(data.metadata?.dueAt as string | undefined);
</script>

<div
	class="milestone-node px-3 py-2 border-2 shadow-md min-w-[110px] max-w-[170px] transition-all duration-200
		bg-emerald-50 dark:bg-emerald-900/30 border-emerald-500
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}"
	style="clip-path: polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%);"
>
	<Handle type="target" position={Position.Top} class="!bg-emerald-500 !w-2 !h-2" />

	<div class="flex items-center gap-1.5 pb-2">
		<Flag class="w-4 h-4 flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
		<span class="text-xs font-semibold truncate text-emerald-700 dark:text-emerald-300">
			{data.label}
		</span>
	</div>

	{#if dueDate}
		<div class="text-[10px] text-emerald-600 dark:text-emerald-400/70">
			Due: {dueDate}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-emerald-500 !w-2 !h-2" />
</div>

<style>
	.milestone-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
