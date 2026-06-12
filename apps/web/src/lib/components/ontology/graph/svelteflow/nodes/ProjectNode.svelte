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
			bg: 'bg-success/10',
			border: 'border-success',
			text: 'text-success'
		},
		complete: {
			bg: 'bg-info/10',
			border: 'border-info',
			text: 'text-info'
		},
		archived: {
			bg: 'bg-muted',
			border: 'border-border',
			text: 'text-muted-foreground'
		}
	};

	const style = $derived(stateStyles[data.state ?? 'draft'] ?? defaultStyle);
</script>

<div
	class="project-node px-3 py-2 rounded-lg border-2 shadow-ink min-w-[140px] max-w-[200px] transition-all duration-200
		{selected ? 'ring-2 ring-accent ring-offset-2' : ''}
		{style.bg} {style.border}"
>
	<Handle type="target" position={Position.Top} class="!bg-success !w-2.5 !h-2.5" />

	<div class="flex items-center gap-2">
		<FolderKanban class="w-4 h-4 flex-shrink-0 text-success" />
		<span class="text-sm font-semibold truncate {style.text}">
			{data.label}
		</span>
	</div>

	{#if data.state}
		<div class="mt-1.5 flex items-center gap-1.5">
			<span
				class="px-1.5 py-0.5 text-[10px] font-medium rounded-full
					{data.state === 'active'
					? 'bg-success/15 text-success'
					: data.state === 'complete'
						? 'bg-info/15 text-info'
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

	<Handle type="source" position={Position.Bottom} class="!bg-success !w-2.5 !h-2.5" />
</div>

<style>
	.project-node {
		font-family: system-ui, sans-serif;
	}
</style>
