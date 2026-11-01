<!-- apps/web/src/lib/components/landing/home-variants/a/ProjectSheet.svelte -->
<!--
  Homepage A hero: the Fading Crown example as one printed project sheet (goal, next step,
  milestones, tasks, documents, risk). Static data from fading-crown.ts, so no request runs
  above the fold.
-->
<script lang="ts">
	import {
		CircleCheck,
		CircleDot,
		Circle,
		CircleSlash,
		FileText,
		TriangleAlert
	} from '$lib/icons/lucide';
	import { FADING_CROWN, FADING_CROWN_COUNTS, type ExampleTaskState } from '../fading-crown';

	type SheetTask = {
		title: string;
		state: ExampleTaskState;
		when?: string;
		priority?: number;
	};

	const tasks: ReadonlyArray<SheetTask> = FADING_CROWN.tasks;
	const milestones: ReadonlyArray<{ title: string; state: 'done' | 'pending' }> =
		FADING_CROWN.milestones;

	// Open work first (in progress, then dated or priority items, then blocked); done work folds.
	const openTasks = [
		...tasks.filter((task) => task.state === 'in_progress'),
		...tasks.filter((task) => task.state === 'todo' && (task.when || task.priority)),
		...tasks.filter((task) => task.state === 'blocked')
	];
	const shownOpenCount = 5;
	const visibleOpenTasks = openTasks.slice(0, shownOpenCount);
	const otherOpenCount =
		tasks.filter((task) => task.state !== 'done').length - visibleOpenTasks.length;
	const visibleDocuments = FADING_CROWN.documents.slice(0, 4);
	const otherDocumentCount = FADING_CROWN.documents.length - visibleDocuments.length;

	const STATE_LABEL: Record<ExampleTaskState, string> = {
		done: 'Done',
		in_progress: 'In progress',
		todo: 'To do',
		blocked: 'Blocked'
	};
</script>

<article
	class="tx tx-frame tx-weak relative overflow-hidden rounded-lg border border-border bg-card shadow-ink"
	aria-label="Example project sheet: {FADING_CROWN.name}"
>
	<header class="border-b border-border px-5 pb-5 pt-5 sm:px-6">
		<div class="flex items-center justify-between gap-3">
			<p class="micro-label text-muted-foreground">Project</p>
			<p class="stamp text-2xs text-muted-foreground">
				{FADING_CROWN_COUNTS.tasks} tasks · {FADING_CROWN_COUNTS.documents} docs ·
				{FADING_CROWN_COUNTS.milestones} milestones
			</p>
		</div>
		<h2 class="desk-serif mt-3 text-3xl leading-tight text-foreground">
			{FADING_CROWN.name}
		</h2>
		<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
			{FADING_CROWN.description}
		</p>
	</header>

	<dl class="divide-y divide-border text-sm">
		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-muted-foreground">Goal</dt>
			<dd class="font-medium text-foreground">{FADING_CROWN.goal}</dd>
		</div>

		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-accent">Next step</dt>
			<dd class="border-l-2 border-accent pl-3 leading-relaxed text-foreground">
				{FADING_CROWN.nextStep}
			</dd>
		</div>

		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-muted-foreground">Milestones</dt>
			<dd>
				<ol class="space-y-1.5">
					{#each milestones as milestone (milestone.title)}
						<li class="flex items-start gap-2">
							{#if milestone.state === 'done'}
								<CircleCheck
									class="mt-0.5 h-4 w-4 shrink-0 text-success"
									aria-hidden="true"
								/>
								<span class="text-foreground">{milestone.title}</span>
								<span class="sr-only">(reached)</span>
							{:else}
								<Circle
									class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span class="text-foreground">{milestone.title}</span>
								<span class="sr-only">(upcoming)</span>
							{/if}
						</li>
					{/each}
				</ol>
			</dd>
		</div>

		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-muted-foreground">Tasks</dt>
			<dd>
				<ul class="space-y-1.5">
					{#each visibleOpenTasks as task (task.title)}
						<li class="flex items-start gap-2">
							{#if task.state === 'in_progress'}
								<CircleDot
									class="mt-0.5 h-4 w-4 shrink-0 text-accent"
									aria-hidden="true"
								/>
							{:else if task.state === 'blocked'}
								<CircleSlash
									class="mt-0.5 h-4 w-4 shrink-0 text-destructive"
									aria-hidden="true"
								/>
							{:else}
								<Circle
									class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							{/if}
							<span class="min-w-0 flex-1 text-foreground">
								{task.title}
								<span class="sr-only">({STATE_LABEL[task.state]})</span>
							</span>
							{#if task.state === 'blocked'}
								<span class="stamp shrink-0 text-2xs text-destructive">Blocked</span
								>
							{:else if task.state === 'in_progress'}
								<span class="stamp shrink-0 text-2xs text-accent">Doing</span>
							{:else if task.when}
								<span class="stamp shrink-0 text-2xs text-muted-foreground"
									>{task.when}</span
								>
							{:else if task.priority === 1}
								<span class="stamp shrink-0 text-2xs text-muted-foreground">P1</span
								>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-xs text-muted-foreground">
					{otherOpenCount} more to do ·
					<span class="inline-flex items-center gap-1">
						<CircleCheck class="h-3 w-3 text-success" aria-hidden="true" />
						{FADING_CROWN_COUNTS.done} done
					</span>
				</p>
			</dd>
		</div>

		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-muted-foreground">Documents</dt>
			<dd>
				<ul class="grid gap-1.5 sm:grid-cols-2 sm:gap-x-4">
					{#each visibleDocuments as doc (doc)}
						<li class="flex min-w-0 items-start gap-2">
							<FileText
								class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<span class="min-w-0 text-foreground">{doc}</span>
						</li>
					{/each}
				</ul>
				<p class="mt-2 text-xs text-muted-foreground">
					{otherDocumentCount} more documents
				</p>
			</dd>
		</div>

		<div class="grid gap-1 px-5 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:gap-4 sm:px-6">
			<dt class="micro-label pt-0.5 text-muted-foreground">Risk</dt>
			<dd class="flex items-start gap-2 text-foreground">
				<TriangleAlert class="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
				<span>{FADING_CROWN.risk}</span>
			</dd>
		</div>
	</dl>
</article>

<style>
	.desk-serif {
		font-family: ui-serif, 'New York', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
		font-weight: 500;
		letter-spacing: -0.01em;
	}
</style>
