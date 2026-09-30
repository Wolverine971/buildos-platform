<!-- apps/web/src/lib/components/organize/OrganizeTreeRow.svelte -->
<script lang="ts">
	import { FileText, CheckSquare, GripVertical, ArrowRight, Lock } from '$lib/icons/lucide';
	import type { OrganizeRef } from './organize-plan';
	let {
		ref,
		title,
		depth = 0,
		pinned = null,
		pending = false,
		selected = false,
		highlighted = false,
		onselect,
		onmove,
		onkeydown,
		onpointerdown
	}: {
		ref: OrganizeRef;
		title: string;
		depth?: number;
		pinned?: string | null;
		pending?: boolean;
		selected?: boolean;
		highlighted?: boolean;
		onselect: () => void;
		onmove: () => void;
		onkeydown: (event: KeyboardEvent) => void;
		onpointerdown: (event: PointerEvent) => void;
	} = $props();
</script>

<li
	class="flex min-w-0 items-center gap-1 rounded-md border text-sm {highlighted || selected
		? 'bg-accent/10'
		: ''}"
	class:border-dashed={pending}
	class:border-accent={pending || highlighted}
	class:border-transparent={!pending && !highlighted}
	style:padding-left={`${Math.min(depth, 8) * 16}px`}
>
	<button
		type="button"
		class="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-muted/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
		data-organize-row
		data-organize-id={ref.id}
		data-organize-drop
		data-project-id={ref.project_id}
		data-document-id={ref.kind === 'document' ? ref.id : undefined}
		aria-label={`${title}${pending ? ', planned move' : ''}`}
		aria-pressed={selected}
		onclick={onselect}
		{onkeydown}
		onpointerdown={(event) => {
			if (!pinned) onpointerdown(event);
		}}
	>
		{#if pinned}<Lock class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
		{:else}<GripVertical
				class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>{/if}
		{#if ref.kind === 'document'}<FileText
				class="h-4 w-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		{:else}<CheckSquare
				class="h-4 w-4 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>{/if}
		<span class="min-w-0 flex-1 truncate" title={pinned ?? title}>{title}</span>
		{#if pending}<span class="text-2xs font-medium text-foreground">Planned</span>{/if}
	</button>
	{#if !pinned}
		<button
			type="button"
			class="min-h-11 min-w-11 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
			aria-label={`Move ${title} to…`}
			onclick={onmove}><ArrowRight class="mx-auto h-4 w-4" aria-hidden="true" /></button
		>
	{/if}
</li>
