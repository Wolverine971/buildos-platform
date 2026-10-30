<!-- apps/web/src/lib/components/inbox/InboxClearedPile.svelte -->
<!--
	The AI Inbox "Cleared" pile (tasker 149), bottom-right. Answers land here the moment they
	leave a card: a live count, the newest answer with Undo while it waits, and the whole list on
	open. Saves run in the background; anything that fails says so here and goes back on its card.
	It sits above the open inbox (moved to <body> as a modal root, so the inbox doesn't make it
	inert) and fades once everything has saved and the inbox is closed.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { portal } from '$lib/actions/portal';
	import {
		clearedPile,
		isPileEntryActive,
		pileClearedCount,
		type PileEntry
	} from '$lib/stores/inbox-cleared-pile.svelte';
	import {
		AlertTriangle,
		Check,
		ChevronDown,
		ChevronUp,
		CircleCheck,
		CircleDashed,
		LoaderCircle,
		Undo2,
		X
	} from '$lib/icons/lucide';
	import { CLEARED_PILE_ANCHOR_ID } from './pile-fly';

	const FADE_AFTER_MS = 6000;
	const LIST_ID = 'inbox-cleared-pile-list';
	const OFFSET_VAR = '--cleared-pile-offset';

	let open = $state(false);
	let now = $state(Date.now());
	let root = $state<HTMLDivElement | null>(null);

	const entries = $derived(clearedPile.entries);
	const newestFirst = $derived([...entries].reverse());
	const front = $derived(newestFirst[0] ?? null);
	const active = $derived(entries.filter(isPileEntryActive));
	const holding = $derived(active.some((entry) => entry.status === 'holding'));
	// Off your list the moment you answer; the count only drops if a save fails.
	const cleared = $derived(
		entries.reduce(
			(total, entry) =>
				total + (isPileEntryActive(entry) ? entry.count : pileClearedCount(entry)),
			0
		)
	);
	const saving = $derived(active.reduce((total, entry) => total + entry.count, 0));
	const backCount = $derived(
		entries.reduce(
			(total, entry) =>
				total +
				(entry.status === 'failed'
					? Math.max(1, entry.keys.length)
					: entry.status === 'partial'
						? entry.returnedKeys.length
						: 0),
			0
		)
	);
	const summary = $derived(
		[
			`Cleared ${cleared}`,
			saving ? `${saving} saving` : null,
			backCount ? `${backCount} back on your card` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	const announcement = $derived(
		front ? `${front.label}: ${front.title}. ${statusText(front)}` : ''
	);

	// Ticks only while an Undo countdown shows.
	$effect(() => {
		if (!holding) return;
		now = Date.now();
		const timer = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(timer);
	});

	// Once the inbox is closed and everything has saved, the pile fades. Anything that came
	// back stays until it is dismissed, so a failure is never missed.
	$effect(() => {
		if (clearedPile.pinned || active.length || backCount || !entries.length) return;
		const timer = setTimeout(() => clearedPile.dismissSettled(), FADE_AFTER_MS);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (!entries.length) open = false;
	});

	// Lets the inbox keep its last rows and sticky bars clear of the pile.
	$effect(() => {
		const el = root;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const style = document.documentElement.style;
		const update = () => style.setProperty(OFFSET_VAR, `${Math.ceil(el.offsetHeight) + 12}px`);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => {
			observer.disconnect();
			style.removeProperty(OFFSET_VAR);
		};
	});

	function secondsLeft(entry: PileEntry): number {
		return entry.holdUntil ? Math.max(1, Math.ceil((entry.holdUntil - now) / 1000)) : 0;
	}

	function statusText(entry: PileEntry): string {
		switch (entry.status) {
			case 'holding':
				return 'Undo is available for a few seconds.';
			case 'queued':
			case 'working':
				return 'Saving.';
			case 'done':
				return 'Done.';
			case 'partial':
				return entry.detail ?? 'Some of it is back on your card.';
			case 'failed':
				return entry.detail ?? "Couldn't save. It's back on your card.";
		}
	}

	function isEditable(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		return Boolean(
			target.isContentEditable || target.closest('input, textarea, select, [contenteditable]')
		);
	}

	// Cmd/Ctrl+Z takes back the newest answer while it waits (not while typing).
	function handleKeydown(event: KeyboardEvent) {
		if (!holding || event.shiftKey || event.altKey) return;
		if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
		if (isEditable(event.target)) return;
		if (clearedPile.undoLatest()) event.preventDefault();
	}

	function motion() {
		return prefersReducedMotion.current ? { y: 0, duration: 0 } : { y: 16, duration: 180 };
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#snippet entryRow(entry: PileEntry)}
	<li class="flex min-w-0 items-start gap-2 px-3 py-2" in:fly={motion()}>
		<span class="mt-0.5 shrink-0" aria-hidden="true">
			{#if entry.status === 'holding'}
				<CircleDashed class="h-4 w-4 text-muted-foreground" />
			{:else if entry.status === 'queued' || entry.status === 'working'}
				<LoaderCircle class="h-4 w-4 animate-spin text-accent motion-reduce:animate-none" />
			{:else if entry.status === 'done'}
				<Check class="h-4 w-4 text-success" />
			{:else}
				<AlertTriangle class="h-4 w-4 text-warning" />
			{/if}
		</span>
		<div class="min-w-0 flex-1">
			<p class="truncate text-xs font-semibold text-foreground" title={entry.title}>
				{entry.title}
			</p>
			<p class="truncate text-2xs text-muted-foreground">
				{entry.label}{entry.context ? ` · ${entry.context}` : ''}
			</p>
			{#if entry.detail && entry.status !== 'holding'}
				<p
					class="mt-0.5 line-clamp-3 break-words text-2xs {entry.status === 'done'
						? 'text-muted-foreground'
						: 'text-foreground'}"
				>
					{entry.detail}
				</p>
			{/if}
		</div>
		{#if entry.status === 'holding'}
			<button
				type="button"
				onclick={() => clearedPile.undo(entry.id)}
				title="Undo (⌘Z)"
				aria-label={`Undo: ${entry.title}`}
				class="-my-1 inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border-strong bg-background px-2 text-2xs font-semibold text-foreground pressable hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<Undo2 class="h-3 w-3" aria-hidden="true" />
				Undo
				<span class="stamp font-normal text-muted-foreground">{secondsLeft(entry)}s</span>
			</button>
		{:else if entry.status === 'queued' || entry.status === 'working'}
			<span class="shrink-0 text-2xs text-muted-foreground">Saving…</span>
		{/if}
	</li>
{/snippet}

{#if entries.length}
	<div
		use:portal
		bind:this={root}
		transition:fly={motion()}
		class="modal-root pointer-events-auto fixed bottom-[calc(0.75rem+var(--app-bottom-dock,0px))] right-3 z-[10002] w-[min(22rem,calc(100vw-1.5rem))] sm:bottom-4 sm:right-4"
		role="region"
		aria-label="Cleared from your inbox"
	>
		<div class="overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong">
			<div id={CLEARED_PILE_ANCHOR_ID} class="flex min-w-0 items-center gap-1 pr-1">
				<button
					type="button"
					onclick={() => (open = !open)}
					aria-expanded={open}
					aria-controls={LIST_ID}
					class="flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				>
					{#key cleared}
						<CircleCheck
							class="pile-pop h-4 w-4 shrink-0 {backCount
								? 'text-warning'
								: 'text-success'}"
							aria-hidden="true"
						/>
					{/key}
					<span class="min-w-0 truncate text-xs font-semibold text-foreground">
						{summary}
					</span>
					{#if open}
						<ChevronDown
							class="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{:else}
						<ChevronUp
							class="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{/if}
				</button>
				{#if !active.length}
					<button
						type="button"
						onclick={() => clearedPile.dismissSettled()}
						aria-label="Clear the list"
						title="Clear the list"
						class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<X class="h-3.5 w-3.5" aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if open}
				<ul
					id={LIST_ID}
					class="max-h-[min(50dvh,24rem)] divide-y divide-border overflow-y-auto overscroll-contain border-t border-border"
				>
					{#each newestFirst as entry (entry.id)}
						{@render entryRow(entry)}
					{/each}
				</ul>
			{:else if front}
				<ul id={LIST_ID} class="border-t border-border">
					{#key front.id}
						{@render entryRow(front)}
					{/key}
				</ul>
			{/if}
		</div>
		<p class="sr-only" aria-live="polite">{announcement}</p>
	</div>
{/if}

<style>
	:global(.pile-pop) {
		animation: pile-pop 320ms ease-out;
	}

	@keyframes pile-pop {
		0% {
			transform: scale(1);
		}
		40% {
			transform: scale(1.35);
		}
		100% {
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.pile-pop) {
			animation: none;
		}
	}
</style>
