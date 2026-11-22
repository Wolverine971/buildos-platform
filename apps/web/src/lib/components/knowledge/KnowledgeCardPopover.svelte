<!-- apps/web/src/lib/components/knowledge/KnowledgeCardPopover.svelte -->
<!--
	The knowledge card wherever a name in your work opens it: a task's text, a doc's text (tasker
	160). The same card /knowledge shows (contacts, connections you can click through — Secular
	Talk → Kyle Kulinski → back — where it shows up in your work, Find more, "All people"),
	anchored to the name on desktop and a bottom sheet on phones, with an optional line saying
	what the surrounding text said ("In this task: …") and a footer the host owns.

	Stays mounted while its host is: the popover shows while `anchor` and `rootId` are set, and
	the "What should we look for?" dialog it opens outlives the popover (Find more closes the
	popover so the dialog isn't stacked under it). Research then runs in the background; the
	app-wide tray and toast follow it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import TablePopover from '$lib/components/tables/TablePopover.svelte';
	import ErrorBoundary from '$lib/components/ui/ErrorBoundary.svelte';
	import { MapPin } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import KnowledgeEntityCard from './KnowledgeEntityCard.svelte';
	import KnowledgeEnrichDialog from './KnowledgeEnrichDialog.svelte';
	import KnowledgeMergeDialog from './KnowledgeMergeDialog.svelte';
	import {
		knowledgeResearch,
		knowledgeResearchStarted,
		watchKnowledgeResearch
	} from './research-session.svelte';
	import type { EnrichEntry, EnrichStarted } from './research-tray';

	interface Props {
		/** The name it hangs from; null while closed. */
		anchor: HTMLElement | null;
		/** The entry the name is; null while closed. */
		rootId: string | null;
		/** Accessible name, e.g. "About Kyle Kulinski". */
		label: string;
		onClose: () => void;
		/** What the host's text said about it, shown above the card on the first card. */
		context?: { label: string; quote: string | null; mapUrl?: string | null } | null;
		/** Host actions under the first card (e.g. "Hide here" on a task). */
		footer?: Snippet<[{ depth: number }]>;
		/** The entry was hidden or deleted from inside the card. */
		onRemoved?: (id: string) => void;
		/** The card renamed or combined entries: the host's highlights may have changed. */
		onChanged?: () => void;
	}

	let {
		anchor,
		rootId,
		label,
		onClose,
		context = null,
		footer,
		onRemoved,
		onChanged
	}: Props = $props();

	// "Merge…" (or a rename onto a name another card has): the dialog outlives the popover, like
	// Find more's, so it isn't stacked under it.
	let mergeIds = $state<string[] | null>(null);
	function openMerge(entity: { id: string; with?: string[] }) {
		onClose();
		mergeIds = [entity.id, ...(entity.with ?? [])];
	}
	function onMerged(result: { kept: string; merged: string[] }) {
		mergeIds = null;
		toastService.success(
			result.merged.length === 1 ? 'Merged' : `Merged ${result.merged.length + 1} into one`
		);
		onChanged?.();
	}

	// Writable derived: back to the root whenever another name opens; drilling pushes onto it.
	let stack = $derived<string[]>(rootId ? [rootId] : []);
	const top = $derived(stack.at(-1) ?? null);

	let enrichEntries = $state<EnrichEntry[] | null>(null);
	function findMore(entry: EnrichEntry) {
		watchKnowledgeResearch(); // loads today's research allowance for the dialog
		onClose();
		enrichEntries = [entry];
	}
	function onEnrichStarted(result: EnrichStarted) {
		const name = enrichEntries?.[0]?.name ?? 'this';
		enrichEntries = null;
		if (result.queued) {
			toastService.success(`Researching ${name}. We'll let you know what turns up.`);
			knowledgeResearchStarted();
		} else {
			toastService.info(
				result.refused ??
					result.skipped[0]?.reason ??
					'Research did not start. Try again later.'
			);
		}
	}
</script>

{#if anchor && top}
	<TablePopover {anchor} {label} width="w-96" {onClose}>
		{#if context?.quote && stack.length === 1}
			<div
				class="mx-4 mt-3 flex min-w-0 items-start gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground"
			>
				<p class="min-w-0 flex-1">
					<span class="font-medium text-foreground">{context.label}:</span>
					<span class="line-clamp-2">“{context.quote}”</span>
				</p>
				{#if context.mapUrl}
					<a
						href={context.mapUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex shrink-0 items-center gap-1 rounded font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						><MapPin class="h-3 w-3" aria-hidden="true" /> Map</a
					>
				{/if}
			</div>
		{/if}
		<ErrorBoundary area="knowledge card">
			{#key top}
				<KnowledgeEntityCard
					entityId={top}
					onOpen={(id) => (stack = [...stack, id])}
					onBack={stack.length > 1 ? () => (stack = stack.slice(0, -1)) : undefined}
					{onClose}
					research={knowledgeResearch.byEntity.get(top) ?? null}
					onFindMore={findMore}
					{onChanged}
					onMerge={openMerge}
					onRemoved={(id) => {
						onRemoved?.(id);
						onClose();
					}}
				/>
			{/key}
		</ErrorBoundary>
		{@render footer?.({ depth: stack.length })}
	</TablePopover>
{/if}

{#if mergeIds}
	<KnowledgeMergeDialog ids={mergeIds} onClose={() => (mergeIds = null)} {onMerged} />
{/if}

{#if enrichEntries}
	<KnowledgeEnrichDialog
		entries={enrichEntries}
		allowance={knowledgeResearch.allowance}
		onClose={() => (enrichEntries = null)}
		onStarted={onEnrichStarted}
	/>
{/if}
