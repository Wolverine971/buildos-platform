<!-- apps/web/src/lib/components/builder-profile/editor/PanelHead.svelte -->
<!-- The title and one-line explanation at the top of an editor panel. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		hint = '',
		actions
	}: { title: string; hint?: string; actions?: Snippet } = $props();
</script>

<div class="mb-5 flex items-start justify-between gap-3">
	<div class="min-w-0">
		<h2 class="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
		{#if hint}<p class="mt-0.5 text-sm text-muted-foreground">{hint}</p>{/if}
	</div>
	{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
</div>
