<!-- apps/web/src/lib/components/agent/TableChangeCards.svelte -->
<!--
	End-of-turn cards for tables the agent changed (BuildOS Tables, 2026-10-04):
	one card per table, a turn's changes merged upstream. Each shows
	"+3 rows · 7 cells", expands to sample cell diffs, opens the table, and offers
	one-click Undo. Rendered only from the structured `table_change` receipt.
-->
<script lang="ts">
	import {
		Check,
		ChevronDown,
		ExternalLink,
		LoaderCircle,
		RotateCcw,
		Table,
		TriangleAlert
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import {
		describeTableChange,
		tableChangeHref,
		undoTableChange,
		type TableChangeCard
	} from './table-change-cards';

	let {
		changes,
		animateEntrance = true,
		onUndone
	}: {
		changes: TableChangeCard[];
		/** Play the "just created" entrance. Off for cards restored with a session. */
		animateEntrance?: boolean;
		/**
		 * Called after Undo changed the table so the host can refresh open views;
		 * `complete` is false when a multi-change Undo stopped partway.
		 */
		onUndone?: (card: TableChangeCard, complete: boolean) => void;
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

	async function handleUndo(card: TableChangeCard) {
		const current = stateOf(card.id);
		if (current.undoing || current.undone || card.undone) return;
		patchState(card.id, { undoing: true, conflict: null, error: null });
		const result = await undoTableChange(card);
		if (result.status === 'undone') {
			patchState(card.id, { undoing: false, undone: true });
			toastService.success(`Undid the changes to “${card.title}”`);
			onUndone?.(card, true);
			return;
		}
		// A partial undo still changed the table; let open views refresh.
		if (result.reverted > 0) onUndone?.(card, false);
		if (result.status === 'conflict') {
			patchState(card.id, { undoing: false, conflict: result.message });
			return;
		}
		patchState(card.id, { undoing: false, error: result.message });
	}
</script>

<div class="flex w-full max-w-xl flex-col gap-1.5" data-testid="table-change-cards">
	<div class="micro-label flex items-center gap-1.5 text-muted-foreground">
		<Table class="h-3 w-3 text-accent" aria-hidden="true" />
		<span>{changes.length === 1 ? 'Changed table' : `Changed ${changes.length} tables`}</span>
	</div>

	{#each changes as card, index (card.id)}
		{@const cardState = stateOf(card.id)}
		{@const undone = cardState.undone || card.undone === true}
		{@const sampleId = `${uid}-sample-${index}`}
		{@const summary = describeTableChange(card)}
		<article
			class="min-w-0 rounded-lg border border-border bg-card shadow-ink"
			class:entity-just-created={animateEntrance}
			aria-label={`Changed table: ${card.title}`}
		>
			<button
				type="button"
				class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
				aria-expanded={cardState.expanded}
				aria-controls={sampleId}
				disabled={card.sample.length === 0}
				onclick={() => patchState(card.id, { expanded: !cardState.expanded })}
			>
				<Table class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
				<span class="flex min-w-0 flex-1 flex-col leading-tight">
					<span
						class="truncate text-sm font-medium {undone
							? 'text-muted-foreground line-through'
							: 'text-foreground'}">{card.title}</span
					>
					<span class="truncate text-2xs font-medium text-muted-foreground">
						{#if undone}
							Undone
						{:else}
							{summary}{#if card.sample.length > 0}
								· {cardState.expanded ? 'hide changes' : 'view changes'}{/if}
						{/if}
					</span>
				</span>
				{#if card.sample.length > 0}
					<ChevronDown
						class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {cardState.expanded
							? 'rotate-180'
							: ''}"
						aria-hidden="true"
					/>
				{/if}
			</button>

			{#if cardState.expanded && card.sample.length > 0}
				<div id={sampleId} class="px-3 pb-2">
					<ul class="flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-2">
						{#each card.sample as diff, diffIndex (`${diff.row}:${diff.column}:${diffIndex}`)}
							<li class="min-w-0 text-xs leading-snug">
								<span class="font-mono text-2xs text-muted-foreground"
									>{diff.row}</span
								>
								<span class="font-medium text-foreground">{diff.column}</span>
								<span class="block min-w-0 break-words">
									{#if diff.before}
										<span class="text-destructive line-through"
											>{diff.before}</span
										>
										<span class="text-muted-foreground" aria-hidden="true">
											→
										</span>
									{/if}
									<span class="text-success">{diff.after || '(cleared)'}</span>
								</span>
							</li>
						{/each}
					</ul>
					{#if card.cellsChanged > card.sample.length}
						<p class="mt-1 text-2xs text-muted-foreground">
							Showing {card.sample.length} of {card.cellsChanged} changed cells.
						</p>
					{/if}
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
				{:else if !cardState.conflict}
					<button
						type="button"
						class="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-border-strong bg-card px-2.5 text-xs font-semibold text-foreground shadow-ink pressable hover:border-accent hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70 sm:min-h-9"
						disabled={cardState.undoing}
						aria-label={`Undo the changes to ${card.title}`}
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
				<a
					href={tableChangeHref(card)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
				>
					Open table
					<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
					<span class="sr-only">(opens in a new tab)</span>
				</a>
			</div>
		</article>
	{/each}
</div>
