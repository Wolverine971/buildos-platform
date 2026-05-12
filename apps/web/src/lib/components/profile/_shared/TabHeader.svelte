<!-- apps/web/src/lib/components/profile/_shared/TabHeader.svelte -->
<script lang="ts">
	import type { Snippet, ComponentType } from 'svelte';

	let {
		icon: Icon,
		title,
		description = '',
		actions
	}: {
		icon: ComponentType;
		title: string;
		description?: string;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex items-start gap-3">
	<div
		class="flex items-center justify-center w-10 h-10 rounded-lg bg-accent shadow-ink flex-shrink-0"
	>
		<Icon class="w-5 h-5 text-accent-foreground" />
	</div>
	<div class="flex-1 min-w-0">
		<h2 class="text-lg sm:text-xl font-bold text-foreground">{title}</h2>
		{#if description}
			<p class="text-xs sm:text-sm text-muted-foreground mt-0.5">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex-shrink-0">
			{@render actions()}
		</div>
	{/if}
</div>
