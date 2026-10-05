<!-- apps/web/src/lib/components/projects/desktop/ReaderTaskList.svelte -->
<!--
	Tasks as one list beside the reader: the board's columns stacked (In progress,
	Backlog, Blocked, then Done folded away). Colors match the Projects tiles:
	red overdue, green in progress, blue scheduled, gray backlog.
-->
<script lang="ts">
	import { ChevronRight, Circle, CircleCheck, CircleDot, CircleSlash } from '$lib/icons/lucide';
	import './desktop-colors.css';
	import { taskBucket } from './desktop-signals';
	import type { TaskGroup } from './reader-task-groups';

	let {
		groups,
		selectedId,
		showDone = $bindable(false),
		onOpen
	}: {
		groups: readonly TaskGroup[];
		selectedId: string | null;
		showDone?: boolean;
		onOpen: (taskId: string) => void;
	} = $props();

	const now = Date.now();

	function shortDate(value: string | null | undefined): string {
		if (!value) return '';
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<div class="task-list">
	{#each groups as group (group.key)}
		{#if group.key === 'done'}
			<button
				type="button"
				class="group-head fold"
				aria-expanded={showDone}
				onclick={() => (showDone = !showDone)}
			>
				<ChevronRight
					class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none {showDone
						? 'rotate-90'
						: ''}"
				/>
				Done <span class="count">{group.tasks.length}</span>
			</button>
		{:else}
			<div class="group-head">
				{group.label} <span class="count">{group.tasks.length}</span>
			</div>
		{/if}
		{#if group.key !== 'done' || showDone}
			{#each group.tasks as task (task.id)}
				{@const bucket = taskBucket(
					{
						state_key: task.state_key,
						due_at: task.due_at ?? null,
						start_at: task.start_at ?? null
					},
					now
				)}
				{@const selected = selectedId === task.id}
				{@const date = task.state_key === 'done' ? '' : shortDate(task.due_at)}
				<button
					type="button"
					class="row"
					class:sel={selected}
					data-row-id={task.id}
					aria-current={selected ? 'true' : undefined}
					onclick={() => onOpen(task.id)}
				>
					<span class="glyph bucket-{bucket}">
						{#if task.state_key === 'done'}<CircleCheck
								class="h-4 w-4"
							/>{:else if task.state_key === 'in_progress'}<CircleDot
								class="h-4 w-4"
							/>{:else if task.state_key === 'blocked'}<CircleSlash
								class="h-4 w-4"
							/>{:else}<Circle class="h-4 w-4" />{/if}
					</span>
					<span class="title" class:done={task.state_key === 'done'}>{task.title}</span>
					{#if date}
						<span class="chip date-{bucket}">{date}</span>
					{/if}
				</button>
			{/each}
		{/if}
	{:else}
		<p class="empty">No tasks yet.</p>
	{/each}
</div>

<style>
	.task-list {
		display: grid;
		align-content: start;
		gap: 2px;
		padding: 6px 8px 16px;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 32px;
		padding: 10px 8px 4px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.group-head.fold {
		border-radius: 8px;
		text-align: left;
	}
	.group-head.fold:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.count {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-weight: 500;
		letter-spacing: 0;
	}
	.row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		border-radius: 9px;
		padding: 6px 8px;
		text-align: left;
		transition: background-color 100ms ease;
	}
	.row:hover {
		background: hsl(var(--muted));
	}
	.row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.row.sel {
		background: hsl(var(--accent) / 0.12);
	}
	.row.sel .title {
		color: hsl(var(--accent));
		font-weight: 600;
	}
	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 14px;
		color: hsl(var(--foreground));
	}
	.title.done {
		color: hsl(var(--muted-foreground));
		text-decoration: line-through;
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}
	.bucket-overdue {
		color: hsl(var(--desk-overdue));
	}
	.bucket-in_progress {
		color: hsl(var(--desk-in-progress));
	}
	.bucket-scheduled {
		color: hsl(var(--desk-scheduled));
	}
	.chip {
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		padding: 2px 6px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.chip.date-overdue {
		border-color: hsl(var(--desk-overdue) / 0.5);
		color: hsl(var(--desk-overdue));
	}
	.chip.date-scheduled {
		border-color: hsl(var(--desk-scheduled) / 0.5);
		color: hsl(var(--desk-scheduled));
	}
	.empty {
		padding: 16px 8px;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	@media (prefers-reduced-motion: reduce) {
		.row {
			transition: none;
		}
	}
</style>
