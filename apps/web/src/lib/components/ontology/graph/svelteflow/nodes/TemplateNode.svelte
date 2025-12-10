<!-- TemplateNode.svelte - Svelte Flow custom node for templates -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Hexagon } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const isAbstract = data.metadata?.isAbstract ?? false;
</script>

<div
	class="template-node px-3 py-2 rounded-lg border-2 shadow-md min-w-[120px] max-w-[180px] transition-all duration-200
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
		{isAbstract
		? 'bg-gray-50 dark:bg-gray-800 border-gray-400'
		: 'bg-blue-50 dark:bg-blue-900/30 border-blue-500'}"
>
	<Handle type="target" position={Position.Top} class="!bg-gray-500 !w-2 !h-2" />

	<div class="flex items-center gap-2">
		<Hexagon
			class="w-4 h-4 flex-shrink-0 {isAbstract
				? 'text-gray-500'
				: 'text-blue-500 dark:text-blue-400'}"
		/>
		<span
			class="text-xs font-medium truncate {isAbstract
				? 'text-gray-700 dark:text-gray-300'
				: 'text-blue-700 dark:text-blue-300'}"
		>
			{data.label}
		</span>
	</div>

	{#if data.metadata?.typeKey}
		<div class="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
			{data.metadata.typeKey}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-gray-500 !w-2 !h-2" />
</div>

<style>
	.template-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
