<!-- apps/web/src/lib/components/ui/DocumentChangeDiff.svelte -->
<!--
	Compact diff of an agent document change, rendered from the bounded hunks of a
	DocumentChangeSummaryV1 (no re-diffing). Shared by the "document updated" toast
	and the chat change card; line rendering is UnifiedDiffView's.
-->
<script lang="ts">
	import type { DocumentChangeHunkV1 } from '@buildos/shared-agent-ops/ontology/document-edits';
	import { ExternalLink } from '$lib/icons/lucide';
	import { createDocumentFieldDiffFromHunks } from '$lib/utils/document-diff';
	import UnifiedDiffView from './UnifiedDiffView.svelte';

	interface Props {
		hunks: DocumentChangeHunkV1[];
		linesAdded: number;
		linesRemoved: number;
		/** The receipt dropped hunks past its line budget. */
		truncated?: boolean;
		historyHref?: string | null;
		id?: string;
		/** Tailwind max-height class for the scrolling diff area. */
		maxHeightClass?: string;
	}

	let {
		hunks,
		linesAdded,
		linesRemoved,
		truncated = false,
		historyHref = null,
		id,
		maxHeightClass = 'max-h-72'
	}: Props = $props();

	const field = $derived(
		createDocumentFieldDiffFromHunks('content', 'Changes', hunks, {
			added: linesAdded,
			removed: linesRemoved
		})
	);
</script>

<div {id} class="overflow-hidden rounded-md border border-border bg-background shadow-ink-inner">
	{#if field.hasChanges}
		<div class="{maxHeightClass} overflow-y-auto overscroll-contain">
			<UnifiedDiffView fields={[field]} bare />
		</div>
	{:else}
		<p class="px-3 py-2 text-xs text-muted-foreground">No line preview for this change.</p>
	{/if}
	{#if truncated}
		<div
			class="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
		>
			<span>… more changes</span>
			{#if historyHref}
				<a
					href={historyHref}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 rounded-sm font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					See it all in version history
					<ExternalLink class="h-3 w-3 shrink-0" aria-hidden="true" />
					<span class="sr-only">(opens in a new tab)</span>
				</a>
			{/if}
		</div>
	{/if}
</div>
