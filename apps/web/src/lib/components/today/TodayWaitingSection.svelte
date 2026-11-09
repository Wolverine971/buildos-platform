<!-- apps/web/src/lib/components/today/TodayWaitingSection.svelte -->
<!-- "Waiting on you" and "You're waiting on": open asks the morning brief job read out of the
     person's tasks and project next steps. Rows can be marked done or removed, with Undo. -->
<script lang="ts">
	import { ArrowUpRight, Check, MessageCircle, Undo2, X } from '$lib/icons/lucide';
	import type { TodayWaitingItem } from '$lib/types/today';

	let {
		items,
		onOpen,
		onNudge,
		onSetStatus
	}: {
		items: TodayWaitingItem[];
		/** Open the linked task in the reader, or the project. */
		onOpen: (item: TodayWaitingItem) => void;
		/** Draft a follow-up in chat. */
		onNudge: (item: TodayWaitingItem) => void;
		/** Returns false when the save failed, so the row comes back. */
		onSetStatus: (
			item: TodayWaitingItem,
			status: 'open' | 'resolved' | 'dismissed'
		) => Promise<boolean>;
	} = $props();

	/** Rows acted on this visit: they stay in place with an Undo until the next load. */
	let settled = $state<Record<string, 'resolved' | 'dismissed'>>({});

	const onYou = $derived(items.filter((item) => item.direction === 'on_you'));
	const onThem = $derived(items.filter((item) => item.direction === 'on_them'));

	function sinceLabel(since: string | null): string | null {
		if (!since) return null;
		const date = new Date(`${since}T12:00:00Z`);
		if (Number.isNaN(date.getTime())) return null;
		return `since ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
	}

	async function settle(item: TodayWaitingItem, status: 'resolved' | 'dismissed') {
		settled = { ...settled, [item.id]: status };
		if (!(await onSetStatus(item, status))) {
			const { [item.id]: _removed, ...rest } = settled;
			settled = rest;
		}
	}

	async function undo(item: TodayWaitingItem) {
		const previous = settled[item.id];
		const { [item.id]: _removed, ...rest } = settled;
		settled = rest;
		if (!(await onSetStatus(item, 'open')) && previous) {
			settled = { ...settled, [item.id]: previous };
		}
	}
</script>

{#snippet row(item: TodayWaitingItem)}
	{@const done = settled[item.id]}
	{@const meta = [item.project_name, sinceLabel(item.since)].filter(Boolean).join(' · ')}
	<li
		class="flex min-w-0 items-start gap-3 border-t border-border/70 px-1 py-3 first:border-t-0 sm:px-2"
	>
		<span
			class="mt-0.5 max-w-[9rem] shrink-0 truncate text-xs font-medium text-foreground"
			title={item.who}>{item.who}</span
		>
		<div class="min-w-0 flex-1">
			<p
				class="text-sm leading-snug [overflow-wrap:anywhere] {done
					? 'text-muted-foreground line-through'
					: 'text-foreground'}"
			>
				{item.what}
			</p>
			{#if done}
				<p class="mt-0.5 text-xs text-muted-foreground">
					{done === 'resolved' ? 'Marked done' : 'Removed'}
				</p>
			{:else if meta}
				<p class="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-1">
			{#if done}
				<button
					type="button"
					class="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
					onclick={() => undo(item)}
				>
					<Undo2 class="h-3.5 w-3.5" /> Undo
				</button>
			{:else}
				{#if item.direction === 'on_them'}
					<button
						type="button"
						class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8"
						title="Draft a follow-up"
						aria-label="Draft a follow-up to {item.who}"
						onclick={() => onNudge(item)}
					>
						<MessageCircle class="h-4 w-4" />
					</button>
				{:else if item.task_id || item.project_id}
					<button
						type="button"
						class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8"
						title="Open"
						aria-label="Open {item.what}"
						onclick={() => onOpen(item)}
					>
						<ArrowUpRight class="h-4 w-4" />
					</button>
				{/if}
				<button
					type="button"
					class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8"
					title={item.direction === 'on_you' ? 'Done' : 'They came through'}
					aria-label="Mark done: {item.what}"
					onclick={() => settle(item, 'resolved')}
				>
					<Check class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8 [@media(pointer:fine)]:min-w-8"
					title="Not a real ask, remove it"
					aria-label="Remove: {item.what}"
					onclick={() => settle(item, 'dismissed')}
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</li>
{/snippet}

{#if items.length > 0}
	<section class="mt-6" aria-label="Who's waiting">
		{#if onYou.length > 0}
			<h2 class="mb-2 text-xs font-medium text-muted-foreground">Waiting on you</h2>
			<ul class="rounded-xl border border-border bg-card">
				{#each onYou as item (item.id)}
					{@render row(item)}
				{/each}
			</ul>
		{/if}
		{#if onThem.length > 0}
			<h2
				class="mb-2 text-xs font-medium text-muted-foreground {onYou.length > 0
					? 'mt-4'
					: ''}"
			>
				You're waiting on
			</h2>
			<ul class="rounded-xl border border-border bg-card">
				{#each onThem as item (item.id)}
					{@render row(item)}
				{/each}
			</ul>
		{/if}
	</section>
{/if}
