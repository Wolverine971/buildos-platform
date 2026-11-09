<!-- apps/web/src/lib/components/today/TodayPickCard.svelte -->
<!-- The one thing on top of Today. Done moves the next pick up; "Not this" skips to the
     next; after the last one it says so instead of looping. -->
<script lang="ts">
	import { Check } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { PICK_TAGS, type TimeOfDay, type TodayPick } from './today-picks';

	let {
		picks,
		time,
		sideways = false,
		lastDone = null,
		lastTouched = null,
		onOpen,
		onDone,
		onSideways,
		onBack
	}: {
		picks: TodayPick[];
		time: TimeOfDay;
		/** "Today went sideways": the day is cleared, nothing rolls onto tomorrow. */
		sideways?: boolean;
		/** Title of the pick just marked done, shown once above the next one. */
		lastDone?: string | null;
		lastTouched?: string | null;
		onOpen: (pick: TodayPick) => void;
		onDone: (pick: TodayPick) => void;
		onSideways: () => void;
		onBack: () => void;
	} = $props();

	let skipped = $state<string[]>([]);
	const live = $derived(picks.filter((pick) => !skipped.includes(pick.key)));
	const pick = $derived(live[0] ?? null);
	const heading = $derived(lastDone ? 'Next up' : time === 'morning' ? 'Start here' : 'Next up');
</script>

<section
	class="mt-4 rounded-xl border border-border bg-card p-4 sm:p-5"
	aria-label="What to work on"
>
	{#if sideways}
		<p class="text-xs font-medium text-muted-foreground">Plan cleared for today</p>
		<h2 class="mt-2 text-lg font-medium leading-snug text-foreground sm:text-xl">
			OK. Today's off. Nothing gets pushed onto tomorrow.
		</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Your tasks keep their own dates. Come back whenever you're ready.
		</p>
		<div class="mt-3">
			<Button variant="outline" size="sm" onclick={onBack}>Actually, I'm back</Button>
		</div>
	{:else}
		{#if lastDone}
			<p class="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
				<Check class="h-4 w-4 shrink-0 text-success" /> Marked done: {lastDone}
			</p>
		{/if}
		{#if pick}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium text-muted-foreground">{heading}</span>
				<span class="inline-flex items-center gap-2 text-xs text-muted-foreground"
					><span
						class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"
						aria-hidden="true"
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
				<Button variant="primary" size="sm" onclick={() => onOpen(pick)}>Open it</Button>
				<Button variant="outline" size="sm" icon={Check} onclick={() => onDone(pick)}
					>Done</Button
				>
				<Button variant="ghost" size="sm" onclick={() => (skipped = [...skipped, pick.key])}
					>Not this</Button
				>
				{#if time !== 'morning'}
					<Button variant="ghost" size="sm" onclick={onSideways}
						>Today went sideways</Button
					>
				{/if}
			</div>
		{:else}
			<p class="text-xs font-medium text-muted-foreground">
				{picks.length > 0 ? "That's all I'd suggest" : 'Nothing pressing'}
			</p>
			<h2 class="mt-2 text-base font-medium leading-snug text-foreground sm:text-lg">
				Nothing else stands out. Pick anything below, or capture what's on your mind.
			</h2>
			{#if skipped.length > 0}
				<div class="mt-3">
					<Button variant="ghost" size="sm" onclick={() => (skipped = [])}
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
	{/if}
</section>
