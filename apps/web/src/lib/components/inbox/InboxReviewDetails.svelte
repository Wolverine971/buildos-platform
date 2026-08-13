<!-- apps/web/src/lib/components/inbox/InboxReviewDetails.svelte -->
<!--
	Keeps Project Review provenance and supporting evidence available without
	letting generator taxonomy compete with the recommendation and why-now copy.
-->
<script lang="ts">
	import { ChevronDown } from '$lib/icons/lucide';

	let {
		metadata = [],
		summary = null,
		evidence = []
	}: {
		metadata?: string[];
		summary?: string | null;
		evidence?: string[];
	} = $props();

	const cleanMetadata = $derived(metadata.map((value) => value.trim()).filter(Boolean));
	const cleanSummary = $derived(summary?.trim() || null);
	const cleanEvidence = $derived(evidence.map((value) => value.trim()).filter(Boolean));
	const hasDetails = $derived(
		cleanMetadata.length > 0 || Boolean(cleanSummary) || cleanEvidence.length > 0
	);
</script>

{#if hasDetails}
	<details class="group mt-1.5">
		<summary
			class="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-2xs font-semibold text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none [&::-webkit-details-marker]:hidden"
		>
			<ChevronDown
				class="h-3 w-3 shrink-0 -rotate-90 transition-transform group-open:rotate-0 motion-reduce:transition-none"
			/>
			Details
		</summary>

		<div class="ml-1 space-y-2 border-l border-border pl-3">
			{#if cleanMetadata.length}
				<p class="break-words text-2xs text-muted-foreground">
					{cleanMetadata.join(' · ')}
				</p>
			{/if}

			{#if cleanSummary}
				<p class="break-words text-xs text-muted-foreground">
					<span class="font-semibold text-foreground/80">Additional context:</span>
					{cleanSummary}
				</p>
			{/if}

			{#if cleanEvidence.length}
				<div>
					<p class="micro-label text-muted-foreground">Evidence</p>
					<div class="mt-1 flex flex-wrap gap-1.5">
						{#each cleanEvidence as label, index (`${label}-${index}`)}
							<span
								class="inline-block max-w-full truncate rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-2xs text-muted-foreground sm:max-w-[18rem]"
								title={label}
							>
								{label}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</details>
{/if}
