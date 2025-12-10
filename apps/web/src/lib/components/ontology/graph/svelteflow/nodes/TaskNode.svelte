<!-- TaskNode.svelte - Svelte Flow custom node for tasks -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { ListChecks } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const stateStyles: Record<string, { bg: string; border: string; icon: string }> = {
		done: {
			bg: 'bg-emerald-50 dark:bg-emerald-900/30',
			border: 'border-emerald-500',
			icon: 'text-emerald-500'
		},
		completed: {
			bg: 'bg-emerald-50 dark:bg-emerald-900/30',
			border: 'border-emerald-500',
			icon: 'text-emerald-500'
		},
		complete: {
			bg: 'bg-emerald-50 dark:bg-emerald-900/30',
			border: 'border-emerald-500',
			icon: 'text-emerald-500'
		},
		in_progress: {
			bg: 'bg-amber-50 dark:bg-amber-900/30',
			border: 'border-amber-500',
			icon: 'text-amber-500'
		},
		active: {
			bg: 'bg-amber-50 dark:bg-amber-900/30',
			border: 'border-amber-500',
			icon: 'text-amber-500'
		},
		todo: {
			bg: 'bg-gray-50 dark:bg-gray-800',
			border: 'border-gray-400',
			icon: 'text-gray-500'
		},
		draft: {
			bg: 'bg-gray-50 dark:bg-gray-800',
			border: 'border-gray-400',
			icon: 'text-gray-500'
		}
	};

	const style = stateStyles[data.state ?? 'todo'] ?? stateStyles.todo;
</script>

<div
	class="task-node px-2.5 py-1.5 rounded-full border-2 shadow-sm min-w-[100px] max-w-[160px] transition-all duration-200
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
		{style.bg} {style.border}"
>
	<Handle type="target" position={Position.Top} class="!bg-gray-500 !w-2 !h-2" />

	<div class="flex items-center gap-1.5">
		<ListChecks class="w-3.5 h-3.5 flex-shrink-0 {style.icon}" />
		<span class="text-xs font-medium truncate text-gray-700 dark:text-gray-300">
			{data.label}
		</span>
	</div>

	<Handle type="source" position={Position.Bottom} class="!bg-gray-500 !w-2 !h-2" />
</div>

<style>
	.task-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
