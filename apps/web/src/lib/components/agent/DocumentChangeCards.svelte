<!-- apps/web/src/lib/components/agent/DocumentChangeCards.svelte -->
<!--
	End-of-turn cards for documents the agent edited (one card per document; a
	turn's edits are merged upstream). Each shows "+X −Y", expands to the diff,
	opens the document, and offers one-click Undo. An Undo conflict, or a change too
	large to carry an inverse patch, points to version history instead.
-->
<script lang="ts">
	import {
		Check,
		ChevronDown,
		ExternalLink,
		FileText,
		History,
		LoaderCircle,
		RotateCcw,
		TriangleAlert
	} from '$lib/icons/lucide';
	import DocumentChangeDiff from '$lib/components/ui/DocumentChangeDiff.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import {
		documentChangeHref,
		documentHistoryHref,
		undoDocumentChange,
		type DocumentChangeCard
	} from './document-change-cards';

	let {
		changes,
		animateEntrance = true,
		onUndone
	}: {
		changes: DocumentChangeCard[];
		/** Play the "just created" entrance. Off for cards restored with a session. */
		animateEntrance?: boolean;
		/** Called after a successful Undo so the host can mark it and refresh open views. */
		onUndone?: (card: DocumentChangeCard, document: Record<string, unknown> | null) => void;
	} = $props();

	type CardState = {
		expanded: boolean;
		undoing: boolean;
		undone: boolean;
		conflict: string | null;
		error: string | null;
	};
	const IDLE: CardState = {
		expanded: false,
		undoing: false,
		undone: false,
		conflict: null,
		error: null
	};

	const uid = $props.id();
	let cardStates = $state<Record<string, CardState>>({});

	function stateOf(id: string): CardState {
		return cardStates[id] ?? IDLE;
	}

	function patchState(id: string, next: Partial<CardState>) {
		cardStates[id] = { ...stateOf(id), ...next };
	}

	async function handleUndo(card: DocumentChangeCard) {
		const current = stateOf(card.id);
		if (current.undoing || current.undone || card.undone) return;
		patchState(card.id, { undoing: true, conflict: null, error: null });
		const result = await undoDocumentChange(card);
		if (result.status === 'undone') {
			patchState(card.id, { undoing: false, undone: true });
			toastService.success(`Undid the edit to “${card.title}”`);
			onUndone?.(card, result.document);
			return;
		}
		if (result.status === 'conflict') {
			patchState(card.id, { undoing: false, conflict: result.message });
			return;
		}
		patchState(card.id, { undoing: false, error: result.message });
	}
</script>

<div class="flex w-full max-w-xl flex-col gap-1.5" data-testid="document-change-cards">
	<div class="micro-label flex items-center gap-1.5 text-muted-foreground">
		<FileText class="h-3 w-3 text-accent" aria-hidden="true" />
		<span>{changes.length === 1 ? 'Edited' : `Edited ${changes.length} documents`}</span>
	</div>

	{#each changes as card, index (card.id)}
		{@const cardState = stateOf(card.id)}
		{@const undone = cardState.undone || card.undone === true}
		{@const diffId = `${uid}-diff-${index}`}
		{@const showHistory = !undone && (!card.revertPatches || cardState.conflict !== null)}
		<article
			class="min-w-0 rounded-lg border border-border bg-card shadow-ink"
			class:entity-just-created={animateEntrance}
			aria-label={`Edited document: ${card.title}`}
		>
			<button
				type="button"
				class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
				aria-expanded={cardState.expanded}
				aria-controls={diffId}
				onclick={() => patchState(card.id, { expanded: !cardState.expanded })}
			>
				<FileText class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
				<span class="flex min-w-0 flex-1 flex-col leading-tight">
					<span
						class="truncate text-sm font-medium {undone
							? 'text-muted-foreground line-through'
							: 'text-foreground'}">{card.title}</span
					>
					<span class="text-2xs font-medium text-muted-foreground">
						{#if undone}
							Undone
						{:else if card.editCount > 1}
							{card.editCount} edits · {cardState.expanded
								? 'hide changes'
								: 'view changes'}
						{:else}
							Updated · {cardState.expanded ? 'hide changes' : 'view changes'}
						{/if}
					</span>
				</span>
				<span
					class="shrink-0 font-mono text-xs font-semibold tabular-nums {undone
						? 'opacity-50'
						: ''}"
					aria-hidden="true"
				>
					<span class="text-success">+{card.linesAdded}</span>
					<span class="text-destructive">&minus;{card.linesRemoved}</span>
				</span>
				<span class="sr-only">
					{card.linesAdded} lines added, {card.linesRemoved} lines removed
				</span>
				<ChevronDown
					class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {cardState.expanded
						? 'rotate-180'
						: ''}"
					aria-hidden="true"
				/>
			</button>

			{#if cardState.expanded}
				<div id={diffId} class="px-3 pb-2">
					<DocumentChangeDiff
						hunks={card.hunks}
						linesAdded={card.linesAdded}
						linesRemoved={card.linesRemoved}
						truncated={card.hunksTruncated}
						historyHref={documentHistoryHref(card)}
					/>
				</div>
			{/if}

			{#if cardState.conflict}
				<p
					class="mx-3 mb-2 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 text-xs text-foreground"
					role="alert"
				>
					<TriangleAlert
						class="mt-px h-3.5 w-3.5 shrink-0 text-warning"
						aria-hidden="true"
					/>
					<span>{cardState.conflict}</span>
				</p>
			{:else if cardState.error}
				<p
					class="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-foreground"
					role="alert"
				>
					{cardState.error}
				</p>
			{:else if !card.revertPatches && !undone}
				<p class="mx-3 mb-2 text-2xs text-muted-foreground">
					This change is too large for one-click Undo. Restore it from version history.
				</p>
			{/if}

			<div class="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
				{#if undone}
					<span
						class="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-success"
						role="status"
					>
						<Check class="h-3.5 w-3.5" aria-hidden="true" />
						Undone
					</span>
				{:else if card.revertPatches && !cardState.conflict}
					<button
						type="button"
						class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-xs font-semibold text-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 sm:min-h-9"
						disabled={cardState.undoing}
						aria-label={`Undo the edit to ${card.title}`}
						onclick={() => handleUndo(card)}
					>
						{#if cardState.undoing}
							<LoaderCircle
								class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
								aria-hidden="true"
							/>
							Undoing…
						{:else}
							<RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
							Undo
						{/if}
					</button>
				{/if}
				{#if showHistory}
					<a
						href={documentHistoryHref(card)}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-xs font-semibold text-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
					>
						<History class="h-3.5 w-3.5" aria-hidden="true" />
						Open version history
						<span class="sr-only">(opens in a new tab)</span>
					</a>
				{/if}
				<a
					href={documentChangeHref(card)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
				>
					Open document
					<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
					<span class="sr-only">(opens in a new tab)</span>
				</a>
			</div>
		</article>
	{/each}
</div>
