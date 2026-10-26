<!-- apps/web/src/lib/components/email-campaigns/CampaignSection.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		id,
		step,
		title,
		description = '',
		optional = false,
		actions,
		children
	}: {
		id: string;
		step: number;
		title: string;
		description?: string;
		optional?: boolean;
		actions?: Snippet;
		children?: Snippet;
	} = $props();
</script>

<section
	{id}
	aria-labelledby="{id}-title"
	class="scroll-mt-24 rounded-xl border border-border bg-card shadow-ink tx tx-frame tx-weak"
>
	<header
		class="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
	>
		<div class="flex min-w-0 items-start gap-3">
			<span
				class="stamp mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs text-muted-foreground"
				aria-hidden="true"
			>
				{step}
			</span>
			<div class="min-w-0">
				<h2 id="{id}-title" class="text-base font-semibold text-foreground sm:text-lg">
					{title}
					{#if optional}
						<span class="ml-1 text-xs font-normal text-muted-foreground">optional</span>
					{/if}
				</h2>
				{#if description}
					<p class="mt-0.5 text-sm text-muted-foreground">{description}</p>
				{/if}
			</div>
		</div>
		{#if actions}
			<div class="flex shrink-0 flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</header>
	<div class="px-4 py-4 sm:px-5 sm:py-5">
		{@render children?.()}
	</div>
</section>
