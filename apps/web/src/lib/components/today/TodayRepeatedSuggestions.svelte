<!-- apps/web/src/lib/components/today/TodayRepeatedSuggestions.svelte -->
<!-- Tasks the daily brief has put in "Start here" every morning for days. Keep hides the row
     here for two weeks; Snooze moves the due date a month out and Let go archives the task,
     which also takes it out of the brief. Each has Undo. -->
<script lang="ts">
	import { Undo2 } from '$lib/icons/lucide';
	import type { TodayRepeatedSuggestion } from '$lib/types/today';
	import type { RepeatedChoice } from './today-picks';

	let {
		items,
		onChoose,
		onUndo
	}: {
		items: TodayRepeatedSuggestion[];
		/** Returns false when the save failed. */
		onChoose: (item: TodayRepeatedSuggestion, choice: RepeatedChoice) => Promise<boolean>;
		onUndo: (item: TodayRepeatedSuggestion, choice: RepeatedChoice) => Promise<boolean>;
	} = $props();

	let chosen = $state<Record<string, RepeatedChoice>>({});
	const DONE_LABEL: Record<RepeatedChoice, string> = {
		keep: 'Kept. Hidden here for two weeks.',
		snooze: 'Snoozed a month.',
		let_go: 'Let go. It moved to the archive.'
	};

	async function choose(item: TodayRepeatedSuggestion, choice: RepeatedChoice) {
		chosen = { ...chosen, [item.task_id]: choice };
		if (!(await onChoose(item, choice))) {
			const { [item.task_id]: _removed, ...rest } = chosen;
			chosen = rest;
		}
	}

	async function undo(item: TodayRepeatedSuggestion) {
		const choice = chosen[item.task_id];
		if (!choice) return;
		const { [item.task_id]: _removed, ...rest } = chosen;
		chosen = rest;
		if (!(await onUndo(item, choice))) chosen = { ...chosen, [item.task_id]: choice };
	}

	const actionClass =
		'min-h-11 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:border-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8';
</script>

{#if items.length > 0}
	<section class="mt-6" aria-label="Suggested every morning">
		<h2 class="micro-label text-muted-foreground">Your brief keeps suggesting these</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			They haven't moved. Keep them, snooze them, or let them go, and they'll stop showing up.
		</p>
		<ul class="mt-2 rounded-lg border border-border bg-card">
			{#each items as item (item.task_id)}
				{@const choice = chosen[item.task_id]}
				<li
					class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/70 px-3 py-2.5 first:border-t-0"
				>
					<span class="w-16 shrink-0 text-xs tabular-nums text-muted-foreground"
						>{item.days} days</span
					>
					<div class="min-w-0 flex-1 basis-48">
						<p
							class="text-sm [overflow-wrap:anywhere] {choice
								? 'text-muted-foreground line-through'
								: 'font-medium text-foreground'}"
						>
							{item.title}
						</p>
						<p class="text-xs text-muted-foreground">
							{choice ? DONE_LABEL[choice] : item.project_name}
						</p>
					</div>
					<div class="flex shrink-0 gap-1.5">
						{#if choice}
							<button
								type="button"
								class="{actionClass} inline-flex items-center gap-1"
								onclick={() => undo(item)}
								><Undo2 class="h-3.5 w-3.5" /> Undo</button
							>
						{:else}
							<button
								type="button"
								class={actionClass}
								onclick={() => choose(item, 'keep')}>Keep</button
							>
							<button
								type="button"
								class={actionClass}
								onclick={() => choose(item, 'snooze')}>Snooze</button
							>
							<button
								type="button"
								class={actionClass}
								onclick={() => choose(item, 'let_go')}>Let go</button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
