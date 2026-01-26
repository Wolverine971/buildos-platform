<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/PlanNode.svelte -->
<!-- PlanNode.svelte - Svelte Flow custom node for plans -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { Calendar } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const stateStyles: Record<string, { bg: string; border: string }> = {
		draft: {
			bg: 'bg-muted',
			border: 'border-border'
		},
		active: {
			bg: 'bg-indigo-50 dark:bg-indigo-900/30',
			border: 'border-indigo-500'
		},
		complete: {
			bg: 'bg-indigo-100 dark:bg-indigo-900/50',
			border: 'border-indigo-600'
		},
		archived: {
			bg: 'bg-muted',
			border: 'border-border'
		}
	};

	const style = stateStyles[data.state ?? 'draft'] ?? stateStyles.draft;
</script>

<div
	class="plan-node px-3 py-2 rounded-lg border-2 shadow-md min-w-[120px] max-w-[180px] transition-all duration-200
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
		{style.bg} {style.border}"
>
	<Handle type="target" position={Position.Top} class="!bg-indigo-500 !w-2 !h-2" />

	<div class="flex items-center gap-2">
		<Calendar class="w-4 h-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400" />
		<span class="text-xs font-semibold truncate text-indigo-700 dark:text-indigo-300">
			{data.label}
		</span>
	</div>

	{#if data.state}
		<div class="mt-1">
			<span
				class="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400"
			>
				{data.state}
			</span>
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-indigo-500 !w-2 !h-2" />
</div>

<style>
	.plan-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
