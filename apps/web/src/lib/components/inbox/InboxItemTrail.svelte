<!-- apps/web/src/lib/components/inbox/InboxItemTrail.svelte -->
<!--
	"How it got here" for one inbox item (tasker 156), always visible on the card: where it came
	from, why now, and the records it cited as links that open in a new tab. Built by
	inbox-item-trail.ts from what the item already stores.
-->
<script lang="ts">
	import { ArrowUpRight, History } from '$lib/icons/lucide';
	import InboxAutoCheck from './InboxAutoCheck.svelte';
	import type { InboxItemTrail } from './inbox-item-trail';

	let { trail }: { trail: InboxItemTrail } = $props();
</script>

<div class="mt-1 min-w-0 space-y-1">
	<p class="flex min-w-0 items-start gap-1 text-2xs text-muted-foreground">
		<History class="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
		<span class="min-w-0 break-words">{trail.origin}</span>
	</p>
	{#if trail.whyNow}
		<p class="break-words text-2xs text-muted-foreground">
			<span class="font-semibold text-foreground/80">Why now:</span>
			{trail.whyNow}
		</p>
	{/if}
	{#if trail.records.length}
		<ul class="flex min-w-0 flex-wrap items-center gap-1" aria-label="Records it looked at">
			<li class="text-2xs font-semibold text-foreground/80" aria-hidden="true">Looked at</li>
			{#each trail.records as record (record.key)}
				<li class="min-w-0 max-w-full">
					{#if record.href}
						<a
							href={record.href}
							target="_blank"
							rel="noopener"
							title={record.reason
								? `${record.kindLabel}: ${record.reason}`
								: record.kindLabel}
							class="inline-flex min-w-0 max-w-full items-center gap-0.5 rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-accent hover:bg-accent/5 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
						>
							<span class="sr-only">{record.kindLabel}:</span>
							<span class="truncate">{record.title}</span>
							<ArrowUpRight class="h-3 w-3 shrink-0" aria-hidden="true" />
							<span class="sr-only">(opens in a new tab)</span>
						</a>
					{:else}
						<span
							title={record.reason
								? `${record.kindLabel}: ${record.reason}`
								: record.kindLabel}
							class="inline-flex min-w-0 max-w-full items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 text-2xs text-foreground/90"
						>
							<span class="sr-only">{record.kindLabel}:</span>
							<span class="truncate">{record.title}</span>
						</span>
					{/if}
				</li>
			{/each}
			{#if trail.more}
				<li class="text-2xs text-muted-foreground">+{trail.more} more</li>
			{/if}
		</ul>
	{/if}
	{#if trail.check}
		<InboxAutoCheck check={trail.check} />
	{/if}
</div>
