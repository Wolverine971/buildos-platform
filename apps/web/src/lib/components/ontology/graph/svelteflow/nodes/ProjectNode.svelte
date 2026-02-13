<!-- apps/web/src/lib/components/ontology/graph/svelteflow/nodes/ProjectNode.svelte -->
<!-- ProjectNode.svelte - Svelte Flow custom node for projects -->
<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { FolderKanban } from 'lucide-svelte';
	import type { SvelteFlowNodeData } from '../../lib/svelteflow.service';

	let { data, selected }: { data: SvelteFlowNodeData; selected?: boolean } = $props();

	const defaultStyle = {
		bg: 'bg-muted',
		border: 'border-border',
		text: 'text-foreground'
	};

	const stateStyles: Record<string, { bg: string; border: string; text: string }> = {
		draft: defaultStyle,
		active: {
			bg: 'bg-emerald-50 dark:bg-emerald-900/30',
			border: 'border-emerald-500',
			text: 'text-emerald-700 dark:text-emerald-300'
		},
		complete: {
			bg: 'bg-blue-50 dark:bg-blue-900/30',
			border: 'border-blue-500',
			text: 'text-blue-700 dark:text-blue-300'
		},
		archived: {
			bg: 'bg-muted',
			border: 'border-border',
			text: 'text-muted-foreground'
		}
	};

	const style = stateStyles[data.state ?? 'draft'] ?? defaultStyle;
</script>

<div
	class="project-node px-3 py-2 rounded-lg border-2 shadow-ink min-w-[140px] max-w-[200px] transition-all duration-200
		{selected ? 'ring-2 ring-amber-400 ring-offset-2' : ''}
		{style.bg} {style.border}"
>
	<Handle type="target" position={Position.Top} class="!bg-emerald-500 !w-2.5 !h-2.5" />

	<div class="flex items-center gap-2">
		<FolderKanban class="w-4 h-4 flex-shrink-0 text-emerald-500" />
		<span class="text-sm font-semibold truncate {style.text}">
			{data.label}
		</span>
	</div>

	{#if data.state}
		<div class="mt-1.5 flex items-center gap-1.5">
			<span
				class="px-1.5 py-0.5 text-[10px] font-medium rounded-full
					{data.state === 'active'
					? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400'
					: data.state === 'complete'
						? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400'
						: 'bg-muted text-muted-foreground'}"
			>
				{data.state}
			</span>
			{#if data.metadata?.scale}
				<span class="text-[10px] text-muted-foreground">
					{data.metadata.scale}
				</span>
			{/if}
		</div>
	{/if}

	<Handle type="source" position={Position.Bottom} class="!bg-emerald-500 !w-2.5 !h-2.5" />
</div>

<style>
	.project-node {
		font-family: 'Inter', system-ui, sans-serif;
	}
</style>
