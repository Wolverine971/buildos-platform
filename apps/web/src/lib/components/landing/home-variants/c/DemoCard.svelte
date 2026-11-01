<!-- apps/web/src/lib/components/landing/home-variants/c/DemoCard.svelte -->
<!--
  One project in the brain-dump demo's workspace. Items arriving from a dump render first as
  `incoming` (laid out but invisible, so the flying chip has a spot to land on), then
  `landed`. Every landing spot carries `data-slot` for BrainDumpDemo to measure.
-->
<script lang="ts">
	import { FileText, Flag, Target, TriangleAlert, ArrowRight } from '$lib/icons/lucide';
	import TaskStateIcon from './TaskStateIcon.svelte';
	import type { DemoMark, DemoProject } from './dump-demo';

	let {
		project,
		marks,
		incoming,
		landed,
		fresh,
		pulse = false,
		maxTasks = 5,
		compact = false,
		badged = new Set<string>()
	}: {
		project: DemoProject;
		/** Marks from either dump that land in this project. */
		marks: DemoMark[];
		incoming: ReadonlySet<string>;
		landed: ReadonlySet<string>;
		fresh: ReadonlySet<string>;
		pulse?: boolean;
		maxTasks?: number;
		/** Phone: tighter spacing and clamped text so the card stays legible when scaled. */
		compact?: boolean;
		/** Arrived items that keep a "New" badge. */
		badged?: ReadonlySet<string>;
	} = $props();

	const visible = (mark: DemoMark) => incoming.has(mark.id) || landed.has(mark.id);
	const one = (kind: DemoMark['kind']) => marks.find((mark) => mark.kind === kind);

	const nameMark = $derived(one('project'));
	const summaryMark = $derived(one('summary'));
	const goalMark = $derived(one('goal'));
	const riskMark = $derived(one('risk'));
	const nextMark = $derived(one('next'));
	const updateMarks = $derived(marks.filter((mark) => mark.kind === 'update'));

	const newMilestones = $derived(
		marks.filter((mark) => mark.kind === 'milestone' && visible(mark))
	);
	const newTasks = $derived(marks.filter((mark) => mark.kind === 'task' && visible(mark)));
	const newDocs = $derived(marks.filter((mark) => mark.kind === 'doc' && visible(mark)));

	type Row = {
		id: string;
		title: string;
		state: DemoMark['state'];
		when?: string;
		mark?: DemoMark;
	};

	const taskRows = $derived.by(() => {
		const arriving: Row[] = newTasks.map((mark) => ({
			id: mark.slot,
			title: mark.title,
			state: mark.state ?? 'todo',
			when: mark.when,
			mark
		}));
		const base: Row[] = project.tasks.map((task) => ({ ...task, mark: undefined }));
		return [...arriving, ...base];
	});
	const shownTasks = $derived(taskRows.slice(0, maxTasks));
	const taskCount = $derived(
		project.taskTotal + newTasks.filter((mark) => landed.has(mark.id)).length
	);
	const hiddenTasks = $derived(Math.max(0, taskCount - shownTasks.length));

	const docRows = $derived([
		...project.docs.map((doc) => ({ id: doc.id, title: doc.title, mark: undefined })),
		...newDocs.map((mark) => ({ id: mark.slot, title: mark.title, mark }))
	]);

	function updateFor(slot: string) {
		return updateMarks.find((mark) => mark.slot === slot && landed.has(mark.id));
	}

	/** Fade classes for an arriving item; base items are always shown. */
	function arrival(mark: DemoMark | undefined) {
		if (!mark) return '';
		if (!landed.has(mark.id)) return 'opacity-0';
		return fresh.has(mark.id) ? 'item-fresh' : '';
	}

	const isFresh = (mark: DemoMark | undefined) => Boolean(mark && fresh.has(mark.id));
</script>

<article
	class="flex h-full flex-col rounded-xl border bg-card shadow-ink {compact
		? 'gap-2 p-3'
		: 'gap-3 p-4'} transition-[border-color,box-shadow] duration-300 {pulse
		? 'border-accent ring-4 ring-accent/30'
		: 'border-border'}"
>
	<header>
		{#if nameMark}
			<h3
				data-slot={nameMark.slot}
				class="text-lg font-semibold leading-tight {landed.has(nameMark.id)
					? `text-foreground ${isFresh(nameMark) ? 'item-fresh' : ''}`
					: 'text-muted-foreground/60'}"
			>
				{landed.has(nameMark.id) ? nameMark.title : 'Untitled project'}
			</h3>
		{:else}
			<h3 class="text-lg font-semibold leading-tight text-foreground">{project.name}</h3>
		{/if}

		{#if summaryMark}
			<p
				data-slot={summaryMark.slot}
				class="mt-1 min-h-10 text-sm leading-snug text-muted-foreground {compact
					? 'line-clamp-2'
					: ''} {isFresh(summaryMark) ? 'item-fresh' : ''}"
			>
				{#if landed.has(summaryMark.id)}
					{summaryMark.title}
				{:else}
					<span class="block h-3 w-4/5 rounded bg-muted"></span>
					<span class="mt-1.5 block h-3 w-1/2 rounded bg-muted"></span>
				{/if}
			</p>
		{:else}
			<p
				class="mt-1 text-sm leading-snug text-muted-foreground {compact
					? 'line-clamp-2'
					: ''}"
			>
				{project.summary}
			</p>
		{/if}
	</header>

	<!-- Goal -->
	<div class="flex items-center gap-2 text-sm">
		<Target class="h-4 w-4 shrink-0 text-accent" />
		<span class="text-xs text-muted-foreground">Goal</span>
		{#if goalMark}
			<span
				data-slot={goalMark.slot}
				class="min-w-0 rounded px-1 font-medium {landed.has(goalMark.id)
					? `text-foreground ${isFresh(goalMark) ? 'item-fresh' : ''}`
					: ''}"
			>
				{#if landed.has(goalMark.id)}{goalMark.title}{:else}<span
						class="inline-block h-3 w-32 rounded bg-muted align-middle"
					></span>{/if}
			</span>
		{:else}
			<span class="min-w-0 truncate font-medium text-foreground">{project.goal}</span>
		{/if}
	</div>

	<!-- Milestones -->
	<div class="flex min-h-8 flex-wrap gap-1.5">
		{#each project.milestones as title (title)}
			<span
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
			>
				<Flag class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{title}
			</span>
		{/each}
		{#each newMilestones as mark (mark.id)}
			<span
				data-slot={mark.slot}
				class="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground transition-opacity duration-300 {arrival(
					mark
				)}"
			>
				<Flag class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{mark.title}
			</span>
		{/each}
		{#if !project.milestones.length && !newMilestones.length}
			<span class="h-7 w-28 rounded-md border border-dashed border-border"></span>
			<span class="h-7 w-36 rounded-md border border-dashed border-border"></span>
		{/if}
	</div>

	<!-- Tasks -->
	<div>
		<p class="mb-1.5 text-xs text-muted-foreground">
			Tasks <span class="stamp">{taskCount}</span>
		</p>
		<ul
			class="divide-y divide-border overflow-hidden rounded-md border border-border bg-background"
		>
			{#each shownTasks as row (row.id)}
				<li
					data-slot={row.mark ? row.mark.slot : undefined}
					class="flex items-center gap-2 px-2.5 py-1.5 text-sm transition-opacity duration-300 {arrival(
						row.mark
					)}"
				>
					<TaskStateIcon state={row.state ?? 'todo'} />
					<span
						class="min-w-0 flex-1 truncate {row.state === 'done'
							? 'text-muted-foreground line-through'
							: 'text-foreground'}">{row.title}</span
					>
					{#if row.when}
						<span class="stamp shrink-0 text-2xs text-accent">{row.when}</span>
					{/if}
					{#if row.mark && badged.has(row.mark.id)}
						<span
							class="shrink-0 rounded bg-accent px-1.5 text-2xs font-semibold text-accent-foreground"
							>New</span
						>
					{/if}
				</li>
			{:else}
				<li class="space-y-2 px-2.5 py-2.5">
					<span class="block h-3 w-3/4 rounded bg-muted"></span>
					<span class="block h-3 w-1/2 rounded bg-muted"></span>
				</li>
			{/each}
		</ul>
		{#if hiddenTasks > 0}
			<p class="mt-1 text-xs text-muted-foreground">+ {hiddenTasks} more</p>
		{/if}
	</div>

	<!-- Docs -->
	<div class="flex flex-wrap gap-1.5">
		{#each docRows as doc (doc.id)}
			{@const update = updateFor(doc.id)}
			<span
				data-slot={doc.mark ? doc.mark.slot : undefined}
				class="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-foreground transition-[opacity,border-color] duration-300 {arrival(
					doc.mark
				)} {update ? 'border-accent' : 'border-border'} {isFresh(update)
					? 'item-fresh'
					: ''}"
			>
				<FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<span class="truncate">{doc.title}</span>
				{#if update}
					<span
						class="shrink-0 rounded bg-accent px-1 text-2xs font-semibold text-accent-foreground"
						>Updated</span
					>
				{/if}
			</span>
		{:else}
			<span class="h-7 w-32 rounded-md border border-dashed border-border"></span>
			<span class="h-7 w-24 rounded-md border border-dashed border-border"></span>
		{/each}
	</div>

	<!-- Risk -->
	{#if riskMark || project.risk}
		<div class="flex items-start gap-2 text-sm">
			<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" />
			{#if riskMark}
				<span
					data-slot={riskMark.slot}
					class="min-w-0 rounded px-1 {landed.has(riskMark.id)
						? `text-foreground ${isFresh(riskMark) ? 'item-fresh' : ''}`
						: ''}"
				>
					{#if landed.has(riskMark.id)}{riskMark.title}{:else}<span
							class="inline-block h-3 w-40 rounded bg-muted align-middle"
						></span>{/if}
				</span>
			{:else}
				<span class="min-w-0 text-foreground">{project.risk}</span>
			{/if}
		</div>
	{/if}

	<!-- Next step -->
	<div
		class="mt-auto rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 {nextMark &&
		isFresh(nextMark)
			? 'item-fresh'
			: ''}"
		data-slot={nextMark?.slot}
	>
		<p class="flex items-center gap-1.5 text-xs font-semibold text-accent">
			<ArrowRight class="h-3.5 w-3.5 shrink-0" /> Next step
		</p>
		<p class="mt-0.5 min-h-5 text-sm font-medium leading-snug text-foreground">
			{#if nextMark}
				{#if landed.has(nextMark.id)}{nextMark.title}{:else}<span
						class="mt-1 block h-3 w-3/4 rounded bg-muted"
					></span>{/if}
			{:else}
				{project.next}
			{/if}
		</p>
	</div>
</article>

<style>
	/* A just-filed item glows briefly so the eye finds where it landed. */
	:global(.item-fresh) {
		animation: -global-demo-landed 1600ms ease-out;
	}

	@keyframes -global-demo-landed {
		0% {
			background-color: hsl(var(--accent) / 0.35);
			box-shadow: 0 0 0 3px hsl(var(--accent) / 0.45);
		}
		100% {
			background-color: transparent;
			box-shadow: 0 0 0 0 hsl(var(--accent) / 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(.item-fresh) {
			animation: none;
		}
	}
</style>
