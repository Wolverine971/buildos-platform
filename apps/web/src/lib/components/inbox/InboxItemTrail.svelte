<!-- apps/web/src/lib/components/inbox/InboxItemTrail.svelte -->
<!--
	"How it got here" for one inbox item (tasker 156), always visible on the card: where it came
	from, why now, and the records it cited as links that open in a new tab (the chat's record chip). Built by
	inbox-item-trail.ts from what the item already stores.
-->
<script lang="ts">
	import { History } from '$lib/icons/lucide';
	import RecordChip from '$lib/components/ui/RecordChip.svelte';
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
				<li class="min-w-0 max-w-full text-2xs">
					<RecordChip
						kind={record.kindLabel}
						title={record.title}
						href={record.href}
						tooltip={record.reason}
					/>
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
