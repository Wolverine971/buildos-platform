<!-- apps/web/src/lib/components/project/v2/TaskKanbanBoard.svelte -->
<!--
	TaskKanbanBoard — v2 PoC component

	Trello-style 7-column board on a single row:
	  Backlog · In Progress · Scheduled · Overdue · Blocked · Done · Archived

	The row scrolls horizontally so each column keeps a comfortable 300px width
	(cards stay readable).

	Drag-and-drop semantics:
	  - State columns (Backlog/In Progress/Blocked/Done) accept any card.
	    A card from Archived is restored first (POST /restore), then PATCHed.
	  - Archived accepts any non-archived card (DELETE soft-delete).
	  - Scheduled and Overdue are derived views — no drops accepted.

	Bucketing is mutually exclusive and combines `state_key`, `due_at`/`start_at`,
	and `deleted_at`. Overdue takes precedence over state buckets so slipping
	work is impossible to miss.

	Bucket rules (top to bottom = first match wins):
	  Archived    → deleted_at != null
	  Done        → state_key === 'done'
	  Overdue     → has due_at < now
	  Scheduled   → state_key === 'todo' AND has due_at OR start_at >= now
	  In Progress → state_key === 'in_progress'
	  Blocked     → state_key === 'blocked'
	  Backlog     → state_key === 'todo' (everything else)

	Drag rules:
	  - Backlog / In Progress / Blocked / Done accept drops → PATCH state_key
	  - Archived accepts drops → DELETE (soft-delete via deleted_at)
	  - Overdue and Scheduled are derived views; no drops, but their cards
	    can still be dragged out to a state column.
	  - Archived cards cannot be dragged (no restore endpoint in PoC).

	Archived cards are not in the standard project loader response, so the
	column lazy-loads them from /api/onto/projects/[id]/tasks/archived.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		Archive,
		AlertTriangle,
		CalendarClock,
		CheckCircle2,
		Circle,
		Clock,
		Flame,
		ListChecks,
		LoaderCircle,
		PauseCircle,
		Plus,
		RefreshCw,
		User
	} from 'lucide-svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { getRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';
	import type { Task, TaskState } from '$lib/types/onto';

	const recentlyCreated = getRecentlyCreatedContext();

	type ColumnKey =
		| 'backlog'
		| 'scheduled'
		| 'overdue'
		| 'in_progress'
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
		/** What kind of drop this column accepts */
		dropAction: 'state' | 'archive' | 'none';
		/** State that gets PATCHed when dropping (only used when dropAction === 'state') */
		targetState?: TaskState;
	};

	const COLUMNS: ColumnDef[] = [
		{
			key: 'backlog',
			label: 'Backlog',
			hint: 'Not started',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Circle,
			dropAction: 'state',
			targetState: 'todo'
		},
		{
			key: 'in_progress',
			label: 'In progress',
			hint: 'Actively working',
			accent: 'text-info',
			bg: 'bg-info/10',
			icon: Flame,
			dropAction: 'state',
			targetState: 'in_progress'
		},
		{
			key: 'scheduled',
			label: 'Scheduled',
			hint: 'On the calendar',
			accent: 'text-accent',
			bg: 'bg-accent/10',
			icon: CalendarClock,
			dropAction: 'none'
		},
		{
			key: 'overdue',
			label: 'Overdue',
			hint: 'Past due date',
			accent: 'text-destructive',
			bg: 'bg-destructive/10',
			icon: AlertTriangle,
			dropAction: 'none'
		},
		{
			key: 'blocked',
			label: 'Blocked',
			hint: 'Stuck or waiting',
			accent: 'text-warning',
			bg: 'bg-warning/10',
			icon: PauseCircle,
			dropAction: 'state',
			targetState: 'blocked'
		},
		{
			key: 'done',
			label: 'Done',
			hint: 'Completed',
			accent: 'text-success',
			bg: 'bg-success/10',
			icon: CheckCircle2,
			dropAction: 'state',
			targetState: 'done'
		},
		{
			key: 'archived',
			label: 'Archived',
			hint: 'Soft-deleted',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Archive,
			dropAction: 'archive'
		}
	];

	let {
		projectId,
		tasks,
		canEdit,
		onEditTask,
		onCreateTask,
		onTaskMoved
	}: {
		projectId: string;
		tasks: Task[];
		canEdit: boolean;
		onEditTask: (taskId: string) => void;
		onCreateTask?: () => void;
		onTaskMoved?: (taskId: string, newState: TaskState | 'archived') => void;
	} = $props();

	// ----------------------------------------------------------------
	// Local mirror so optimistic edits don't mutate parent state
	// ----------------------------------------------------------------
	let localTasks = $state<Task[]>([]);

	// Sync from props when the parent gives us a new list, but keep any
	// locally-archived tasks (we own them after a drag-to-archive until the
	// parent refreshes from the API).
	//
	// `localTasks` is read inside `untrack` so the assignment doesn't
	// re-trigger this effect — otherwise rebuilding `localTasks` would create
	// a new array identity and the effect would loop forever.
	$effect(() => {
		const incomingIds = new Set(tasks.map((t) => t.id));
		untrack(() => {
			const localArchived = localTasks.filter((t) => t.deleted_at && !incomingIds.has(t.id));
			localTasks = [...tasks.map((t) => ({ ...t })), ...localArchived];
		});
	});

	// ----------------------------------------------------------------
	// Archived (lazy-loaded from server when the column is first opened)
	// ----------------------------------------------------------------
	let archivedLoaded = $state(false);
	let archivedLoading = $state(false);
	let archivedError = $state<string | null>(null);
	let archivedTotal = $state(0);

	async function loadArchived() {
		if (archivedLoading) return;
		archivedLoading = true;
		archivedError = null;
		try {
			const res = await fetch(
				`/api/onto/projects/${projectId}/tasks/archived?limit=100&offset=0`,
				{ credentials: 'same-origin' }
			);
			if (!res.ok) throw new Error(`Failed (${res.status})`);
			const body = (await res.json()) as {
				data?: { tasks?: Task[]; total?: number };
				success?: boolean;
			};
			const fetched = (body?.data?.tasks ?? []) as Task[];
			archivedTotal = body?.data?.total ?? fetched.length;
			// Merge: drop any local copy of these IDs, then add server rows.
			const fetchedIds = new Set(fetched.map((t) => t.id));
			localTasks = [
				...localTasks.filter((t) => !fetchedIds.has(t.id)),
				...fetched.map((t) => ({ ...t }))
			];
			archivedLoaded = true;
		} catch (err) {
			archivedError = err instanceof Error ? err.message : 'Failed to load archived';
		} finally {
			archivedLoading = false;
		}
	}

	// ----------------------------------------------------------------
	// Bucketing
	// ----------------------------------------------------------------

	function bucketFor(t: Task): ColumnKey {
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
		const buckets: Record<ColumnKey, Task[]> = {
			backlog: [],
			scheduled: [],
			overdue: [],
			in_progress: [],
			blocked: [],
			done: [],
			archived: []
		};
		for (const t of localTasks) {
			buckets[bucketFor(t)]!.push(t);
		}
		// Sort: priority, then due date (soonest first for active, latest first for done/archived)
		for (const key of Object.keys(buckets) as ColumnKey[]) {
			const reverse = key === 'done' || key === 'archived';
			buckets[key]!.sort((a, b) => {
				const pa = typeof a.priority === 'number' ? a.priority : 5;
				const pb = typeof b.priority === 'number' ? b.priority : 5;
				if (pa !== pb) return pa - pb;
				const da =
					(key === 'archived' && a.deleted_at
						? new Date(a.deleted_at).getTime()
						: a.due_at
							? new Date(a.due_at).getTime()
							: a.start_at
								? new Date(a.start_at).getTime()
								: null) ?? Infinity;
				const db =
					(key === 'archived' && b.deleted_at
						? new Date(b.deleted_at).getTime()
						: b.due_at
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

	// ----------------------------------------------------------------
	// Drag state
	// ----------------------------------------------------------------
	let draggingTaskId = $state<string | null>(null);
	let dragOverColumn = $state<ColumnKey | null>(null);
	let pendingTaskIds = $state<Set<string>>(new Set());

	// Tasks just confirmed done — pulse the card as a small "nice, that's finished" beat.
	let recentlyCompletedIds = $state<Set<string>>(new Set());
	const completionTimers = new Map<string, ReturnType<typeof setTimeout>>();
	function celebrateCompletion(taskId: string) {
		recentlyCompletedIds = new Set(recentlyCompletedIds).add(taskId);
		const existing = completionTimers.get(taskId);
		if (existing) clearTimeout(existing);
		completionTimers.set(
			taskId,
			setTimeout(() => {
				const next = new Set(recentlyCompletedIds);
				next.delete(taskId);
				recentlyCompletedIds = next;
				completionTimers.delete(taskId);
			}, 900)
		);
	}
	$effect(() => () => {
		for (const timer of completionTimers.values()) clearTimeout(timer);
		completionTimers.clear();
	});

	function handleDragStart(event: DragEvent, task: Task) {
		if (!canEdit) {
			event.preventDefault();
			return;
		}
		draggingTaskId = task.id;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', task.id);
		}
	}

	function handleDragEnd() {
		draggingTaskId = null;
		dragOverColumn = null;
	}

	function handleDragOver(event: DragEvent, col: ColumnDef) {
		if (!canEdit || !draggingTaskId) return;
		if (col.dropAction === 'none') return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = col.dropAction === 'archive' ? 'move' : 'move';
		}
		dragOverColumn = col.key;
	}

	function handleDragLeave(col: ColumnDef) {
		if (dragOverColumn === col.key) dragOverColumn = null;
	}

	async function handleDrop(event: DragEvent, col: ColumnDef) {
		event.preventDefault();
		if (!canEdit) return;
		if (col.dropAction === 'none') return;

		const taskId = event.dataTransfer?.getData('text/plain') ?? draggingTaskId;
		dragOverColumn = null;
		draggingTaskId = null;
		if (!taskId) return;

		const idx = localTasks.findIndex((t) => t.id === taskId);
		if (idx === -1) return;
		const before = { ...localTasks[idx]! };
		const wasArchived = !!before.deleted_at;

		// No-op guard: dropping on the column the task already lives in.
		if (bucketFor(before) === col.key) return;

		// ----- Re-archive of an already-archived card → no-op -----
		if (col.dropAction === 'archive' && wasArchived) return;

		// ----- Archive (soft-delete) -----
		if (col.dropAction === 'archive') {
			localTasks[idx] = {
				...before,
				deleted_at: new Date().toISOString()
			} as Task;
			pendingTaskIds = new Set(pendingTaskIds).add(taskId);
			try {
				const res = await fetch(`/api/onto/tasks/${taskId}`, {
					method: 'DELETE',
					credentials: 'same-origin'
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string } | null;
					throw new Error(body?.error || `Archive failed (${res.status})`);
				}
				archivedTotal = archivedTotal + 1;
				onTaskMoved?.(taskId, 'archived');
			} catch (err) {
				const rollbackIdx = localTasks.findIndex((t) => t.id === taskId);
				if (rollbackIdx !== -1) localTasks[rollbackIdx] = before;
				toastService.error(err instanceof Error ? err.message : 'Could not archive task');
			} finally {
				const next = new Set(pendingTaskIds);
				next.delete(taskId);
				pendingTaskIds = next;
			}
			return;
		}

		// ----- State change (with optional restore-from-archive first) -----
		if (col.dropAction === 'state' && col.targetState) {
			const target = col.targetState;
			localTasks[idx] = {
				...before,
				deleted_at: wasArchived ? null : before.deleted_at,
				state_key: target,
				completed_at:
					target === 'done' ? (before.completed_at ?? new Date().toISOString()) : null
			} as Task;
			pendingTaskIds = new Set(pendingTaskIds).add(taskId);

			// Track server-side success per step so a partial-failure rollback
			// can mirror server truth instead of clobbering it with `before`.
			let restoredOnServer = false;
			let patchedOnServer = false;

			try {
				// Step 1: if restoring from archive, clear deleted_at first so the
				// follow-up PATCH can pass the "deleted_at IS NULL" filter.
				if (wasArchived) {
					const restoreRes = await fetch(`/api/onto/tasks/${taskId}/restore`, {
						method: 'POST',
						credentials: 'same-origin'
					});
					if (!restoreRes.ok) {
						const body = (await restoreRes.json().catch(() => null)) as {
							error?: string;
						} | null;
						throw new Error(body?.error || `Restore failed (${restoreRes.status})`);
					}
					restoredOnServer = true;
				}

				// Step 2: PATCH the new state. Skip the PATCH when restoring into
				// the bucket the task was already in (state already matches target).
				const needsPatch = !wasArchived || target !== before.state_key;
				if (needsPatch) {
					const res = await fetch(`/api/onto/tasks/${taskId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'same-origin',
						body: JSON.stringify({ state_key: target })
					});
					if (!res.ok) {
						const body = (await res.json().catch(() => null)) as {
							error?: string;
						} | null;
						throw new Error(body?.error || `Update failed (${res.status})`);
					}
					patchedOnServer = true;
				}

				// Both server steps succeeded — only now sync the count.
				if (restoredOnServer) {
					archivedTotal = Math.max(0, archivedTotal - 1);
				}
				if (target === 'done') celebrateCompletion(taskId);
				onTaskMoved?.(taskId, target);
			} catch (err) {
				// Rollback to whatever the server actually has, not to `before`:
				//   - restore failed → still archived, original state
				//   - restore succeeded but PATCH failed → restored, original state
				//   - both succeeded → unreachable (we'd be in the success path)
				const rollbackIdx = localTasks.findIndex((t) => t.id === taskId);
				if (rollbackIdx !== -1) {
					localTasks[rollbackIdx] = {
						...before,
						deleted_at: restoredOnServer ? null : before.deleted_at
					} as Task;
				}
				// Decrement archivedTotal here (instead of after restore) so the
				// count reflects server truth even on a partial failure.
				if (restoredOnServer && !patchedOnServer) {
					archivedTotal = Math.max(0, archivedTotal - 1);
				}
				toastService.error(err instanceof Error ? err.message : 'Could not move task');
			} finally {
				const next = new Set(pendingTaskIds);
				next.delete(taskId);
				pendingTaskIds = next;
			}
		}
	}

	// ----------------------------------------------------------------
	// Display helpers
	// ----------------------------------------------------------------

	function priorityLabel(p: number | null | undefined): {
		label: string;
		className: string;
	} | null {
		if (typeof p !== 'number') return null;
		if (p <= 1) return { label: 'P1', className: 'text-destructive' };
		if (p === 2) return { label: 'P2', className: 'text-warning' };
		if (p === 3) return { label: 'P3', className: 'text-info' };
		return null;
	}

	function dueLabel(task: Task): { label: string; isOverdue: boolean } | null {
		const ref = task.due_at || task.start_at;
		if (!ref) return null;
		const date = new Date(ref);
		const diffMs = date.getTime() - Date.now();
		const diffDay = Math.round(diffMs / (1000 * 60 * 60 * 24));
		if (task.state_key === 'done' || task.deleted_at) {
			return {
				label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
				isOverdue: false
			};
		}
		if (diffDay < 0) return { label: `${Math.abs(diffDay)}d late`, isOverdue: true };
		if (diffDay === 0) return { label: 'today', isOverdue: false };
		if (diffDay === 1) return { label: 'tomorrow', isOverdue: false };
		if (diffDay < 14) return { label: `in ${diffDay}d`, isOverdue: false };
		return {
			label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			isOverdue: false
		};
	}

	function archivedLabel(task: Task): string | null {
		if (!task.deleted_at) return null;
		const date = new Date(task.deleted_at);
		const diffMs = Date.now() - date.getTime();
		const diffDay = Math.round(diffMs / (1000 * 60 * 60 * 24));
		if (diffDay < 1) return 'archived today';
		if (diffDay === 1) return 'archived yesterday';
		if (diffDay < 14) return `archived ${diffDay}d ago`;
		return `archived ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
	}

	function assigneeLabel(task: Task): string | null {
		const list = task.assignees ?? [];
		if (!list.length) return null;
		const first = list[0]!;
		const name = first.name?.trim() || first.email?.split('@')[0] || null;
		if (!name) return null;
		return list.length > 1 ? `${name} +${list.length - 1}` : name;
	}

	function activeTaskCount(): number {
		return localTasks.filter((t) => !t.deleted_at).length;
	}
</script>

<section
	class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	aria-label="Task kanban board"
>
	<header
		class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60"
	>
		<div class="flex items-center gap-2">
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-lg bg-muted/60 flex items-center justify-center"
			>
				<ListChecks class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-foreground" />
			</div>
			<div>
				<p class="text-xs sm:text-sm font-semibold text-foreground">Tasks</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{activeTaskCount()}
					active · drag to move
				</p>
			</div>
		</div>
		{#if canEdit && onCreateTask}
			<button
				type="button"
				onclick={onCreateTask}
				class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
			>
				<Plus class="w-3.5 h-3.5" />
				New task
			</button>
		{/if}
	</header>

	{#snippet columnView(col: ColumnDef)}
		{@const items = tasksByColumn[col.key] ?? []}
		{@const isOver = dragOverColumn === col.key}
		{@const isViewOnly = col.dropAction === 'none'}
		{@const isDanger = col.key === 'overdue'}
		{@const isArchive = col.key === 'archived'}
		<div
			class="flex flex-col rounded-md border bg-background/60 min-h-[220px] transition-colors
				{isOver
				? 'border-foreground/60 bg-foreground/[0.06] ring-1 ring-foreground/20'
				: 'border-border/60'}
				{isViewOnly ? 'border-dashed' : ''}
				{isDanger && items.length > 0 ? 'border-destructive/40 bg-destructive/5' : ''}"
			ondragover={(e) => handleDragOver(e, col)}
			ondragleave={() => handleDragLeave(col)}
			ondrop={(e) => handleDrop(e, col)}
			role="region"
			aria-label="{col.label} column"
		>
			<div
				class="flex items-center justify-between px-3 py-2.5 gap-2 border-b border-border/40"
			>
				<div class="flex items-center gap-2 min-w-0">
					<span
						class="w-6 h-6 rounded-md {col.bg} flex items-center justify-center shrink-0"
					>
						<col.icon class="w-3.5 h-3.5 {col.accent}" />
					</span>
					<span class="text-sm font-semibold text-foreground truncate">
						{col.label}
					</span>
					<span class="text-[11px] text-muted-foreground shrink-0">
						{isArchive && archivedLoaded ? archivedTotal : items.length}
					</span>
				</div>
				<span
					class="text-[10px] uppercase tracking-widest text-muted-foreground/60 shrink-0 hidden md:inline"
				>
					{col.hint}
				</span>
			</div>

			<!-- Archived column has a load button at the top -->
			{#if isArchive && !archivedLoaded}
				<div class="px-3 pt-2">
					<button
						type="button"
						onclick={loadArchived}
						disabled={archivedLoading}
						class="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-foreground/80 hover:text-foreground bg-muted/30 hover:bg-muted/60 border border-border/60 rounded-md px-2 py-1.5 transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
					>
						{#if archivedLoading}
							<LoaderCircle
								class="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
							/> Loading…
						{:else}
							<RefreshCw class="w-3.5 h-3.5" /> Load archived from server
						{/if}
					</button>
					{#if archivedError}
						<p class="text-[10px] text-destructive mt-1">{archivedError}</p>
					{/if}
				</div>
			{/if}

			<div class="flex-1 p-2 sm:p-2.5 space-y-2 overflow-y-auto max-h-[520px]">
				{#if items.length === 0}
					<div
						class="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground/70 italic"
					>
						{#if isViewOnly}
							Nothing here — that's good
						{:else if isArchive}
							{archivedLoaded
								? 'No archived tasks'
								: 'Drag a card here to archive it'}
						{:else}
							Drop tasks here
						{/if}
					</div>
				{:else}
					{#each items as task (task.id)}
						{@const due = dueLabel(task)}
						{@const prio = priorityLabel(task.priority)}
						{@const assignee = assigneeLabel(task)}
						{@const archivedAt = archivedLabel(task)}
						{@const isPending = pendingTaskIds.has(task.id)}
						{@const isDragging = draggingTaskId === task.id}
						{@const isArchivedCard = !!task.deleted_at}
						{@const justCreated = recentlyCreated?.has(task.id) ?? false}
						{@const justCompleted = recentlyCompletedIds.has(task.id)}
						<button
							type="button"
							draggable={canEdit}
							ondragstart={(e) => handleDragStart(e, task)}
							ondragend={handleDragEnd}
							onclick={() => onEditTask(task.id)}
							title={isArchivedCard ? 'Drag to a state column to restore' : undefined}
							class="group w-full text-left bg-card border border-border rounded-md px-3 py-2.5 shadow-sm hover:shadow-ink hover:border-foreground/20 transition-all pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset
								{isDragging ? 'opacity-40' : ''}
								{isPending ? 'opacity-70' : ''}
								{isArchivedCard ? 'opacity-70' : ''}
								{justCreated ? 'entity-just-created' : ''}
								{justCompleted ? 'task-just-completed' : ''}
								{canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}"
						>
							<p
								class="text-sm font-medium text-foreground line-clamp-2 leading-snug
									{col.key === 'done' || isArchivedCard ? 'line-through text-muted-foreground' : ''}"
							>
								{task.title}
							</p>
							{#if task.description}
								<p
									class="text-xs text-muted-foreground line-clamp-2 mt-1 leading-snug"
								>
									{task.description}
								</p>
							{/if}
							{#if prio || due || assignee || archivedAt}
								<div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2.5">
									{#if prio && !isArchivedCard}
										<span class="text-[11px] font-semibold {prio.className}"
											>{prio.label}</span
										>
									{/if}
									{#if due}
										<span
											class="text-[11px] font-medium inline-flex items-center gap-1 {due.isOverdue
												? 'text-destructive'
												: 'text-muted-foreground'}"
										>
											{#if due.isOverdue}
												<AlertTriangle class="w-3 h-3" />
											{:else}
												<Clock class="w-3 h-3" />
											{/if}
											{due.label}
										</span>
									{/if}
									{#if assignee && !isArchivedCard}
										<span
											class="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
										>
											<User class="w-3 h-3" />
											{assignee}
										</span>
									{/if}
									{#if archivedAt}
										<span
											class="inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 italic"
										>
											<Clock class="w-3 h-3" />
											{archivedAt}
										</span>
									{/if}
								</div>
							{/if}
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/snippet}

	<!-- Board: single horizontally-scrollable row. Columns get a generous
	     ~300px min width so cards have breathing room; the row scrolls. The
	     right-edge fade makes "more columns" obvious when macOS hides the
	     scrollbar (Hyperplexed: make scrollability visible). -->
	<div class="relative">
		<div class="overflow-x-auto p-3 sm:p-4">
			<div class="grid grid-flow-col auto-cols-[300px] gap-3 sm:gap-4">
				{#each COLUMNS as col (col.key)}
					{@render columnView(col)}
				{/each}
			</div>
		</div>
		<div
			class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
			aria-hidden="true"
		></div>
	</div>
</section>

<style>
	/* A brief success-green pulse when a task is confirmed done. The global
	   reduced-motion guard (app.css) neutralizes this for opted-out users. */
	@keyframes task-completed-pulse {
		0% {
			box-shadow: 0 0 0 0 hsl(var(--success) / 0);
		}
		40% {
			transform: scale(1.015);
			box-shadow:
				0 0 0 2px hsl(var(--success) / 0.5),
				0 8px 22px -10px hsl(var(--success) / 0.55);
		}
		100% {
			transform: scale(1);
			box-shadow: 0 0 0 0 hsl(var(--success) / 0);
		}
	}
	.task-just-completed {
		animation: task-completed-pulse 0.7s cubic-bezier(0.22, 1, 0.36, 1);
	}
</style>
