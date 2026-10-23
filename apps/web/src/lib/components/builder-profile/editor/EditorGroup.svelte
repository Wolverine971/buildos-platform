<!-- apps/web/src/lib/components/builder-profile/editor/EditorGroup.svelte -->
<!-- One group of the "Your page" editor: a heading, a one-line explanation, the body. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		title,
		hint = '',
		actions,
		children
	}: {
		id: string;
		title: string;
		hint?: string;
		actions?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section {id} class="scroll-mt-4 space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0" aria-labelledby="{id}-title">
	<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
		<div class="min-w-0 space-y-0.5">
			<h4 id="{id}-title" class="text-base font-semibold text-foreground">{title}</h4>
			{#if hint}
				<p class="text-sm text-muted-foreground">{hint}</p>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
	{@render children()}
</section>
