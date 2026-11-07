<!-- apps/web/src/lib/components/ontology/EntityModalHeader.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		icon: Snippet;
		actions?: Snippet;
	}

	let { title, icon, actions }: Props = $props();
</script>

<div
	class="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border bg-muted px-3 py-2 sm:px-4 tx tx-strip tx-weak"
>
	<div class="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
		<div class="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
			{@render icon()}
		</div>
		<div class="min-w-0 flex-1">
			<h2 class="truncate text-base font-medium leading-tight text-foreground">
				{title}
			</h2>
		</div>
	</div>
	{#if actions}
		<div class="flex shrink-0 items-center gap-1">
			{@render actions()}
		</div>
	{/if}
</div>
