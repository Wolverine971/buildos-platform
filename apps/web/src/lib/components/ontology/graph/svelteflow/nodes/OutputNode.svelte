<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/OutputNode.svelte -->
<!-- OutputNode.svelte - Svelte Flow custom node for outputs -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Layers } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const primitiveStyles: Record<string, { bg: string; border: string; icon: string }> = {
		document: {
			bg: 'bg-blue-50 dark:bg-blue-900/30',
			border: 'border-blue-500',
			icon: 'text-blue-500'
		},
		event: {
			bg: 'bg-purple-50 dark:bg-purple-900/30',
			border: 'border-purple-500',
			icon: 'text-purple-500'
		},
		collection: {
			bg: 'bg-amber-50 dark:bg-amber-900/30',
			border: 'border-amber-500',
			icon: 'text-amber-500'
		},
		external: {
			bg: 'bg-emerald-50 dark:bg-emerald-900/30',
			border: 'border-emerald-500',
			icon: 'text-emerald-500'
		}
	};

	const primitive = (data.metadata?.primitive as string) ?? 'document';
	const style = primitiveStyles[primitive] ?? primitiveStyles.document;
</script>

<div
	class="output-node px-3 py-2 border-2 shadow-md min-w-[110px] max-w-[170px] transition-all duration-200
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
		{style.bg} {style.border}"
	style="transform: rotate(45deg); border-radius: 4px;"
>
	<div style="transform: rotate(-45deg);">
		<Handle type="target" position={Position.Top} class="!bg-purple-500 !w-2 !h-2" />

		<div class="flex items-center gap-1.5">
			<Layers class="w-4 h-4 flex-shrink-0 {style.icon}" />
			<span class="text-xs font-medium truncate text-gray-700 dark:text-gray-300">
				{data.label}
			</span>
		</div>

		{#if primitive}
			<div class="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
				{primitive}
			</div>
		{/if}

		<Handle type="source" position={Position.Bottom} class="!bg-purple-500 !w-2 !h-2" />
	</div>
</div>

<style>
	.output-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
