<!-- apps/web/src/lib/components/today/TodayPickCard.svelte -->
<!-- The one thing on top of Today. Done moves the next pick up; "Not this" sends it to the
     bottom for the rest of the day (the page remembers, so a reload doesn't bring it back).
     When everything has been passed on, it says so instead of looping. -->
<script lang="ts">
	import { Check } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { PICK_TAGS, type TimeOfDay, type TodayPick } from './today-picks';

	let {
		picks,
		time,
		skippedCount = 0,
		lastDone = null,
		lastTouched = null,
		onOpen,
		onDone,
		onSkip,
		onShowSkipped
	}: {
		/** Best first, with anything passed on today already left out. */
		picks: TodayPick[];
		time: TimeOfDay;
		/** How many picks were passed on today. */
		skippedCount?: number;
		/** Title of the pick just marked done, shown once above the next one. */
		lastDone?: string | null;
		lastTouched?: string | null;
		onOpen: (pick: TodayPick) => void;
		onDone: (pick: TodayPick) => void;
		onSkip: (pick: TodayPick) => void;
		onShowSkipped: () => void;
	} = $props();

	const pick = $derived(picks[0] ?? null);
	const heading = $derived(lastDone ? 'Next up' : time === 'morning' ? 'Start here' : 'Next up');
</script>

<section
	class="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
	aria-label="What to work on"
>
	{#if lastDone}
		<p class="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
			<Check class="h-4 w-4 shrink-0 text-success" /> Marked done: {lastDone}
		</p>
	{/if}
	{#if pick}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs font-medium text-muted-foreground">{heading}</span>
			<span class="inline-flex items-center gap-2 text-xs text-muted-foreground"
				><span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true"
				></span>{PICK_TAGS[pick.kind]}</span
			>
		</div>
		<h2
			class="mt-2 text-lg font-medium leading-snug text-foreground [overflow-wrap:anywhere] sm:text-2xl"
		>
			{pick.title}
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			{#if pick.projectName}{`${pick.projectName} · `}{/if}{pick.why}
		</p>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<Button variant="primary" size="sm" onclick={() => onOpen(pick)}>Open</Button>
			<Button variant="outline" size="sm" icon={Check} onclick={() => onDone(pick)}
				>Done</Button
			>
			<Button variant="ghost" size="sm" onclick={() => onSkip(pick)}>Not this</Button>
		</div>
	{:else}
		<p class="text-xs font-medium text-muted-foreground">
			{skippedCount > 0 ? "That's all I'd suggest" : 'Nothing pressing'}
		</p>
		<h2 class="mt-2 text-base font-medium leading-snug text-foreground sm:text-lg">
			Nothing else stands out. Pick anything below, or capture what's on your mind.
		</h2>
		{#if skippedCount > 0}
			<div class="mt-3">
				<Button variant="ghost" size="sm" onclick={onShowSkipped}
					>Show the suggestions again</Button
				>
			</div>
		{/if}
	{/if}
	{#if lastTouched}
		<p class="mt-3 border-t border-border/70 pt-2 text-xs text-muted-foreground">
			{lastTouched}
		</p>
	{/if}
</section>
