<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/GoalNode.svelte -->
<!-- GoalNode.svelte - Svelte Flow custom node for goals -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Target } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();
</script>

<div
	class="goal-node px-3 py-2.5 rounded-lg border-2 shadow-ink-strong min-w-[130px] max-w-[200px] transition-all duration-200
		bg-warning/10 border-warning
		{selected ? 'ring-2 ring-accent ring-offset-2' : ''}"
>
	<Handle type="target" position={Position.Top} class="!bg-warning !w-2.5 !h-2.5" />

	<div class="flex items-center gap-2">
		<Target class="w-5 h-5 flex-shrink-0 text-warning" />
		<span class="text-sm font-bold truncate text-warning">
			{data.label}
		</span>
	</div>

	{#if data.metadata?.typeKey}
		<div class="mt-1 text-[10px] text-warning/70 truncate">
			{data.metadata.typeKey}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-warning !w-2.5 !h-2.5" />
</div>

<style>
	.goal-node {
		font-family: system-ui, sans-serif;
	}
</style>
