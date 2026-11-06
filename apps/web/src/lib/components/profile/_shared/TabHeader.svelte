<!-- apps/web/src/lib/components/profile/_shared/TabHeader.svelte -->
<script lang="ts">
	import type { Snippet, ComponentType } from 'svelte';

	let {
		title,
		description = '',
		actions
	}: {
		/** Kept for callers; the settings nav shows the icon instead. */
		icon?: ComponentType;
		title: string;
		description?: string;
		actions?: Snippet;
	} = $props();
</script>

<!-- The settings nav already shows this tab's icon, so the header is text only. -->
<div class="flex items-start gap-3">
	<div class="flex-1 min-w-0">
		<h2 class="text-xl font-medium text-foreground">{title}</h2>
		{#if description}
			<p class="mt-1 text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex-shrink-0">
			{@render actions()}
		</div>
	{/if}
</div>
