<!-- apps/web/src/lib/components/landing/public-project-preview/PublicTaskBoard.svelte -->
<!--
	Public, read-only mirror of project/v2/TaskKanbanBoard + MobileTaskBoard.

	Desktop: 7 columns on a single horizontally-scrolling row.
	Mobile:  same 7 columns, but stacked into a single vertical column selector
	         (a chip strip + a list under it).

	Bucket rules mirror the v2 board so visitors see the same shape:
	  archived  → deleted_at != null  (omitted from public source for now)
	  done      → state_key === 'done'
	  overdue   → due_at < now
	  scheduled → state_key === 'todo' AND (due_at OR start_at) >= now
	  in_progress → state_key === 'in_progress'
	  blocked   → state_key === 'blocked'
	  backlog   → state_key === 'todo' (everything else)

	No drag/drop, no edit, no actions — read-only preview.
-->
<script lang="ts">
	import {
		AlertTriangle,
		Archive,
		CalendarClock,
		CheckCircle2,
		Circle,
		Flame,
		PauseCircle
	} from 'lucide-svelte';
	import type { OntoTask } from '$lib/types/onto-api';
	import type { ViewportMode } from './lib/public-project-types';

	type ColumnKey =
		| 'backlog'
		| 'in_progress'
		| 'scheduled'
		| 'overdue'
		| 'blocked'
		| 'done'
		| 'archived';

	type ColumnDef = {
		key: ColumnKey;
		label: string;
		hint: string;
		accent: string;
		bg: string;
		icon: typeof Circle;
	};

	const COLUMNS: ColumnDef[] = [
		{
			key: 'backlog',
			label: 'Backlog',
			hint: 'Not started',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Circle
		},
		{
			key: 'in_progress',
			label: 'In progress',
			hint: 'Actively working',
			accent: 'text-sky-500',
			bg: 'bg-sky-500/10',
			icon: Flame
		},
		{
			key: 'scheduled',
			label: 'Scheduled',
			hint: 'On the calendar',
			accent: 'text-violet-500',
			bg: 'bg-violet-500/10',
			icon: CalendarClock
		},
		{
			key: 'overdue',
			label: 'Overdue',
			hint: 'Past due date',
			accent: 'text-rose-500',
			bg: 'bg-rose-500/10',
			icon: AlertTriangle
		},
		{
			key: 'blocked',
			label: 'Blocked',
			hint: 'Stuck or waiting',
			accent: 'text-amber-500',
			bg: 'bg-amber-500/10',
			icon: PauseCircle
		},
		{
			key: 'done',
			label: 'Done',
			hint: 'Completed',
			accent: 'text-emerald-500',
			bg: 'bg-emerald-500/10',
			icon: CheckCircle2
		},
		{
			key: 'archived',
			label: 'Archived',
			hint: 'Soft-deleted',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Archive
		}
	];

	let {
		tasks,
		viewport = 'desktop'
	}: {
		tasks: OntoTask[];
		viewport?: ViewportMode;
	} = $props();

	function bucketFor(t: OntoTask): ColumnKey {
		if (t.deleted_at) return 'archived';
		if (t.state_key === 'done') return 'done';
		const now = Date.now();
		const dueMs = t.due_at ? new Date(t.due_at).getTime() : null;
		if (dueMs !== null && dueMs < now) return 'overdue';
		if (t.state_key === 'todo') {
			const startMs = t.start_at ? new Date(t.start_at).getTime() : null;
			const future = (dueMs !== null && dueMs >= now) || (startMs !== null && startMs >= now);
			if (future) return 'scheduled';
			return 'backlog';
		}
		if (t.state_key === 'in_progress') return 'in_progress';
		if (t.state_key === 'blocked') return 'blocked';
		return 'backlog';
	}

	const tasksByColumn = $derived.by(() => {
		const buckets: Record<ColumnKey, OntoTask[]> = {
			backlog: [],
			in_progress: [],
			scheduled: [],
			overdue: [],
			blocked: [],
			done: [],
			archived: []
		};
		for (const t of tasks ?? []) {
			buckets[bucketFor(t)]!.push(t);
		}
		for (const key of Object.keys(buckets) as ColumnKey[]) {
			const reverse = key === 'done' || key === 'archived';
			buckets[key]!.sort((a, b) => {
				const pa = typeof a.priority === 'number' ? a.priority : 5;
				const pb = typeof b.priority === 'number' ? b.priority : 5;
				if (pa !== pb) return pa - pb;
				const da =
					(a.due_at
						? new Date(a.due_at).getTime()
						: a.start_at
							? new Date(a.start_at).getTime()
							: null) ?? Infinity;
				const db =
					(b.due_at
						? new Date(b.due_at).getTime()
						: b.start_at
							? new Date(b.start_at).getTime()
							: null) ?? Infinity;
				if (da !== db) return reverse ? db - da : da - db;
				return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
			});
		}
		return buckets;
	});

	// Visible columns: in mobile view, hide archived if empty to save space.
	const visibleColumns = $derived(
		viewport === 'mobile'
			? COLUMNS.filter((c) => !(c.key === 'archived' && tasksByColumn.archived.length === 0))
			: COLUMNS
	);

	// Mobile selected column
	let mobileColumn = $state<ColumnKey>('in_progress');

	$effect(() => {
		// If the current selection is empty but another column has tasks,
		// hop to the first column with tasks so the empty state isn't sticky.
		if (viewport !== 'mobile') return;
		if (tasksByColumn[mobileColumn]?.length) return;
		const firstWithTasks = visibleColumns.find((c) => tasksByColumn[c.key]?.length);
		if (firstWithTasks) mobileColumn = firstWithTasks.key;
	});

	function dueLabel(
		iso: string | null | undefined
	): { label: string; isOverdue: boolean } | null {
		if (!iso) return null;
		const date = new Date(iso);
		const diffDay = Math.round((date.getTime() - Date.now()) / 86400000);
		if (diffDay < 0) return { label: `${Math.abs(diffDay)}d late`, isOverdue: true };
		if (diffDay === 0) return { label: 'today', isOverdue: false };
		if (diffDay === 1) return { label: 'tomorrow', isOverdue: false };
		if (diffDay < 14) return { label: `in ${diffDay}d`, isOverdue: false };
		return {
			label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			isOverdue: false
		};
	}
</script>

{#if viewport === 'mobile'}
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		aria-label="Task board"
	>
		<header class="px-3 py-2 border-b border-border/60 flex items-center justify-between">
			<p class="text-xs font-semibold text-foreground">Tasks</p>
			<span class="text-[10px] uppercase tracking-widest text-muted-foreground/70">
				{tasks?.length ?? 0} total
			</span>
		</header>
		<div class="flex gap-1 px-2 py-2 overflow-x-auto border-b border-border/60">
			{#each visibleColumns as col (col.key)}
				{@const isActive = mobileColumn === col.key}
				{@const count = tasksByColumn[col.key]?.length ?? 0}
				<button
					type="button"
					onclick={() => (mobileColumn = col.key)}
					class="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] font-medium transition-colors shrink-0 {isActive
						? `${col.bg} ${col.accent} border-border/80`
						: 'text-muted-foreground border-border/60 hover:bg-muted/40'}"
				>
					<col.icon class="w-3 h-3 {isActive ? col.accent : 'text-muted-foreground'}" />
					<span>{col.label}</span>
					<span class="text-[10px] text-muted-foreground/70">{count}</span>
				</button>
			{/each}
		</div>
		<div class="p-2 space-y-1.5 max-h-[55vh] overflow-y-auto">
			{#each [tasksByColumn[mobileColumn] ?? []] as bucket (mobileColumn)}
				{#if bucket.length === 0}
					<p class="text-[11px] text-muted-foreground italic px-2 py-3 text-center">
						No tasks in {COLUMNS.find(
							(c) => c.key === mobileColumn
						)?.label.toLowerCase()}.
					</p>
				{:else}
					{#each bucket.slice(0, 10) as t (t.id)}
						{@const due = dueLabel(t.due_at ?? null)}
						<div class="bg-background border border-border/60 rounded-md px-2.5 py-2">
							<p class="text-[12px] font-medium text-foreground line-clamp-2">
								{t.title}
							</p>
							{#if due || t.priority}
								<p
									class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5"
								>
									{#if due}
										<span
											class={due.isOverdue
												? 'text-destructive font-medium'
												: 'text-muted-foreground'}
										>
											{due.label}
										</span>
									{/if}
									{#if due && t.priority !== null && t.priority !== undefined}
										<span class="text-muted-foreground/50">·</span>
									{/if}
									{#if t.priority !== null && t.priority !== undefined}
										<span>P{t.priority}</span>
									{/if}
								</p>
							{/if}
						</div>
					{/each}
					{#if bucket.length > 10}
						<p class="text-[10px] text-muted-foreground italic px-2 py-1 text-center">
							+ {bucket.length - 10} more
						</p>
					{/if}
				{/if}
			{/each}
		</div>
	</section>
{:else}
	<section
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
		aria-label="Task board"
	>
		<header
			class="px-3 sm:px-4 py-2 border-b border-border/60 flex items-center justify-between"
		>
			<p class="text-xs sm:text-sm font-semibold text-foreground">Tasks</p>
			<span class="text-[10px] uppercase tracking-widest text-muted-foreground/70">
				{tasks?.length ?? 0} total
			</span>
		</header>
		<div class="overflow-x-auto">
			<div class="flex gap-2 p-2 sm:p-3 min-w-max">
				{#each visibleColumns as col (col.key)}
					{@const bucket = tasksByColumn[col.key] ?? []}
					<div
						class="w-[260px] shrink-0 bg-background border border-border/60 rounded-md flex flex-col"
					>
						<div
							class="flex items-center justify-between gap-2 px-2.5 py-2 border-b border-border/60 {col.bg}"
						>
							<div class="flex items-center gap-1.5 min-w-0">
								<col.icon class="w-3.5 h-3.5 shrink-0 {col.accent}" />
								<div class="min-w-0">
									<p class="text-xs font-semibold text-foreground line-clamp-1">
										{col.label}
									</p>
									<p class="text-[10px] text-muted-foreground line-clamp-1">
										{col.hint}
									</p>
								</div>
							</div>
							<span class="text-[10px] text-muted-foreground/80 shrink-0">
								{bucket.length}
							</span>
						</div>
						<div class="p-2 space-y-1.5 max-h-[320px] overflow-y-auto">
							{#if bucket.length === 0}
								<p
									class="text-[11px] text-muted-foreground italic text-center px-2 py-3"
								>
									Empty
								</p>
							{:else}
								{#each bucket.slice(0, 8) as t (t.id)}
									{@const due = dueLabel(t.due_at ?? null)}
									<div
										class="bg-card border border-border/60 rounded-md px-2.5 py-2 shadow-sm"
									>
										<p
											class="text-[12px] font-medium text-foreground line-clamp-2"
										>
											{t.title}
										</p>
										{#if due || t.priority !== null}
											<p
												class="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5"
											>
												{#if due}
													<span
														class={due.isOverdue
															? 'text-destructive font-medium'
															: 'text-muted-foreground'}
													>
														{due.label}
													</span>
												{/if}
												{#if due && t.priority !== null && t.priority !== undefined}
													<span class="text-muted-foreground/50">·</span>
												{/if}
												{#if t.priority !== null && t.priority !== undefined}
													<span>P{t.priority}</span>
												{/if}
											</p>
										{/if}
									</div>
								{/each}
								{#if bucket.length > 8}
									<p
										class="text-[10px] text-muted-foreground italic px-2 text-center"
									>
										+ {bucket.length - 8} more
									</p>
								{/if}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>
{/if}
