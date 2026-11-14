<!-- apps/web/src/lib/components/inbox/InboxActivity.svelte -->
<!--
	"What happened / what's suggested" (tasker 156): the bottom line first, then every item
	grouped by project. Each level is one line that opens into the next: project → item →
	its records, changes, the check and a timeline. Built by inbox-activity.ts.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ArrowUpRight, ChevronDown, X } from '$lib/icons/lucide';
	import InboxItemTrail from './InboxItemTrail.svelte';
	import {
		buildInboxActivity,
		type ActivityEntry,
		type ActivityPayload,
		type ActivityProject
	} from './inbox-activity';

	let {
		payload = null,
		onClose
	}: {
		/** Rows to show; when absent the view loads them itself. */
		payload?: ActivityPayload | null;
		onClose?: () => void;
	} = $props();

	const uid = $props.id();
	let loaded = $state.raw<ActivityPayload | null>(null);
	let status = $state<'loading' | 'ready' | 'error'>('loading');

	const rows = $derived(payload ?? loaded);
	const activity = $derived(rows ? buildInboxActivity(rows) : null);

	async function load() {
		status = 'loading';
		try {
			const res = await fetch('/api/inbox/activity');
			const json = await res.json().catch(() => null);
			if (!res.ok || !json?.data) throw new Error('load failed');
			loaded = json.data as ActivityPayload;
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	onMount(() => {
		if (!payload) void load();
	});

	const TONE_CLASS: Record<ActivityEntry['tone'], string> = {
		done: 'border-success/40 bg-success/10 text-foreground',
		ask: 'border-accent/40 bg-accent/10 text-accent',
		quiet: 'border-border bg-muted/40 text-muted-foreground',
		warn: 'border-warning/40 bg-warning/10 text-foreground'
	};

	function when(value: string | null): string | null {
		if (!value) return null;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function day(value: string): string | null {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return null;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function count(value: number, one: string): string {
		return `${value} ${one}${value === 1 ? '' : 's'}`;
	}
</script>

{#snippet entryRow(entry: ActivityEntry)}
	<details class="group/entry rounded-md border border-border bg-card">
		<summary
			class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<ChevronDown
				class="h-3.5 w-3.5 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open/entry:rotate-0 motion-reduce:transition-none"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1">
				<span class="block break-words text-xs font-medium text-foreground"
					>{entry.headline}</span
				>
				<span class="mt-0.5 flex flex-wrap items-center gap-1.5">
					<span
						class="rounded-full border px-1.5 py-px text-2xs font-semibold {TONE_CLASS[
							entry.tone
						]}">{entry.stateLabel}</span
					>
					{#if day(entry.at)}
						<span class="text-2xs text-muted-foreground">{day(entry.at)}</span>
					{/if}
				</span>
			</span>
		</summary>
		<div class="space-y-2 border-t border-border px-2.5 py-2">
			{#if entry.summary}
				<p class="break-words text-xs text-foreground/90">{entry.summary}</p>
			{/if}
			<InboxItemTrail
				trail={{
					origin: entry.source,
					whyNow: entry.whyNow && entry.whyNow !== entry.summary ? entry.whyNow : null,
					records: entry.records,
					more: 0,
					check: entry.check
				}}
			/>
			{#if entry.changes.length}
				<div>
					<p class="text-2xs font-semibold text-foreground/80">
						{entry.state === 'waiting' ? 'Would change' : 'Change'}
					</p>
					<ul class="mt-0.5 space-y-1">
						{#each entry.changes as change, index (index)}
							<li class="break-words text-2xs text-foreground/90">
								{#if change.href}
									<a
										href={change.href}
										target="_blank"
										rel="noopener"
										class="inline-flex max-w-full items-center gap-0.5 font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										><span class="min-w-0 break-words">{change.text}</span
										><ArrowUpRight
											class="h-3 w-3 shrink-0"
											aria-hidden="true"
										/><span class="sr-only">(opens in a new tab)</span></a
									>
								{:else}
									{change.text}
								{/if}
								{#if change.rows.length}
									<ul class="mt-0.5 space-y-0.5 pl-2">
										{#each change.rows as row, rowIndex (rowIndex)}
											<li>
												<span class="font-medium text-muted-foreground"
													>{row.label}:</span
												>
												{#if row.before}
													<span class="text-muted-foreground"
														>{row.before}</span
													>
													<span
														class="text-muted-foreground"
														aria-hidden="true">→</span
													>
													<span class="sr-only">changes to</span>
												{/if}
												<span class="text-foreground/90">{row.after}</span>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			<div>
				<p class="text-2xs font-semibold text-foreground/80">How it got here</p>
				<ol class="mt-1 space-y-1 border-l border-border pl-3">
					{#each entry.steps as step (step.key)}
						<li class="relative text-2xs">
							<span
								class="absolute -left-[0.95rem] top-1 h-1.5 w-1.5 rounded-full bg-muted-foreground"
								aria-hidden="true"
							></span>
							<span class="font-medium text-foreground">{step.label}</span>
							{#if when(step.at)}
								<span class="text-muted-foreground"> · {when(step.at)}</span>
							{/if}
							{#if step.detail}
								<span class="block break-words text-muted-foreground"
									>{step.detail}</span
								>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		</div>
	</details>
{/snippet}

{#snippet projectGroup(project: ActivityProject, open: boolean)}
	<details class="group/project rounded-lg border border-border bg-muted/20" {open}>
		<summary
			class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<ChevronDown
				class="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open/project:rotate-0 motion-reduce:transition-none"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1">
				<span class="block truncate text-sm font-semibold text-foreground"
					>{project.name}</span
				>
				<span class="block break-words text-2xs text-muted-foreground">{project.bluf}</span>
			</span>
		</summary>
		<div class="space-y-1.5 px-2 pb-2">
			<!-- A suggestion id is unique within its project group. -->
			{#each project.entries as entry (entry.id)}
				{@render entryRow(entry)}
			{/each}
		</div>
	</details>
{/snippet}

<section class="flex h-full min-h-0 flex-col bg-background" aria-labelledby={`${uid}-title`}>
	<div class="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2">
		<h3 id={`${uid}-title`} class="text-sm font-semibold text-foreground">
			What happened and what's suggested
		</h3>
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<X class="h-3.5 w-3.5" aria-hidden="true" />
				Back to inbox
			</button>
		{/if}
	</div>

	<div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
		{#if !activity && status === 'loading'}
			<p class="text-xs text-muted-foreground" role="status">Loading what happened…</p>
		{:else if !activity}
			<div role="alert" class="space-y-2">
				<p class="text-xs text-destructive">Couldn't load what happened.</p>
				<button
					type="button"
					onclick={load}
					class="min-h-11 rounded-md px-2 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					Try again
				</button>
			</div>
		{:else}
			<div class="rounded-lg border border-border bg-card p-3 shadow-ink">
				{#each activity.bluf as line, index (index)}
					<p
						class="break-words text-sm text-foreground {index === 0
							? 'font-semibold'
							: 'mt-0.5'}"
					>
						{line}
					</p>
				{/each}
				{#if activity.lastReview}
					<p class="mt-1.5 break-words text-2xs text-muted-foreground">
						Last review {when(activity.lastReview.at)}: looked at
						{count(activity.lastReview.projects, 'project')},
						{count(activity.lastReview.suggested, 'new suggestion')}{activity.lastReview
							.appliedForYou
							? `, ${activity.lastReview.appliedForYou} applied for you`
							: ''}. {count(activity.counts.reviews, 'review')} this week.
					</p>
				{/if}
			</div>

			<div class="space-y-2">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					What happened · {activity.counts.happened}
				</h4>
				{#if activity.happened.length}
					{#each activity.happened as project, index (project.id)}
						{@render projectGroup(project, index === 0)}
					{/each}
				{:else}
					<p class="text-xs text-muted-foreground">Nothing in the last week.</p>
				{/if}
			</div>

			<div class="space-y-2">
				<h4 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					What's suggested · {activity.counts.suggested}
				</h4>
				{#if activity.suggested.length}
					{#each activity.suggested as project (project.id)}
						{@render projectGroup(project, false)}
					{/each}
				{:else}
					<p class="text-xs text-muted-foreground">Nothing is waiting on you.</p>
				{/if}
			</div>
		{/if}
	</div>
</section>
