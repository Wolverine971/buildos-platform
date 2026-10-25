<!-- apps/web/src/lib/components/builder-profile/ProjectCard.svelte -->
<!-- One project inside a builder page card. Listed: name, pitch, stage, last active.
     Live adds the goals the owner picked, the next milestone, 12 weeks of activity, this
     week's line, what they're looking for (with "I'm interested" when the owner set
     where replies go), and Follow / Ask to join. A live card splits into two columns
     when the page card is wide. The whole card opens the project's page (Live) or its
     website (Listed with a link); buttons and links inside it still work on their own. -->
<script lang="ts">
	import { ArrowUpRight, ChevronRight, ExternalLink, Users } from '$lib/icons/lucide';
	import type { BuilderProfileProjectCard } from '$lib/builder-profile/types';
	import { activeLabel, shortDate, stageLabel } from '$lib/builder-profile/format';
	import { displayUrl } from '$lib/builder-profile/links';
	import { isEmailReply } from '$lib/builder-profile/project-pages';
	import ActivityBars from './ActivityBars.svelte';
	import type { AskState } from './builder-visitor.svelte';

	let {
		card,
		href = null,
		agentSplit = true,
		canAct = true,
		showActions = false,
		following = false,
		followBusy = false,
		ask,
		onfollow,
		onaskopen,
		onasksend,
		ontap
	}: {
		card: BuilderProfileProjectCard;
		/** The project's own page (Live cards on a public page). */
		href?: string | null;
		agentSplit?: boolean;
		/** False for the owner and in the editor: buttons don't act. */
		canAct?: boolean;
		/** In the editor: show the visitor's buttons as a picture, not controls. */
		showActions?: boolean;
		following?: boolean;
		followBusy?: boolean;
		ask: AskState;
		onfollow?: (projectId: string, on: boolean) => void;
		onaskopen?: (projectId: string) => void;
		onasksend?: (projectId: string, note: string) => void;
		/** A tap on a link that leaves BuildOS (website, reply link). */
		ontap?: () => void;
	} = $props();

	let note = $state('');
	const live = $derived(card.level === 'live');
	const glyphs = $derived((card.glyphs ?? []).join(''));
	const hasWeeks = $derived((card.weekly ?? []).some(([c]) => c > 0));
	const weekTotal = $derived((card.weekly ?? []).reduce((sum, [c]) => sum + c, 0));
	// Live opens its page; Listed opens its website when it has one; the editor neither.
	const target = $derived(
		showActions ? null : live ? href : card.link_url ? card.link_url : null
	);
	const external = $derived(!!target && target === card.link_url);

	const quietButton =
		'inline-flex min-h-10 items-center rounded-full border border-border-strong bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60';
	const accentButton =
		'tx-button tx-button-accent inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold';
	const replyButton =
		'inline-flex min-h-9 items-center gap-1 rounded-full bg-accent px-3.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

<article
	class="pc relative flex h-full flex-col gap-3 rounded-xl border bg-card p-4 {live
		? 'border-border-strong'
		: 'border-border'}"
	data-linked={target ? 'true' : undefined}
	aria-label={card.name}
>
	<header class="flex items-start gap-3">
		<span
			class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted text-lg leading-none tracking-[-0.15em]"
			aria-hidden="true">{glyphs || card.name.slice(0, 1).toUpperCase()}</span
		>
		<div class="min-w-0 flex-1">
			<h3 class="text-base font-semibold leading-snug text-foreground">
				{#if target}
					<a
						href={target}
						class="pc-link inline-flex items-center gap-1 focus-visible:outline-none"
						target={external ? '_blank' : undefined}
						rel={external ? 'noopener noreferrer nofollow ugc' : undefined}
						onclick={() => external && ontap?.()}
						>{card.name}{#if external}<ArrowUpRight
								class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>{:else}<ChevronRight
								class="pc-chevron h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>{/if}</a
					>
				{:else}
					{card.name}
				{/if}
			</h3>
			<p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
				<span>{activeLabel(card.last_active_at)}</span>
				{#if card.link_url}
					<span aria-hidden="true">·</span>
					<a
						href={card.link_url}
						target="_blank"
						rel="noopener noreferrer nofollow ugc"
						onclick={() => ontap?.()}
						class="pc-above inline-flex min-w-0 items-center gap-1 underline-offset-2 hover:text-foreground hover:underline"
						><span class="truncate">{displayUrl(card.link_url)}</span><ExternalLink
							class="h-3 w-3 shrink-0"
							aria-hidden="true"
						/></a
					>
				{/if}
				{#if card.audience === 'collaborators'}
					<span aria-hidden="true">·</span>
					<span class="text-info">people I work with</span>
				{/if}
			</p>
		</div>
		<span
			class="shrink-0 rounded-full border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide {live
				? 'border-success/60 text-success'
				: 'border-border-strong text-muted-foreground'}">{stageLabel(card)}</span
		>
	</header>

	{#if card.pitch}
		<p class="text-sm leading-relaxed text-foreground">{card.pitch}</p>
	{/if}

	{#if live}
		<div class="pc-live grid gap-3">
			{#if card.goals?.length || card.next_milestone}
				<div class="grid content-start gap-2.5">
					{#if card.goals?.length}
						<div>
							<p class="micro-label mb-1.5">Goals</p>
							<ul class="grid gap-1.5 text-sm text-foreground">
								{#each card.goals as goal (goal)}
									<li class="flex gap-2">
										<span
											class="mt-[6px] h-2 w-2 shrink-0 rounded-full border-2 border-accent"
											aria-hidden="true"
										></span>
										<span>{goal}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
					{#if card.next_milestone}
						<p class="text-xs text-muted-foreground">
							<span class="micro-label">Next</span>
							<span class="ml-1 text-foreground">{card.next_milestone.title}</span>
							· {shortDate(card.next_milestone.due_at)}
						</p>
					{/if}
				</div>
			{/if}
			{#if hasWeeks || card.this_week}
				<div class="grid content-start gap-2.5">
					{#if hasWeeks && card.weekly}
						<div class="rounded-lg border border-border bg-background px-3 py-2.5">
							<div class="mb-1.5 flex items-baseline justify-between gap-2">
								<span class="micro-label">12 weeks</span>
								<span class="stamp text-2xs text-muted-foreground"
									>{weekTotal} changes</span
								>
							</div>
							<ActivityBars weeks={card.weekly} {agentSplit} />
						</div>
					{/if}
					{#if card.this_week}
						<div class="rounded-lg border border-border bg-background px-3 py-2.5">
							<p class="micro-label">This week</p>
							<p class="mt-1 text-sm text-foreground">{card.this_week}</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		{#if card.looking_for}
			<div
				class="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 rounded-lg bg-accent/10 px-3 py-2.5"
			>
				<div class="min-w-0 flex-1 basis-48">
					<p class="micro-label text-accent">Looking for</p>
					<p class="mt-1 text-sm text-foreground">{card.looking_for}</p>
				</div>
				{#if card.reply_url}
					{#if showActions}
						<span class="{replyButton} shrink-0" aria-hidden="true">I’m interested</span
						>
					{:else}
						<a
							href={card.reply_url}
							target={isEmailReply(card.reply_url) ? undefined : '_blank'}
							rel="noopener noreferrer nofollow ugc"
							onclick={() => ontap?.()}
							class="{replyButton} pc-above shrink-0"
							>I’m interested<ArrowUpRight
								class="h-3.5 w-3.5"
								aria-hidden="true"
							/></a
						>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
			{#if (card.member_count ?? 0) > 1}
				<p class="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
					<Users class="h-3.5 w-3.5" aria-hidden="true" />
					{card.member_count} people build this
				</p>
			{:else}
				<span></span>
			{/if}

			{#if card.viewer_is_member}
				<a
					href="/projects/{card.id}"
					class="pc-above text-sm font-semibold text-success underline-offset-2 hover:underline"
					>You’re in this project · Open it</a
				>
			{:else if canAct}
				{#if !ask.done && !ask.open}
					<div class="pc-above flex flex-wrap gap-2">
						<button
							id="follow-{card.id}"
							type="button"
							class={quietButton}
							aria-pressed={following}
							disabled={followBusy}
							onclick={() => onfollow?.(card.id, !following)}
							>{following ? 'Following' : 'Follow'}</button
						>
						<button
							type="button"
							class={accentButton}
							onclick={() => onaskopen?.(card.id)}>Ask to join</button
						>
					</div>
				{/if}
			{:else if showActions}
				<div class="flex flex-wrap gap-2" aria-hidden="true">
					<span class={quietButton}>Follow</span>
					<span class={accentButton}>Ask to join</span>
				</div>
			{/if}
		</div>

		{#if canAct && !card.viewer_is_member}
			{#if ask.done}
				<p class="text-sm text-foreground" role="status">{ask.message}</p>
			{:else if ask.open}
				<form
					class="pc-above grid gap-2 rounded-lg border border-border bg-background p-3"
					onsubmit={(event) => {
						event.preventDefault();
						onasksend?.(card.id, note);
					}}
				>
					<label
						for="ask-note-{card.id}"
						class="text-xs font-medium text-muted-foreground"
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
						<button type="submit" class={accentButton} disabled={ask.sending}
							>{ask.sending ? 'Sending…' : 'Send ask'}</button
						>
					</div>
				</form>
			{/if}
		{/if}
	{/if}
</article>

<style>
	/* Two columns for a live card when there's room; one column fills the row alone. */
	.pc-live {
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));
	}

	/* The name's link covers the whole card; anything clickable inside sits above it. */
	.pc-link::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: inherit;
	}
	.pc :global(.pc-above) {
		position: relative;
		z-index: 1;
	}
	.pc[data-linked='true'] {
		transition:
			border-color 120ms ease,
			box-shadow 120ms ease,
			transform 120ms ease;
	}
	.pc[data-linked='true']:hover {
		border-color: hsl(var(--foreground) / 0.35);
		box-shadow: var(--shadow-ink);
		transform: translateY(-1px);
	}
	.pc[data-linked='true']:hover :global(.pc-chevron) {
		transform: translateX(2px);
	}
	.pc :global(.pc-chevron) {
		transition: transform 120ms ease;
	}
	.pc:has(.pc-link:focus-visible) {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}
	@media (prefers-reduced-motion: reduce) {
		.pc[data-linked='true'],
		.pc :global(.pc-chevron) {
			transition: none;
		}
		.pc[data-linked='true']:hover {
			transform: none;
		}
	}
</style>
