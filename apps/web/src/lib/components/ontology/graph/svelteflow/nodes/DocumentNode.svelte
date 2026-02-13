<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/DocumentNode.svelte -->
<!-- DocumentNode.svelte - Svelte Flow custom node for documents -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { FileText } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();
</script>

<div
	class="document-node px-2.5 py-2 rounded border-2 shadow-ink min-w-[100px] max-w-[160px] transition-all duration-200
		bg-cyan-50 dark:bg-cyan-900/30 border-cyan-500
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}"
>
	<Handle type="target" position={Position.Top} class="!bg-cyan-500 !w-2 !h-2" />

	<div class="flex items-center gap-1.5">
		<FileText class="w-3.5 h-3.5 flex-shrink-0 text-cyan-500 dark:text-cyan-400" />
		<span class="text-xs font-medium truncate text-cyan-700 dark:text-cyan-300">
			{data.label}
		</span>
	</div>

	{#if data.metadata?.typeKey}
		<div class="mt-1 text-[10px] text-cyan-600 dark:text-cyan-400/70 truncate">
			{data.metadata.typeKey}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-cyan-500 !w-2 !h-2" />
</div>

<style>
	.document-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
