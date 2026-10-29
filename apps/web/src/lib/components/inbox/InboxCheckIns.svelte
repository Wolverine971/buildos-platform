<!-- apps/web/src/lib/components/inbox/InboxCheckIns.svelte -->
<!--
	"Did this happen?" for a project's overdue tasks, one card per due day, with Done /
	Move / Drop per task. A quiet project asks "Still on?" once instead. Answers save
	right away; the latest one can be undone for a few seconds. The newest days stay open;
	older days fold to one line with a preview and Mark all done.
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { Check, ChevronDown, CircleCheck, MessageCircle } from '$lib/icons/lucide';
	import type {
		CheckInAnswer,
		CheckInAnswerResult,
		CheckInGroup,
		CheckInProject,
		CheckInTask,
		CheckInTaskSnapshot
	} from '$lib/types/inbox-check-ins';
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

	type RowAnswer = 'done' | 'move' | 'drop';
	type RowState = {
		answer: RowAnswer;
		/** The task before its first answer: what Undo and a changed answer put back. */
		original: CheckInTaskSnapshot | null;
		moveLabel?: string;
		pending: boolean;
	};
	type UndoEntry = { task_id: string; previous: CheckInTaskSnapshot };
	type TaskUndo = { kind: 'tasks'; key: string; label: string; entries: UndoEntry[] };
	type ProjectUndo = { kind: 'project'; key: string; previousState: string };

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

	const UNDO_MS = 10_000;
	const OPEN_TASK_BUDGET = 6;
	const SEGMENTS = [
		{
			answer: 'done',
			label: 'Done',
			title: 'It happened: mark it done',
			pressed: 'bg-success/10 text-success'
		},
		{
			answer: 'move',
			label: 'Move',
			title: "It didn't happen yet: pick a new date",
			pressed: 'bg-info/10 text-info'
		},
		{
			answer: 'drop',
			label: 'Drop',
			title: "It's off: archive the task",
			pressed: 'bg-muted text-foreground'
		}
	] as const;

	let rows = $state<Record<string, RowState>>({});
	let rowErrors = $state<Record<string, string>>({});
	let groupErrors = $state<Record<string, string>>({});
	let busyGroups = $state<Record<string, boolean>>({});
	let movingTaskId = $state<string | null>(null);
	let moveDate = $state('');
	let undo = $state<TaskUndo | ProjectUndo | null>(null);
	let undoing = $state(false);
	let projectAnswer = $state<{ answer: 'pause' | 'finish'; pending: boolean } | null>(null);
	let projectError = $state<string | null>(null);
	let expanded = $state(false);
	/** Days the user opened or closed; the rest follow openByDefault. */
	let openOverrides = $state<Record<string, boolean>>({});
	let undoTimer: ReturnType<typeof setTimeout> | null = null;

	const askStillOn = $derived(project.quiet && !expanded);
	const projectUndo = $derived(undo?.kind === 'project' ? undo : null);
	const allTasks = $derived(project.groups.flatMap((group) => group.tasks));
	const remaining = $derived(allTasks.filter((task) => !rows[task.id]).length);
	const shownCount = $derived(allTasks.length);
	// Newest days stay open until about OPEN_TASK_BUDGET rows show; older days fold to one line.
	const openByDefault = $derived.by(() => {
		const open = new Set<string>();
		let shown = 0;
		for (const group of project.groups) {
			if (open.size > 0 && shown + group.tasks.length > OPEN_TASK_BUDGET) break;
			open.add(group.key);
			shown += group.tasks.length;
		}
		return open;
	});

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
	const minMoveDate = $derived.by(() => {
		const date = new Date();
		date.setDate(date.getDate() + 1);
		return toDateInputValue(date);
	});

	onDestroy(() => {
		if (undoTimer) clearTimeout(undoTimer);
	});

	function domId(value: string): string {
		return `check-in-${value.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	}

	function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
		const next = { ...record };
		delete next[key];
		return next;
	}

	function clearUndo() {
		if (undoTimer) clearTimeout(undoTimer);
		undoTimer = null;
		undo = null;
	}

	function showUndo(next: TaskUndo | ProjectUndo) {
		clearUndo();
		undo = next;
		undoTimer = setTimeout(() => {
			undo = null;
			undoTimer = null;
		}, UNDO_MS);
	}

	function report(handled: number, remainingOverride?: number) {
		onChanged?.({
			projectId: project.project_id,
			handled,
			remaining: remainingOverride ?? remaining
		});
	}

	function errorText(error: unknown, fallback: string): string {
		return error instanceof Error && error.message ? error.message : fallback;
	}

	function firstFailure(results: CheckInAnswerResult[], fallback: string): string {
		const failed = results.find((result) => !result.ok);
		return failed && !failed.ok ? failed.error : fallback;
	}

	function rowLabel(row: RowState): string {
		if (row.answer === 'done') return 'Marked done';
		if (row.answer === 'drop') return 'Dropped (archived)';
		return row.moveLabel ? `Moved to ${row.moveLabel}` : 'Moved';
	}

	function taskUndo(): TaskUndo | null {
		return undo?.kind === 'tasks' ? undo : null;
	}

	async function answerTask(
		task: CheckInTask,
		answer: RowAnswer,
		move?: { dueAt: string; label: string }
	) {
		const current = rows[task.id];
		if (current?.pending || undoing) return;
		if (current?.answer === answer && answer !== 'move') return;
		clearUndo();
		movingTaskId = null;

		// Changing an earlier answer puts the task back first, so each answer starts clean.
		const answers: CheckInAnswer[] = [];
		if (current?.original) {
			answers.push({ task_id: task.id, answer: 'restore', previous: current.original });
		}
		answers.push({ task_id: task.id, answer, ...(move ? { due_at: move.dueAt } : {}) });

		rows = {
			...rows,
			[task.id]: {
				answer,
				original: current?.original ?? null,
				moveLabel: move?.label,
				pending: true
			}
		};
		rowErrors = withoutKey(rowErrors, task.id);

		let results: CheckInAnswerResult[] = [];
		let requestError: string | null = null;
		try {
			results = await submitAnswers(answers);
		} catch (error) {
			requestError = errorText(error, 'Could not save that answer');
		}

		const last = results[results.length - 1];
		if (last?.kind === 'task' && last.ok) {
			const original = current?.original ?? last.previous;
			const saved: RowState = { answer, original, moveLabel: move?.label, pending: false };
			rows = { ...rows, [task.id]: saved };
			showUndo({
				kind: 'tasks',
				key: task.id,
				label: rowLabel(saved),
				entries: [{ task_id: task.id, previous: original }]
			});
			if (!current) report(1);
			return;
		}

		// If only the "put it back" step went through, the task is unanswered again.
		const restoredOnly = answers.length === 2 && results[0]?.ok === true;
		rows =
			current && !restoredOnly ? { ...rows, [task.id]: current } : withoutKey(rows, task.id);
		rowErrors = {
			...rowErrors,
			[task.id]: requestError ?? firstFailure(results, 'Could not save that answer')
		};
		if (current && restoredOnly) report(-1);
	}

	async function startMove(task: CheckInTask) {
		if (rows[task.id]?.pending || undoing) return;
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

	function confirmMove(task: CheckInTask) {
		const dueAt = dueAtFromDateInput(moveDate);
		if (!dueAt) return;
		void answerTask(task, 'move', { dueAt, label: formatMoveDate(moveDate) });
	}

	async function markAllDone(group: CheckInGroup) {
		const targets = group.tasks.filter((task) => !rows[task.id]);
		if (!targets.length || busyGroups[group.key] || undoing) return;
		clearUndo();
		movingTaskId = null;
		busyGroups = { ...busyGroups, [group.key]: true };
		groupErrors = withoutKey(groupErrors, group.key);
		rows = {
			...rows,
			...Object.fromEntries(
				targets.map((task) => [
					task.id,
					{ answer: 'done', original: null, pending: true } satisfies RowState
				])
			)
		};

		let results: CheckInAnswerResult[] = [];
		let requestError: string | null = null;
		try {
			results = await submitAnswers(
				targets.map((task) => ({ task_id: task.id, answer: 'done' }))
			);
		} catch (error) {
			requestError = errorText(error, 'Could not save those answers');
		}

		const next = { ...rows };
		const entries: UndoEntry[] = [];
		targets.forEach((task, index) => {
			const result = results[index];
			if (result?.kind === 'task' && result.ok) {
				next[task.id] = { answer: 'done', original: result.previous, pending: false };
				entries.push({ task_id: task.id, previous: result.previous });
			} else {
				delete next[task.id];
			}
		});
		rows = next;
		busyGroups = withoutKey(busyGroups, group.key);

		const failed = targets.length - entries.length;
		if (failed) {
			groupErrors = {
				...groupErrors,
				[group.key]:
					requestError ??
					`${failed} could not be saved: ${firstFailure(results, 'unknown error')}`
			};
		}
		if (entries.length) {
			showUndo({
				kind: 'tasks',
				key: group.key,
				label: `Marked ${entries.length} done`,
				entries
			});
			report(entries.length);
		}
	}

	async function undoTasks(entry: TaskUndo) {
		if (undoing) return;
		undoing = true;
		clearUndo();
		rows = {
			...rows,
			...Object.fromEntries(
				entry.entries
					.filter(({ task_id }) => rows[task_id])
					.map(({ task_id }) => [task_id, { ...rows[task_id]!, pending: true }])
			)
		};

		let results: CheckInAnswerResult[] = [];
		try {
			results = await submitAnswers(
				entry.entries.map(({ task_id, previous }) => ({
					task_id,
					answer: 'restore',
					previous
				}))
			);
		} catch {
			results = [];
		}

		const next = { ...rows };
		const errors = { ...rowErrors };
		let undone = 0;
		entry.entries.forEach(({ task_id }, index) => {
			if (results[index]?.ok) {
				delete next[task_id];
				delete errors[task_id];
				undone += 1;
			} else if (next[task_id]) {
				next[task_id] = { ...next[task_id]!, pending: false };
				errors[task_id] = 'Could not undo this one';
			}
		});
		rows = next;
		rowErrors = errors;
		undoing = false;
		if (undone) report(-undone);
	}

	async function answerProject(answer: 'pause' | 'finish') {
		if (projectAnswer?.pending || undoing) return;
		clearUndo();
		projectError = null;
		projectAnswer = { answer, pending: true };

		let results: CheckInAnswerResult[] = [];
		let requestError: string | null = null;
		try {
			results = await submitAnswers([
				{ project_id: project.project_id, project_answer: answer }
			]);
		} catch (error) {
			requestError = errorText(error, 'Could not update the project');
		}

		const result = results[0];
		if (result?.kind === 'project' && result.ok) {
			projectAnswer = { answer, pending: false };
			showUndo({
				kind: 'project',
				key: project.project_id,
				previousState: result.previous_state
			});
			report(1, 0);
			return;
		}
		projectAnswer = null;
		projectError = requestError ?? firstFailure(results, 'Could not update the project');
	}

	async function undoProject(entry: ProjectUndo) {
		if (undoing) return;
		undoing = true;
		clearUndo();
		let ok = false;
		try {
			const results = await submitAnswers([
				{
					project_id: project.project_id,
					project_answer: 'restore',
					previous_state: entry.previousState
				}
			]);
			ok = results[0]?.ok === true;
		} catch {
			ok = false;
		}
		undoing = false;
		if (ok) {
			projectAnswer = null;
			report(-1, project.overdue_count);
		} else {
			projectError = 'Could not undo. Change the project state from the project page.';
		}
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

			{#if projectAnswer && !projectAnswer.pending}
				<div
					role="status"
					class="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-success/10 px-2.5 py-2 text-xs text-foreground"
				>
					<CircleCheck class="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
					<span class="min-w-0 break-words">
						{projectAnswer.answer === 'pause'
							? `Paused ${project.project_name}. These tasks stop coming back here.`
							: `Marked ${project.project_name} finished.`}
					</span>
					{#if projectUndo}
						<button
							type="button"
							class="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							disabled={undoing}
							onclick={() => projectUndo && undoProject(projectUndo)}
						>
							Undo
						</button>
					{/if}
				</div>
			{:else}
				<div
					role="group"
					aria-label="Is this project still on?"
					class="mt-3 grid gap-2 sm:grid-cols-3"
				>
					<button
						type="button"
						aria-pressed={projectAnswer?.answer === 'pause'}
						disabled={Boolean(projectAnswer?.pending) || undoing}
						onclick={() => answerProject('pause')}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none {projectAnswer?.answer ===
						'pause'
							? 'border-accent bg-accent/10'
							: 'border-border bg-background hover:border-accent/50'}"
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
						aria-pressed={projectAnswer?.answer === 'finish'}
						disabled={Boolean(projectAnswer?.pending) || undoing}
						onclick={() => answerProject('finish')}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none {projectAnswer?.answer ===
						'finish'
							? 'border-accent bg-accent/10'
							: 'border-border bg-background hover:border-accent/50'}"
					>
						<span class="text-sm font-semibold text-foreground">It's finished</span>
						<span class="text-xs text-muted-foreground"
							>Marks the project complete.</span
						>
					</button>
					<button
						type="button"
						disabled={Boolean(projectAnswer?.pending) || undoing}
						onclick={() => (expanded = true)}
						class="flex min-h-11 flex-col items-start gap-1 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none"
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
		{#each project.groups as group (group.key)}
			{@const answered = group.tasks.filter(
				(task) => rows[task.id] && !rows[task.id]?.pending
			).length}
			{@const unanswered = group.tasks.filter((task) => !rows[task.id])}
			{@const groupUndo = taskUndo()?.key === group.key ? taskUndo() : null}
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
							{formatCheckInGroupAge(
								group.due_date,
								today,
								answered,
								group.tasks.length
							)}
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
						{@const row = rows[task.id]}
						{@const rowUndo = taskUndo()?.key === task.id ? taskUndo() : null}
						<li
							class="grid min-w-0 gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
						>
							<div class="min-w-0">
								<p
									class="break-words text-sm {row && !row.pending
										? 'text-muted-foreground'
										: 'text-foreground'}"
								>
									{task.title}
								</p>
								{#if row && !row.pending}
									<p
										class="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground"
									>
										<span>{rowLabel(row)}</span>
										{#if rowUndo}
											<button
												type="button"
												class="inline-flex min-h-11 items-center rounded-md px-1 text-xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:py-1"
												disabled={undoing}
												onclick={() => undoTasks(rowUndo)}
											>
												Undo
											</button>
										{/if}
									</p>
								{/if}
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
										aria-pressed={row?.answer === segment.answer}
										aria-expanded={segment.answer === 'move'
											? movingTaskId === task.id
											: undefined}
										disabled={Boolean(row?.pending) || undoing}
										onclick={() =>
											segment.answer === 'move'
												? startMove(task)
												: answerTask(task, segment.answer)}
										class="min-h-11 flex-1 border-l border-border px-3 text-xs font-semibold transition-colors first:border-l-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:flex-none {row?.answer ===
										segment.answer
											? segment.pressed
											: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
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
										onclick={() => confirmMove(task)}
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

				{#if open && group.task_count > group.tasks.length}
					<p class="px-3 pt-2 text-2xs text-muted-foreground">
						{group.task_count - group.tasks.length} more from this day are on the project
						page.
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
							<span class="sr-only"
								>{formatCheckInTally(answered, group.tasks.length)}</span
							>
							{#if groupUndo}
								<span>{groupUndo.label}</span>
								<button
									type="button"
									class="inline-flex min-h-11 items-center rounded-md px-1 text-xs font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									disabled={undoing}
									onclick={() => undoTasks(groupUndo)}
								>
									Undo
								</button>
							{/if}
						</p>
						<div class="flex flex-wrap items-center gap-1">
							{@render talkButton(unanswered)}
							{#if unanswered.length > 1}
								<Button
									variant="ghost"
									size="sm"
									loading={Boolean(busyGroups[group.key])}
									disabled={Boolean(busyGroups[group.key]) || undoing}
									onclick={() => markAllDone(group)}
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
