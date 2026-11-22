<!-- apps/web/src/lib/components/today/TodayPickCard.svelte -->
<!-- The one thing on top of Today. The title opens the task and the project name opens the
     project. The status menu changes the task in place: Done or Blocked moves the next pick
     up. "Not this" sends it to the bottom for the rest of the day (the page remembers, so a
     reload doesn't bring it back). When everything has been passed on, it says so instead of
     looping. -->
<script lang="ts">
	import {
		Check,
		ChevronDown,
		Circle,
		CircleCheck,
		CircleDot,
		CircleSlash,
		FolderKanban
	} from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import { TASK_STATES } from '$lib/components/projects/desktop/reader-model';
	import { PICK_TAGS, type TimeOfDay, type TodayPick } from './today-picks';

	type TaskState = (typeof TASK_STATES)[number]['key'];
	/** An ask with no task behind it can only be settled, not moved through task states. */
	type AskChoice = 'resolved' | 'dismissed';
	const ASK_CHOICES: { key: AskChoice; label: string; note: string }[] = [
		{ key: 'resolved', label: 'Handled', note: 'You took care of it' },
		{ key: 'dismissed', label: 'Not needed', note: 'Drop this ask' }
	];

	let {
		picks,
		time,
		skippedCount = 0,
		lastDone = null,
		lastTouched = null,
		onOpen,
		onTaskState,
		onAskStatus,
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
		/** Opens the pick's task. Only called for picks that have one. */
		onOpen: (pick: TodayPick) => void;
		onTaskState: (pick: TodayPick, state: TaskState) => void;
		onAskStatus: (pick: TodayPick, status: AskChoice) => void;
		onSkip: (pick: TodayPick) => void;
		onShowSkipped: () => void;
	} = $props();

	const pick = $derived(picks[0] ?? null);
	const heading = $derived(lastDone ? 'Next up' : time === 'morning' ? 'Start here' : 'Next up');
	/** The task this pick stands for; an ask can point at one without it being on today's list. */
	const hasTask = $derived(Boolean(pick?.task || pick?.waiting?.task_id));
	const stateKey = $derived(pick?.task?.state_key ?? null);
	const stateLabel = $derived(
		TASK_STATES.find((entry) => entry.key === stateKey)?.label ?? 'To do'
	);

	let menuOpen = $state(false);
	let menuWrap = $state<HTMLElement | null>(null);
	let menuButton = $state<HTMLButtonElement | null>(null);

	// A click anywhere else closes the menu.
	$effect(() => {
		if (!menuOpen) return;
		const away = (event: PointerEvent) => {
			if (menuWrap && event.target instanceof Node && !menuWrap.contains(event.target))
				menuOpen = false;
		};
		document.addEventListener('pointerdown', away, true);
		return () => document.removeEventListener('pointerdown', away, true);
	});

	function menuKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !menuOpen) return;
		event.stopPropagation();
		event.preventDefault();
		menuOpen = false;
		menuButton?.focus();
	}

	function chooseState(target: TodayPick, state: TaskState) {
		menuOpen = false;
		if (state !== target.task?.state_key) onTaskState(target, state);
	}

	function chooseAsk(target: TodayPick, status: AskChoice) {
		menuOpen = false;
		onAskStatus(target, status);
	}
</script>

{#snippet stateIcon(key: string | null)}
	{#if key === 'done'}<CircleCheck class="h-4 w-4 shrink-0 text-success" />
	{:else if key === 'in_progress'}<CircleDot class="h-4 w-4 shrink-0 text-accent" />
	{:else if key === 'blocked'}<CircleSlash class="h-4 w-4 shrink-0 text-warning" />
	{:else}<Circle class="h-4 w-4 shrink-0 text-muted-foreground" />{/if}
{/snippet}

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
			{#if hasTask}
				<button
					type="button"
					class="rounded-lg text-left underline decoration-border-strong decoration-1 underline-offset-4 hover:decoration-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`Open task "${pick.title}"`}
					onclick={() => onOpen(pick)}>{pick.title}</button
				>
			{:else}
				{pick.title}
			{/if}
		</h2>
		<!-- Project on its own line: long names wrap, and a trailing "·" would dangle. -->
		{#if pick.projectName && pick.projectId}
			<p class="mt-1 text-sm text-muted-foreground">
				<a
					href={resolve('/projects/[id]', { id: pick.projectId })}
					data-sveltekit-preload-data="hover"
					class="inline-flex min-h-6 max-w-full items-center gap-1 rounded-lg underline decoration-border-strong underline-offset-2 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label={`Open project ${pick.projectName}`}
				>
					<FolderKanban class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					<span class="truncate">{pick.projectName}</span>
				</a>
			</p>
		{:else if pick.projectName}
			<p class="mt-1 text-sm text-muted-foreground">{pick.projectName}</p>
		{/if}
		<p class="mt-0.5 text-sm text-muted-foreground">{pick.why}</p>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<span
				class="relative inline-flex"
				bind:this={menuWrap}
				onkeydown={menuKeydown}
				role="presentation"
			>
				<button
					bind:this={menuButton}
					type="button"
					class="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-border-strong hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-9"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					aria-label={pick.task
						? `Status: ${stateLabel}. Change status`
						: 'Change status'}
					onclick={() => (menuOpen = !menuOpen)}
				>
					{#if pick.task}
						{@render stateIcon(stateKey)}
						{stateLabel}
					{:else}
						{@render stateIcon(null)}
						Status
					{/if}
					<ChevronDown class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
				</button>
				{#if menuOpen}
					<div class="status-menu" role="menu" aria-label="Status">
						{#if pick.task}
							{#each TASK_STATES as entry (entry.key)}
								<button
									type="button"
									role="menuitemradio"
									aria-checked={stateKey === entry.key}
									onclick={() => chooseState(pick, entry.key)}
								>
									{@render stateIcon(entry.key)}
									<span>{entry.label}</span>
									{#if stateKey === entry.key}
										<Check
											class="ml-auto h-3.5 w-3.5 text-muted-foreground"
											aria-hidden="true"
										/>
									{/if}
								</button>
							{/each}
						{:else}
							{#each ASK_CHOICES as choice (choice.key)}
								<button
									type="button"
									role="menuitem"
									onclick={() => chooseAsk(pick, choice.key)}
								>
									{@render stateIcon(choice.key === 'resolved' ? 'done' : null)}
									<span>{choice.label}</span>
									<span class="note">{choice.note}</span>
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			</span>
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

<style>
	.status-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 30;
		display: grid;
		gap: 2px;
		min-width: 220px;
		max-width: min(300px, calc(100vw - 48px));
		border-radius: 12px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 4px;
		box-shadow: 0 8px 24px hsl(0 0% 0% / 0.12);
		animation: status-menu-in 160ms cubic-bezier(0.22, 1, 0.36, 1);
	}
	.status-menu button {
		display: flex;
		width: 100%;
		min-height: 36px;
		align-items: center;
		gap: 8px;
		border-radius: 8px;
		padding: 4px 8px;
		text-align: left;
		font-size: 14px;
		color: hsl(var(--foreground));
	}
	.status-menu button:hover,
	.status-menu button:focus-visible {
		background: hsl(var(--muted));
		outline: none;
	}
	.status-menu button[aria-checked='true'] {
		font-weight: 500;
	}
	.status-menu .note {
		margin-left: auto;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
	}
	@keyframes status-menu-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.status-menu {
			animation: none;
		}
	}
</style>
