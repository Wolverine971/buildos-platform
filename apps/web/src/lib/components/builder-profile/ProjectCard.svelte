<!-- apps/web/src/lib/components/builder-profile/ProjectCard.svelte -->
<!-- One project on a builder page. Listed: name, pitch, stage, last active. Live adds the
     goals the owner picked, the next milestone, 12 weeks of activity, this week's line,
     what they're looking for, and Follow / Ask to join. -->
<script lang="ts">
	import { ExternalLink, Users } from '$lib/icons/lucide';
	import type { BuilderProfileProjectCard } from '$lib/builder-profile/types';
	import { activeLabel, shortDate, stageLabel } from '$lib/builder-profile/format';
	import { displayUrl } from '$lib/builder-profile/links';
	import ActivityBars from './ActivityBars.svelte';

	type AskState = { open: boolean; sending: boolean; message: string | null; done: boolean };

	let {
		card,
		agentSplit = true,
		canAct = true,
		following = false,
		followBusy = false,
		ask,
		onfollow,
		onaskopen,
		onasksend
	}: {
		card: BuilderProfileProjectCard;
		agentSplit?: boolean;
		/** False for the owner and in the editor preview: buttons are hidden. */
		canAct?: boolean;
		following?: boolean;
		followBusy?: boolean;
		ask: AskState;
		onfollow?: (projectId: string, on: boolean) => void;
		onaskopen?: (projectId: string) => void;
		onasksend?: (projectId: string, note: string) => void;
	} = $props();

	let note = $state('');
	const live = $derived(card.level === 'live');
	const glyphs = $derived((card.glyphs ?? []).join(''));
	const hasWeeks = $derived((card.weekly ?? []).some(([c]) => c > 0));
</script>

<article
	class="grid gap-2.5 rounded-lg border bg-card p-4 shadow-ink {live
		? 'border-border-strong'
		: 'border-border'}"
	aria-label={card.name}
>
	<div class="flex items-center gap-2.5">
		{#if glyphs}
			<span class="shrink-0 text-xl leading-none tracking-[-0.15em]" aria-hidden="true">{glyphs}</span>
		{/if}
		<h3 class="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">{card.name}</h3>
		<span
			class="shrink-0 rounded-full border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide {live
				? 'border-success/60 text-success'
				: 'border-border-strong text-muted-foreground'}">{stageLabel(card)}</span
		>
	</div>

	{#if card.pitch}
		<p class="text-sm text-foreground">{card.pitch}</p>
	{/if}

	<p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
		<span>{activeLabel(card.last_active_at)}</span>
		{#if card.link_url}
			<span aria-hidden="true">·</span>
			<a
				href={card.link_url}
				target="_blank"
				rel="noopener noreferrer nofollow ugc"
				class="inline-flex items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
				>{displayUrl(card.link_url)}<ExternalLink class="h-3 w-3" aria-hidden="true" /></a
			>
		{/if}
		{#if card.audience === 'collaborators'}
			<span aria-hidden="true">·</span>
			<span class="text-info">people I work with</span>
		{/if}
	</p>

	{#if live}
		{#if card.goals?.length}
			<ul class="grid gap-1 text-sm text-foreground">
				{#each card.goals as goal (goal)}
					<li class="flex gap-2">
						<span
							class="mt-[7px] h-2 w-2 shrink-0 rounded-full border-2 border-accent"
							aria-hidden="true"
						></span>
						<span>{goal}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if card.next_milestone}
			<p class="font-mono text-xs text-muted-foreground">
				Next: <span class="text-foreground">{card.next_milestone.title}</span> · {shortDate(
					card.next_milestone.due_at
				)}
			</p>
		{/if}
		{#if hasWeeks && card.weekly}
			<ActivityBars weeks={card.weekly} {agentSplit} />
		{/if}
		{#if card.this_week}
			<div class="grid gap-0.5 rounded-md border border-border bg-background px-3 py-2">
				<span class="micro-label">This week</span>
				<span class="text-sm text-foreground">{card.this_week}</span>
			</div>
		{/if}
		{#if card.looking_for}
			<div class="grid gap-0.5 rounded-md bg-accent/10 px-3 py-2">
				<span class="micro-label text-accent">Looking for</span>
				<span class="text-sm text-foreground">{card.looking_for}</span>
			</div>
		{/if}
		{#if (card.member_count ?? 0) > 1}
			<p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
				<Users class="h-3.5 w-3.5" aria-hidden="true" />
				{card.member_count} people build this
			</p>
		{/if}

		{#if card.viewer_is_member}
			<a
				href="/projects/{card.id}"
				class="text-sm font-semibold text-success underline-offset-2 hover:underline"
				>You’re in this project · Open it</a
			>
		{:else if canAct}
			{#if ask.done}
				<p class="text-sm text-foreground" role="status">{ask.message}</p>
			{:else if ask.open}
				<form
					class="grid gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						onasksend?.(card.id, note);
					}}
				>
					<label for="ask-note-{card.id}" class="text-xs font-medium text-muted-foreground"
						>Add a note (optional)</label
					>
					<textarea
						id="ask-note-{card.id}"
						bind:value={note}
						rows="2"
						maxlength="400"
						placeholder="What you'd like to help with"
						class="w-full rounded-md border border-border-strong bg-background px-3 py-2 text-base text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent sm:text-sm"
					></textarea>
					{#if ask.message}
						<p class="text-xs text-destructive" role="alert">{ask.message}</p>
					{/if}
					<div class="flex flex-wrap gap-2">
						<button
							type="submit"
							class="tx-button tx-button-accent inline-flex min-h-[40px] items-center rounded-md px-3 text-sm font-semibold"
							disabled={ask.sending}>{ask.sending ? 'Sending…' : 'Send ask'}</button
						>
					</div>
				</form>
			{:else}
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="inline-flex min-h-[40px] items-center rounded-md border border-border-strong bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60"
						aria-pressed={following}
						disabled={followBusy}
						onclick={() => onfollow?.(card.id, !following)}
						>{following ? 'Following' : 'Follow project'}</button
					>
					<button
						type="button"
						class="tx-button tx-button-accent inline-flex min-h-[40px] items-center rounded-md px-3 text-sm font-semibold"
						onclick={() => onaskopen?.(card.id)}>Ask to join</button
					>
				</div>
			{/if}
		{/if}
	{/if}
</article>
