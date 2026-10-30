<!-- apps/web/src/lib/components/inbox/InboxCheckIns.svelte -->
<!--
	"Did this happen?" for a project's overdue tasks, one card per due day, with Done /
	Move / Drop per task. A quiet project asks "Still on?" once instead. An answered task
	leaves the list at once and lands in the Cleared pile (bottom-right), which holds it a few
	seconds for Undo and then saves it in the background; a failed save puts it back here.
	The newest days stay open; older days fold to one line with a preview and Mark all done.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Check, ChevronDown, CircleCheck, MessageCircle } from '$lib/icons/lucide';
	import type {
		CheckInAnswer,
		CheckInAnswerResult,
		CheckInGroup,
		CheckInProject,
		CheckInTask
	} from '$lib/types/inbox-check-ins';
	import { clearedPile, type PileOutcome } from '$lib/stores/inbox-cleared-pile.svelte';
	import {
		dueAtFromDateInput,
		formatCheckInGroupAge,
		formatCheckInGroupTitle,
		formatCheckInTally,
		formatMoveDate,
		formatQuietDetail,
		nextWeekday,
		postCheckInAnswers,
		toDateInputValue,
		type CheckInChangeSummary
	} from './check-ins';
	import { flyToPile } from './pile-fly';

	type RowAnswer = 'done' | 'move' | 'drop';

	let {
		project,
		today = toDateInputValue(new Date()),
		openingChat = false,
		submitAnswers = postCheckInAnswers,
		onChanged,
		onTalk
	}: {
		project: CheckInProject;
		/** YYYY-MM-DD in the viewer's time zone (the check-ins payload's `today`). */
		today?: string;
		openingChat?: boolean;
		submitAnswers?: (answers: CheckInAnswer[]) => Promise<CheckInAnswerResult[]>;
		onChanged?: (summary: CheckInChangeSummary) => void;
		onTalk?: (projectId: string, taskIds: string[]) => void;
	} = $props();

	const OPEN_TASK_BUDGET = 6;
	const SEGMENTS = [
		{ answer: 'done', label: 'Done', title: 'It happened: mark it done' },
		{ answer: 'move', label: 'Move', title: "It didn't happen yet: pick a new date" },
		{ answer: 'drop', label: 'Drop', title: "It's off: archive the task" }
	] as const;

	let rowErrors = $state<Record<string, string>>({});
	let groupErrors = $state<Record<string, string>>({});
	let movingTaskId = $state<string | null>(null);
	let moveDate = $state('');
	let projectError = $state<string | null>(null);
	let expanded = $state(false);
	/** Days the user opened or closed; the rest follow openByDefault. */
	let openOverrides = $state<Record<string, boolean>>({});

	const lane = $derived(`checkin:${project.project_id}`);
	const projectKey = $derived(`checkin:project:${project.project_id}`);
	// A Pause / Finished answer the pile is holding, saving or has saved.
	const projectAnswered = $derived(clearedPile.isHidden(projectKey));
	const askStillOn = $derived(project.quiet && !expanded);
	const allTasks = $derived(project.groups.flatMap((group) => group.tasks));
	// Answered tasks leave the list; the pile has them.
	const visibleGroups = $derived(
		project.groups
			.map((group) => ({
				...group,
				tasks: group.tasks.filter((task) => !clearedPile.isHidden(taskKey(task.id)))
			}))
			.filter((group) => group.tasks.length > 0)
	);
	const remaining = $derived(
		visibleGroups.reduce((total, group) => total + group.tasks.length, 0)
	);
	const shownCount = $derived(allTasks.length);
	// Newest days stay open until about OPEN_TASK_BUDGET rows show; older days fold to one line.
	const openByDefault = $derived.by(() => {
		const open = new Set<string>();
		let shown = 0;
		for (const group of visibleGroups) {
			if (open.size > 0 && shown + group.tasks.length > OPEN_TASK_BUDGET) break;
			open.add(group.key);
			shown += group.tasks.length;
		}
		return open;
	});
	const minMoveDate = $derived.by(() => {
		const date = new Date();
		date.setDate(date.getDate() + 1);
		return toDateInputValue(date);
	});

	function taskKey(taskId: string): string {
		return `checkin:task:${taskId}`;
	}

	function totalTasks(group: CheckInGroup): number {
		return project.groups.find((candidate) => candidate.key === group.key)?.tasks.length ?? 0;
	}

	function isGroupOpen(group: CheckInGroup): boolean {
		if (group.tasks.length <= 1) return true;
		return openOverrides[group.key] ?? openByDefault.has(group.key);
	}

	function toggleGroup(group: CheckInGroup) {
		openOverrides = { ...openOverrides, [group.key]: !isGroupOpen(group) };
	}

	function previewTitles(group: CheckInGroup): string {
		const titles = group.tasks.slice(0, 2).map((task) => task.title);
		const rest = group.tasks.length - titles.length;
		return rest > 0 ? `${titles.join(' · ')} · +${rest} more` : titles.join(' · ');
	}

	function domId(value: string): string {
		return `check-in-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	}

	function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
		const next = { ...record };
		delete next[key];
		return next;
	}

	function report(handled: number, remainingOverride?: number) {
		onChanged?.({
			projectId: project.project_id,
			handled,
			remaining: remainingOverride ?? remaining
		});
	}

	function firstFailure(results: CheckInAnswerResult[], fallback: string): string {
		const failed = results.find((result) => !result.ok);
		return failed && !failed.ok ? failed.error : fallback;
	}

	// Display punctuation only, so "Failed." never becomes "Failed.. It's back…".
	function backHere(message: string): string {
		return `${message.trim().replace(/[.\s]+$/, '')}. It's back on your list.`;
	}

	/** The row an answer came from, for the fly-to-pile animation. */
	function sourceOf(event: Event | undefined): Element | null {
		const target = event?.currentTarget;
		return target instanceof Element ? (target.closest('li, article') ?? target) : null;
	}

	function answerLabel(answer: RowAnswer, moveLabel?: string): string {
		if (answer === 'done') return 'Marked done';
		if (answer === 'drop') return 'Dropped (archived)';
		return moveLabel ? `Moved to ${moveLabel}` : 'Moved';
	}

	function answerTask(
		task: CheckInTask,
		answer: RowAnswer,
		move?: { dueAt: string; label: string },
		source: Element | null = null
	) {
		if (clearedPile.isHidden(taskKey(task.id))) return;
		movingTaskId = null;
		rowErrors = withoutKey(rowErrors, task.id);
		flyToPile(source, task.title);
		const { settled } = clearedPile.add({
			title: task.title,
			label: answerLabel(answer, move?.label),
			context: project.project_name,
			keys: [taskKey(task.id)],
			lane,
			onUndo: () => report(-1),
			run: async (): Promise<PileOutcome> => {
				const results = await submitAnswers([
					{ task_id: task.id, answer, ...(move ? { due_at: move.dueAt } : {}) }
				]);
				const last = results[results.length - 1];
				if (last?.kind === 'task' && last.ok) return {};
				return {
					failed: true,
					detail: backHere(firstFailure(results, 'Could not save that answer'))
				};
			}
		});
		report(1);
		void settled.then((entry) => {
			if (entry.status !== 'failed') return;
			rowErrors = { ...rowErrors, [task.id]: entry.detail ?? 'Could not save that answer' };
			report(-1);
		});
	}

	async function startMove(task: CheckInTask) {
		if (movingTaskId === task.id) {
			cancelMove();
			return;
		}
		movingTaskId = task.id;
		moveDate = toDateInputValue(nextWeekday());
		await tick();
		document.getElementById(`${domId(task.id)}-date`)?.focus();
	}

	async function cancelMove() {
		const taskId = movingTaskId;
		movingTaskId = null;
		if (!taskId) return;
		await tick();
		document.getElementById(`${domId(taskId)}-move`)?.focus();
	}

	function confirmMove(task: CheckInTask, event?: Event) {
		const dueAt = dueAtFromDateInput(moveDate);
		if (!dueAt) return;
		answerTask(task, 'move', { dueAt, label: formatMoveDate(moveDate) }, sourceOf(event));
	}

	function markAllDone(group: CheckInGroup, event?: Event) {
		const targets = group.tasks.filter((task) => !clearedPile.isHidden(taskKey(task.id)));
		if (!targets.length) return;
		movingTaskId = null;
		groupErrors = withoutKey(groupErrors, group.key);
		flyToPile(sourceOf(event), `${targets.length} done`);
		const { settled } = clearedPile.add({
			title: `${targets.length} task${targets.length === 1 ? '' : 's'} · ${group.label}`,
			label: 'Marked all done',
			context: project.project_name,
			keys: targets.map((task) => taskKey(task.id)),
			lane,
			onUndo: () => report(-targets.length),
			run: async (): Promise<PileOutcome> => {
				const results = await submitAnswers(
					targets.map((task) => ({ task_id: task.id, answer: 'done' as const }))
				);
				const back = targets.filter((task, index) => {
					const result = results[index];
					return !(result?.kind === 'task' && result.ok);
				});
				if (!back.length) return {};
				return {
					returnedKeys: back.map((task) => taskKey(task.id)),
					detail: backHere(
						`${back.length} could not be saved: ${firstFailure(results, 'unknown error')}`
					)
				};
			}
		});
		report(targets.length);
		void settled.then((entry) => {
			if (entry.status !== 'failed' && entry.status !== 'partial') return;
			const back = entry.status === 'failed' ? targets.length : entry.returnedKeys.length;
			groupErrors = {
				...groupErrors,
				[group.key]: entry.detail ?? 'Some could not be saved'
			};
			report(-back);
		});
	}

	function answerProject(answer: 'pause' | 'finish', event?: Event) {
		if (projectAnswered) return;
		projectError = null;
		flyToPile(sourceOf(event), project.project_name);
		const { settled } = clearedPile.add({
			title: project.project_name,
			label: answer === 'pause' ? 'Paused' : 'Marked finished',
			context: `${project.overdue_count} overdue task${project.overdue_count === 1 ? '' : 's'}`,
			keys: [projectKey],
			lane,
			onUndo: () => report(-1, project.overdue_count),
			run: async (): Promise<PileOutcome> => {
				const results = await submitAnswers([
					{ project_id: project.project_id, project_answer: answer }
				]);
				const result = results[0];
				if (result?.kind === 'project' && result.ok) return {};
				return {
					failed: true,
					detail: backHere(firstFailure(results, 'Could not update the project'))
				};
			}
		});
		report(1, 0);
		void settled.then((entry) => {
			if (entry.status !== 'failed') return;
			projectError = entry.detail ?? 'Could not update the project';
			report(-1, project.overdue_count);
		});
	}
</script>

{#snippet talkButton(unanswered: CheckInTask[])}
	{#if unanswered.length && onTalk}
		<button
			type="button"
			class="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
			disabled={openingChat}
			onclick={() =>
				onTalk?.(
					project.project_id,
					unanswered.map((task) => task.id)
				)}
		>
			<MessageCircle class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
			{openingChat ? 'Opening chat…' : 'Tell me how it went'}
		</button>
	{/if}
{/snippet}

<div class="min-w-0 space-y-3">
	<div class="flex flex-wrap items-center gap-2">
		<span
			class="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-2xs font-semibold text-accent"
		>
			<Check class="h-3 w-3" aria-hidden="true" />
			{askStillOn ? 'Still on?' : 'Did this happen?'}
		</span>
		<span class="text-xs text-muted-foreground">
			{askStillOn
				? 'Overdue work and no changes in a while'
				: 'Planned work that went past its date'}
		</span>
	</div>

	{#if askStillOn}
		<article
			class="rounded-lg border border-border bg-card p-3 shadow-ink"
			aria-labelledby={`${domId(project.project_id)}-quiet`}
		>
			<h3
				id={`${domId(project.project_id)}-quiet`}
				class="text-sm font-semibold text-foreground"
			>
				Is this project still on?
			</h3>
			<p class="mt-1 break-words text-xs text-muted-foreground">
				{formatQuietDetail(project, today)}
			</p>

			{#if projectAnswered}
				<p
					role="status"
					class="mt-3 flex items-center gap-2 rounded-md bg-success/10 px-2.5 py-2 text-xs text-foreground"
				>
					<CircleCheck class="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
					<span class="min-w-0 break-words">
						Answered. It's in your Cleared list, where you can undo it for a few
						seconds.
					</span>
				</p>
			{:else}
				<div
					role="group"
					aria-label="Is this project still on?"
					class="mt-3 grid gap-2 sm:grid-cols-3"
				>
					<button
						type="button"
						onclick={(event) => answerProject('pause', event)}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<span
							class="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-foreground"
						>
							Pause it
							<span
								class="rounded border border-accent/40 px-1 text-2xs font-semibold uppercase tracking-wide text-accent"
							>
								Recommended
							</span>
						</span>
						<span class="text-xs text-muted-foreground">
							Moves it to Paused. These tasks stop coming back here.
						</span>
					</button>
					<button
						type="button"
						onclick={(event) => answerProject('finish', event)}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<span class="text-sm font-semibold text-foreground">It's finished</span>
						<span class="text-xs text-muted-foreground"
							>Marks the project complete.</span
						>
					</button>
					<button
						type="button"
						onclick={() => (expanded = true)}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					>
						<span class="text-sm font-semibold text-foreground">Still on</span>
						<span class="text-xs text-muted-foreground">
							Go through the {project.overdue_count} task{project.overdue_count === 1
								? ''
								: 's'} one by one.
						</span>
					</button>
				</div>
			{/if}
			{#if projectError}
				<p role="alert" class="mt-2 text-xs text-destructive">{projectError}</p>
			{/if}
		</article>
	{:else}
		{#if !visibleGroups.length && allTasks.length}
			<p
				role="status"
				class="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-foreground"
			>
				<CircleCheck class="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
				<span class="min-w-0 break-words">
					All answered. Saving in the background; anything that doesn't go through comes
					back here.
				</span>
			</p>
		{/if}
		{#each visibleGroups as group (group.key)}
			{@const total = totalTasks(group)}
			{@const answered = total - group.tasks.length}
			{@const unanswered = group.tasks}
			{@const open = isGroupOpen(group)}
			<article
				class="min-w-0 rounded-lg border border-border bg-card shadow-ink"
				aria-labelledby={`${domId(group.key)}-title`}
			>
				<header class="flex min-w-0 items-start justify-between gap-2 px-3 pt-3">
					<div class="min-w-0">
						<h3
							id={`${domId(group.key)}-title`}
							class="text-sm font-semibold text-foreground"
						>
							{formatCheckInGroupTitle(group)}
						</h3>
						<p class="mt-0.5 text-xs text-muted-foreground">
							{formatCheckInGroupAge(group.due_date, today, answered, total)}
						</p>
						{#if !open}
							<p class="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
								{previewTitles(group)}
							</p>
						{/if}
					</div>
					{#if group.tasks.length === 1}
						{@render talkButton(unanswered)}
					{:else}
						<button
							type="button"
							aria-expanded={open}
							aria-controls={`${domId(group.key)}-tasks`}
							onclick={() => toggleGroup(group)}
							class="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							{open ? 'Hide' : `Show ${group.tasks.length} tasks`}
							<ChevronDown
								class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none {open
									? 'rotate-180'
									: ''}"
								aria-hidden="true"
							/>
						</button>
					{/if}
				</header>

				<ul
					id={`${domId(group.key)}-tasks`}
					hidden={!open}
					class="mt-2 divide-y divide-border border-t border-border {group.tasks.length >
					1
						? 'border-b'
						: ''}"
				>
					{#each group.tasks as task (task.id)}
						<li
							class="grid min-w-0 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
						>
							<div class="min-w-0">
								<p class="break-words text-sm text-foreground">
									{task.title}
								</p>
								{#if rowErrors[task.id]}
									<p role="alert" class="mt-0.5 text-2xs text-destructive">
										{rowErrors[task.id]}
									</p>
								{/if}
							</div>

							<div
								role="group"
								aria-label={`Did "${task.title}" happen?`}
								class="flex w-full overflow-hidden rounded-md border border-border bg-background sm:w-auto"
							>
								{#each SEGMENTS as segment (segment.answer)}
									<button
										type="button"
										id={segment.answer === 'move'
											? `${domId(task.id)}-move`
											: undefined}
										title={segment.title}
										aria-expanded={segment.answer === 'move'
											? movingTaskId === task.id
											: undefined}
										onclick={(event) =>
											segment.answer === 'move'
												? startMove(task)
												: answerTask(
														task,
														segment.answer,
														undefined,
														sourceOf(event)
													)}
										class="min-h-11 flex-1 border-l border-border px-3 text-xs font-semibold text-muted-foreground transition-colors first:border-l-0 hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none sm:flex-none {segment.answer ===
											'move' && movingTaskId === task.id
											? 'bg-info/10 text-info'
											: ''}"
									>
										{segment.label}
									</button>
								{/each}
							</div>

							{#if movingTaskId === task.id}
								<div class="flex flex-wrap items-center gap-2 sm:col-span-2">
									<label
										for={`${domId(task.id)}-date`}
										class="text-xs text-muted-foreground"
									>
										Move to
									</label>
									<input
										id={`${domId(task.id)}-date`}
										type="date"
										bind:value={moveDate}
										min={minMoveDate}
										onkeydown={(event) => {
											if (event.key === 'Escape') {
												event.stopPropagation();
												void cancelMove();
											} else if (event.key === 'Enter') {
												event.preventDefault();
												confirmMove(task);
											}
										}}
										class="h-11 rounded-md border border-border-strong bg-background px-2 text-base text-foreground shadow-ink-inner focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
									/>
									<Button
										variant="primary"
										size="sm"
										disabled={!moveDate}
										onclick={(event: MouseEvent) => confirmMove(task, event)}
										class="text-xs"
									>
										Move
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={() => cancelMove()}
										class="text-xs"
									>
										Cancel
									</Button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>

				{#if open && group.task_count > total}
					<p class="px-3 pt-2 text-2xs text-muted-foreground">
						{group.task_count - total} more from this day are on the project page.
					</p>
				{/if}

				{#if group.tasks.length > 1}
					<footer
						class="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<p
							class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"
							aria-live="polite"
						>
							<!-- The header's age line already shows progress; the tally is for screen readers. -->
							<span class="sr-only">{formatCheckInTally(answered, total)}</span>
						</p>
						<div class="flex flex-wrap items-center gap-1">
							{@render talkButton(unanswered)}
							{#if unanswered.length > 1}
								<Button
									variant="ghost"
									size="sm"
									onclick={(event: MouseEvent) => markAllDone(group, event)}
									class="text-xs"
								>
									Mark all done
								</Button>
							{/if}
						</div>
					</footer>
				{/if}
				{#if groupErrors[group.key]}
					<p role="alert" class="px-3 pb-2 text-2xs text-destructive">
						{groupErrors[group.key]}
					</p>
				{/if}
			</article>
		{/each}

		{#if project.truncated}
			<p class="text-2xs text-muted-foreground">
				Showing the latest {shownCount} of {project.overdue_count} overdue tasks. The rest are
				on the project page.
			</p>
		{/if}
	{/if}
</div>
