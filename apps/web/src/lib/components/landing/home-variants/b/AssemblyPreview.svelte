<!-- apps/web/src/lib/components/landing/home-variants/b/AssemblyPreview.svelte -->
<!--
  Homepage B: a BuildOS project card that builds itself item by item from an example note.
  Fixed, hand-written content (see ./examples.ts), no model call. Changing `runId` replays the
  build. With reduced motion the finished card shows at once (CSS only).
-->
<script lang="ts">
	import {
		Ban,
		Circle,
		CircleCheck,
		CircleDot,
		FileText,
		Flag,
		FolderKanban,
		ArrowRight,
		Target
	} from '$lib/icons/lucide';
	import type { AssemblyExample, AssemblyTask } from './examples';

	let { example, runId }: { example: AssemblyExample; runId: number } = $props();

	const STEP_MS = 75;
	const START_MS = 180;

	// Every animated row gets the next slot, in reading order.
	const project = $derived(example.project);
	const slots = $derived.by(() => {
		let index = 0;
		const next = () => index++;
		const header = next();
		const goal = next();
		const milestones = project.milestones.map(() => next());
		const tasks = project.tasks.map(() => next());
		const documents = next();
		const nextStep = next();
		return { header, goal, milestones, tasks, documents, nextStep, total: index };
	});
	const readyAt = $derived(START_MS + slots.total * STEP_MS + 120);
	const moreTasks = $derived(project.taskTotal - project.tasks.length);
	const moreDocs = $derived(project.documentTotal - project.documents.length);

	function delay(slot: number | undefined) {
		return `--assemble-delay: ${START_MS + (slot ?? 0) * STEP_MS}ms`;
	}

	function stateLabel(state: AssemblyTask['state']) {
		switch (state) {
			case 'done':
				return 'Done';
			case 'in_progress':
				return 'In progress';
			case 'blocked':
				return 'Blocked';
			default:
				return 'To do';
		}
	}
</script>

<div
	class="tx tx-frame tx-weak overflow-hidden rounded-lg border border-border bg-card shadow-ink-strong"
	role="group"
	aria-label="Example project: {project.name}"
>
	{#key runId}
		<div
			class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 sm:px-5"
		>
			<p class="text-xs text-muted-foreground">Built from the note</p>
			<p class="build-status text-xs font-medium" style="--ready-at: {readyAt}ms">
				<span
					class="status-building items-center gap-1.5 text-muted-foreground"
					aria-hidden="true"
				>
					<span
						class="h-2 w-2 animate-pulse rounded-full bg-accent motion-reduce:animate-none"
					></span>
					Building…
				</span>
				<span class="status-ready items-center gap-1 text-success">
					<CircleCheck class="h-3.5 w-3.5" />
					Ready
				</span>
			</p>
		</div>

		<div class="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
			<!-- header -->
			<div class="assemble flex items-start gap-3" style={delay(slots.header)}>
				<span
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-accent"
				>
					<FolderKanban class="h-5 w-5" />
				</span>
				<div class="min-w-0">
					<h3 class="text-lg font-semibold leading-snug tracking-tight text-foreground">
						{project.name}
					</h3>
					<p class="mt-0.5 line-clamp-2 text-sm leading-snug text-muted-foreground">
						{project.summary}
					</p>
				</div>
			</div>

			<!-- goal + milestones -->
			<div class="grid gap-2">
				<div
					class="assemble flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
					style={delay(slots.goal)}
				>
					<Target class="h-4 w-4 shrink-0 text-accent" />
					<span class="text-xs text-muted-foreground">Goal</span>
					<span class="min-w-0 truncate text-sm font-medium text-foreground"
						>{project.goal}</span
					>
				</div>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each project.milestones as milestone, index (milestone)}
						<div
							class="assemble flex min-w-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-2"
							style={delay(slots.milestones[index])}
						>
							<Flag class="h-4 w-4 shrink-0 text-muted-foreground" />
							<span class="min-w-0 truncate text-sm text-foreground">{milestone}</span
							>
						</div>
					{/each}
				</div>
			</div>

			<!-- tasks -->
			<div>
				<p class="mb-1.5 text-xs font-semibold text-muted-foreground">
					Tasks <span class="stamp font-normal">· {project.taskTotal}</span>
				</p>
				<ul
					class="divide-y divide-border overflow-hidden rounded-md border border-border bg-background"
				>
					{#each project.tasks as task, index (task.title)}
						<li
							class="assemble flex items-center gap-2.5 px-3 py-2"
							style={delay(slots.tasks[index])}
						>
							{#if task.state === 'done'}
								<CircleCheck class="h-4 w-4 shrink-0 text-success" />
							{:else if task.state === 'in_progress'}
								<CircleDot class="h-4 w-4 shrink-0 text-accent" />
							{:else if task.state === 'blocked'}
								<Ban class="h-4 w-4 shrink-0 text-destructive" />
							{:else}
								<Circle class="h-4 w-4 shrink-0 text-muted-foreground" />
							{/if}
							<span class="sr-only">{stateLabel(task.state)}:</span>
							<span
								class="min-w-0 flex-1 truncate text-sm {task.state === 'done'
									? 'text-muted-foreground line-through'
									: 'text-foreground'}">{task.title}</span
							>
							{#if task.state === 'blocked'}
								<span
									class="shrink-0 rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 text-2xs font-medium text-destructive"
									>Blocked</span
								>
							{:else if task.when}
								<span class="stamp shrink-0 text-2xs text-muted-foreground"
									>{task.when}</span
								>
							{/if}
						</li>
					{/each}
				</ul>
				{#if moreTasks > 0}
					<p
						class="assemble mt-1.5 text-xs text-muted-foreground"
						style={delay(slots.tasks[slots.tasks.length - 1])}
					>
						+ {moreTasks} more
					</p>
				{/if}
			</div>

			<!-- documents -->
			<div class="assemble" style={delay(slots.documents)}>
				<p class="mb-1.5 text-xs font-semibold text-muted-foreground">
					Documents <span class="stamp font-normal">· {project.documentTotal}</span>
				</p>
				<ul class="flex flex-wrap gap-1.5">
					{#each project.documents as document (document)}
						<li
							class="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
						>
							<FileText class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span class="truncate">{document}</span>
						</li>
					{/each}
					{#if moreDocs > 0}
						<li class="inline-flex items-center px-1 text-xs text-muted-foreground">
							+ {moreDocs} more
						</li>
					{/if}
				</ul>
			</div>

			<!-- next step -->
			<div
				class="assemble flex items-start gap-2.5 rounded-md border border-accent/30 bg-accent/10 px-3 py-2.5"
				style={delay(slots.nextStep)}
			>
				<ArrowRight class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
				<p class="text-sm leading-snug text-foreground">
					<span class="font-semibold">Next step:</span>
					{project.nextStep}
				</p>
			</div>
		</div>
	{/key}
</div>

<style>
	.assemble {
		animation: assemble-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
		animation-delay: var(--assemble-delay, 0ms);
	}

	.build-status {
		display: grid;
	}

	.status-building,
	.status-ready {
		display: inline-flex;
		grid-area: 1 / 1;
		justify-self: end;
		white-space: nowrap;
	}

	.status-building {
		animation: status-out 120ms ease forwards;
		animation-delay: var(--ready-at, 0ms);
	}

	.status-ready {
		animation: assemble-in 180ms ease both;
		animation-delay: var(--ready-at, 0ms);
	}

	@keyframes assemble-in {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes status-out {
		to {
			opacity: 0;
			visibility: hidden;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.assemble,
		.status-ready {
			animation: none;
		}

		.status-building {
			display: none;
		}
	}
</style>
