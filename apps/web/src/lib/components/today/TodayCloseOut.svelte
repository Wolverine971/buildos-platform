<!-- apps/web/src/lib/components/today/TodayCloseOut.svelte -->
<!-- Evening close-out: what BuildOS saw today, then "did these happen?" for the day's picks.
     Nothing changes until Apply. Anything else goes to chat, which updates the projects. -->
<script lang="ts">
	import { Mic, Send } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import type { CloseOutAnswer, TodayPick } from './today-picks';

	let {
		picks,
		seenYou,
		seenAgents,
		onApply,
		onTalk,
		onHide
	}: {
		picks: TodayPick[];
		/** Changes the person made in BuildOS today (by hand or through chat); null while loading. */
		seenYou: number | null;
		/** One line per agent that wrote today, e.g. "Claude Code: 3 updates in TBPN". */
		seenAgents: string[];
		/** Returns how many changes were saved. */
		onApply: (answers: { pick: TodayPick; answer: CloseOutAnswer }[]) => Promise<number>;
		/** Hand the free text to chat. */
		onTalk: (text: string) => void;
		onHide: () => void;
	} = $props();

	const OPTIONS: { value: CloseOutAnswer; label: string }[] = [
		{ value: 'done', label: 'Done' },
		{ value: 'progress', label: 'Some progress' },
		{ value: 'not_today', label: 'Not today' },
		{ value: 'let_go', label: 'Let it go' }
	];

	let answers = $state<Record<string, CloseOutAnswer>>({});
	let note = $state('');
	let applying = $state(false);
	let appliedCount = $state<number | null>(null);
	const answered = $derived(picks.filter((pick) => answers[pick.key]));

	function choose(pick: TodayPick, value: CloseOutAnswer) {
		if (appliedCount !== null) return;
		if (answers[pick.key] === value) {
			const { [pick.key]: _removed, ...rest } = answers;
			answers = rest;
		} else {
			answers = { ...answers, [pick.key]: value };
		}
	}

	async function apply() {
		if (applying || answered.length === 0) return;
		applying = true;
		try {
			appliedCount = await onApply(
				answered.map((pick) => ({ pick, answer: answers[pick.key]! }))
			);
		} finally {
			applying = false;
		}
	}
</script>

<section
	class="mt-4 rounded-lg border border-accent/40 bg-card p-4 shadow-ink sm:p-5"
	aria-label="Close out the day"
>
	<div class="flex items-baseline justify-between gap-3">
		<h2 class="text-lg font-semibold tracking-tight text-foreground">Close out the day</h2>
		<button
			type="button"
			class="min-h-11 rounded-md px-2 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
			onclick={onHide}>Not now</button
		>
	</div>

	<div class="mt-2 text-sm text-muted-foreground">
		<p class="font-medium text-foreground">What BuildOS saw today</p>
		<p>
			{#if seenYou === null}
				Checking…
			{:else if seenYou === 0}
				You didn't change anything in BuildOS today.
			{:else}
				You changed {seenYou} thing{seenYou === 1 ? '' : 's'} in BuildOS.
			{/if}
		</p>
		{#each seenAgents as line (line)}
			<p class="truncate">{line}</p>
		{/each}
	</div>

	{#if picks.length > 0}
		<p class="micro-label mt-4 text-muted-foreground">Today's picks · did they happen?</p>
		<ul class="mt-1 rounded-lg border border-border">
			{#each picks as pick (pick.key)}
				<li class="border-t border-border/70 px-3 py-2.5 first:border-t-0">
					<p class="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
						{pick.title}
					</p>
					{#if pick.projectName}<p class="text-xs text-muted-foreground">
							{pick.projectName}
						</p>{/if}
					<div
						class="mt-2 flex flex-wrap gap-1.5"
						role="group"
						aria-label="What happened"
					>
						{#each OPTIONS as option (option.value)}
							{@const on = answers[pick.key] === option.value}
							<button
								type="button"
								aria-pressed={on}
								disabled={appliedCount !== null}
								class="min-h-11 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [@media(pointer:fine)]:min-h-8 {on
									? 'border-foreground bg-foreground text-background'
									: 'border-border bg-background text-foreground hover:border-foreground/60'}"
								onclick={() => choose(pick, option.value)}>{option.label}</button
							>
						{/each}
					</div>
				</li>
			{/each}
		</ul>
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
			{#if appliedCount !== null}
				<p class="text-sm font-medium text-success">
					Updated {appliedCount} thing{appliedCount === 1 ? '' : 's'}. Tomorrow starts
					from here.
				</p>
			{:else}
				<p class="text-xs text-muted-foreground">
					Skip anything. Nothing changes until you apply.
				</p>
				<Button
					variant="accent"
					size="sm"
					loading={applying}
					disabled={answered.length === 0}
					onclick={apply}
				>
					Apply{answered.length ? ` ${answered.length}` : ''}
				</Button>
			{/if}
		</div>
	{/if}

	<div class="mt-4">
		<label for="closeout-note" class="text-sm font-medium text-foreground"
			>Anything else happen? BuildOS will update your projects.</label
		>
		<div
			class="mt-1.5 flex items-end gap-2 rounded-md border border-border bg-background p-2 focus-within:border-accent"
		>
			<textarea
				id="closeout-note"
				bind:value={note}
				rows="2"
				class="min-h-11 flex-1 resize-y border-0 bg-transparent p-1 text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-sm"
				placeholder="Met Logan, he's in. Didn't get to the drafts. Bought the fridge."
			></textarea>
			<Button
				variant="primary"
				size="sm"
				icon={note.trim() ? Send : Mic}
				disabled={!note.trim()}
				onclick={() => {
					onTalk(note.trim());
					note = '';
				}}
				aria-label="Send to chat">Send</Button
			>
		</div>
	</div>
</section>
