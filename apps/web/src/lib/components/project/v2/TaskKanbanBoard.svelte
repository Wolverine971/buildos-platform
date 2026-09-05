<!-- apps/web/src/lib/components/project/v2/TaskKanbanBoard.svelte -->
<!--
	TaskKanbanBoard — v2 PoC component

	Familiar 4-stage workflow on a single row:
	  Backlog · In Progress · Blocked · Done

	Scheduled and overdue are due-date filters, not workflow stages. Archived is
	available on demand as a secondary column. The row scrolls horizontally so
	each column keeps a comfortable width
	(cards stay readable).

	Drag-and-drop semantics:
	  - State columns (Backlog/In Progress/Blocked/Done) accept any card.
	    A card from Archived is restored first (POST /restore), then PATCHed.
	  - Archived accepts any non-archived card (DELETE soft-delete).
	  - Scheduled and Overdue are derived filters, never drop targets.

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
	  - Overdue and Scheduled are derived filters; matching cards stay in their
	    persisted workflow column and can be dragged normally.
	  - Archived cards can be dragged back to a workflow column to restore them.

	Archived cards are not in the standard project loader response, so the
	column lazy-loads them from /api/onto/projects/[id]/tasks/archived.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { dataMutationEvents, mutationAffectsProject } from '$lib/stores/projectDataMutations';
	import { slide } from 'svelte/transition';
	import {
		Archive,
		AlertTriangle,
		CalendarClock,
		CheckCircle2,
		Circle,
		Clock,
		Filter,
		Flame,
		ListChecks,
		LoaderCircle,
		PauseCircle,
		RefreshCw,
		User,
		X
	} from '$lib/icons/lucide';
	import { slideMotion } from '$lib/components/project/v2/board-a11y';
	import { toastService } from '$lib/stores/toast.store';
	import { getRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';
	import type { Task, TaskState } from '$lib/types/onto';
	import type {
		ProjectActiveTaskBucketKey,
		ProjectTasksCoverage
	} from '$lib/types/project-full-data';
	import {
		compareProjectTasksForBucket,
		getProjectTaskAsOfMs,
		getProjectTaskBoardBucket
	} from '$lib/utils/project-task-board';

	const recentlyCreated = getRecentlyCreatedContext();

	type WorkflowColumnKey = 'backlog' | 'in_progress' | 'blocked' | 'done';
	type ColumnKey = WorkflowColumnKey | 'archived';
	type DueFilterKey = 'scheduled' | 'overdue';

	type ColumnDef = {
		key: ColumnKey;
		label: string;
		hint: string;
		accent: string;
		bg: string;
		icon: typeof Circle;
		/** What kind of drop this column accepts */
		dropAction: 'state' | 'archive';
		/** State that gets PATCHed when dropping (only used when dropAction === 'state') */
		targetState?: TaskState;
	};

	const WORKFLOW_COLUMNS: ColumnDef[] = [
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
		}
	];

	const ARCHIVED_COLUMN: ColumnDef = {
		key: 'archived',
		label: 'Archived',
		hint: 'Removed from view',
		accent: 'text-muted-foreground',
		bg: 'bg-muted/40',
		icon: Archive,
		dropAction: 'archive'
	};

	const DUE_FILTERS: Array<{
		key: DueFilterKey;
		label: string;
		icon: typeof CalendarClock;
	}> = [
		{
			key: 'overdue',
			label: 'Overdue',
			icon: AlertTriangle
		},
		{
			key: 'scheduled',
			label: 'Scheduled',
			icon: CalendarClock
		}
	];

	let {
		projectId,
		tasks,
		tasksCoverage,
		canEdit,
		onEditTask,
		onTaskMoved,
		onLoadMoreTasks
	}: {
		projectId: string;
		tasks: Task[];
		tasksCoverage?: ProjectTasksCoverage;
		canEdit: boolean;
		onEditTask: (taskId: string) => void;
		onTaskMoved?: (taskId: string, newState: TaskState | 'archived') => void;
		onLoadMoreTasks?: (bucket: ProjectActiveTaskBucketKey) => Promise<void>;
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
	let archivedServerReturned = $state(0);
	let archivedHasMore = $state(false);
	let archivedRefreshPending = false;

	async function refreshArchivedTasks() {
		if (archivedLoading) {
			archivedRefreshPending = true;
			return;
		}
		if (!archivedLoaded) return;
		const loadedCount = archivedServerReturned;
		await loadArchived();
		while (archivedHasMore && archivedServerReturned < loadedCount) {
			const previousCount = archivedServerReturned;
			await loadArchived(true);
			if (archivedServerReturned <= previousCount) break;
		}
	}

	onMount(() => {
		let initial = true;
		return dataMutationEvents.subscribe((event) => {
			if (initial) {
				initial = false;
				return;
			}
			if (!event || !mutationAffectsProject(event.summary, projectId)) return;
			const mutations = event.summary.mutations;
			if (
				mutations?.length &&
				!mutations.some(
					(mutation) =>
						(!mutation.entityKind || mutation.entityKind === 'task') &&
						(!mutation.projectIds.length || mutation.projectIds.includes(projectId))
				)
			)
				return;
			void refreshArchivedTasks();
		});
	});

	async function loadArchived(loadMore = false) {
		if (archivedLoading) return;
		const activeProjectId = projectId;
		const offset = loadMore ? archivedServerReturned : 0;
		archivedLoading = true;
		archivedError = null;
		try {
			const res = await fetch(
				`/api/onto/projects/${activeProjectId}/tasks/archived?limit=50&offset=${offset}`,
				{ credentials: 'same-origin' }
			);
			if (!res.ok) throw new Error(`Failed (${res.status})`);
			const body = (await res.json()) as {
				data?: { tasks?: Task[]; total?: number; hasMore?: boolean };
				success?: boolean;
			};
			if (projectId !== activeProjectId) return;
			const fetched = (body?.data?.tasks ?? []) as Task[];
			archivedTotal = body?.data?.total ?? fetched.length;
			archivedServerReturned = offset + fetched.length;
			archivedHasMore = body?.data?.hasMore ?? archivedServerReturned < archivedTotal;
			// Merge: drop any local copy of these IDs, then add server rows.
			const fetchedIds = new Set(fetched.map((t) => t.id));
			localTasks = [
				...localTasks.filter((t) => !fetchedIds.has(t.id) && (loadMore || !t.deleted_at)),
				...fetched.map((t) => ({ ...t }))
			];
			archivedLoaded = true;
		} catch (err) {
			archivedError = err instanceof Error ? err.message : 'Failed to load archived';
		} finally {
			archivedLoading = false;
			if (archivedRefreshPending) {
				archivedRefreshPending = false;
				void refreshArchivedTasks();
			}
		}
	}

	// ----------------------------------------------------------------
	// Bucketing
	// ----------------------------------------------------------------

	let showFilters = $state(false);
	let showArchived = $state(false);
	let activeDueFilters = $state<Set<DueFilterKey>>(new Set());

	const asOfMs = $derived(getProjectTaskAsOfMs(tasksCoverage?.as_of));
	const selectedDueFilters = $derived(
		DUE_FILTERS.filter((filter) => activeDueFilters.has(filter.key))
	);

	function taskWorkflowColumn(task: Task): ColumnKey {
		if (task.deleted_at) return 'archived';
		if (task.state_key === 'done') return 'done';
		if (task.state_key === 'in_progress') return 'in_progress';
		if (task.state_key === 'blocked') return 'blocked';
		return 'backlog';
	}

	function matchesDueFilters(task: Task): boolean {
		if (activeDueFilters.size === 0) return true;
		const dueBucket = getProjectTaskBoardBucket(task, asOfMs);
		return (
			(dueBucket === 'overdue' && activeDueFilters.has('overdue')) ||
			(dueBucket === 'scheduled' && activeDueFilters.has('scheduled'))
		);
	}

	const tasksByColumn = $derived.by(() => {
		const grouped: Record<ColumnKey, Task[]> = {
			backlog: [],
			in_progress: [],
			blocked: [],
			done: [],
			archived: []
		};

		for (const task of localTasks) {
			const column = taskWorkflowColumn(task);
			if (column === 'archived' || matchesDueFilters(task)) grouped[column].push(task);
		}

		for (const column of Object.keys(grouped) as ColumnKey[]) {
			grouped[column].sort((a, b) => compareProjectTasksForBucket(column, a, b));
		}
		return grouped;
	});

	function toggleDueFilter(filter: DueFilterKey) {
		const next = new Set(activeDueFilters);
		if (next.has(filter)) next.delete(filter);
		else next.add(filter);
		activeDueFilters = next;
	}

	function clearDueFilters() {
		activeDueFilters = new Set();
	}

	function dueFilterCount(filter: DueFilterKey): number {
		return (
			tasksCoverage?.buckets[filter]?.total ??
			localTasks.filter((task) => getProjectTaskBoardBucket(task, asOfMs) === filter).length
		);
	}

	async function toggleArchivedColumn() {
		showArchived = !showArchived;
		if (showArchived && !archivedLoaded) await loadArchived();
	}

	let loadingTaskBuckets = $state<Set<ProjectActiveTaskBucketKey>>(new Set());
	let taskBucketErrors = $state<Partial<Record<ProjectActiveTaskBucketKey, string>>>({});

	async function loadMoreTasks(bucket: ProjectActiveTaskBucketKey) {
		if (!onLoadMoreTasks || loadingTaskBuckets.has(bucket)) return;
		loadingTaskBuckets = new Set(loadingTaskBuckets).add(bucket);
		taskBucketErrors = { ...taskBucketErrors, [bucket]: undefined };
		try {
			await onLoadMoreTasks(bucket);
		} catch (error) {
			taskBucketErrors = {
				...taskBucketErrors,
				[bucket]: error instanceof Error ? error.message : 'Failed to load more tasks'
			};
		} finally {
			const next = new Set(loadingTaskBuckets);
			next.delete(bucket);
			loadingTaskBuckets = next;
		}
	}

	const incompleteTaskBuckets = $derived.by(() => {
		if (!tasksCoverage || !onLoadMoreTasks) return [];
		const relevantBuckets =
			activeDueFilters.size > 0
				? ([...activeDueFilters] as ProjectActiveTaskBucketKey[])
				: (Object.keys(tasksCoverage.buckets) as ProjectActiveTaskBucketKey[]);
		return relevantBuckets.filter((bucket) => !tasksCoverage?.buckets[bucket]?.complete);
	});

	const visibleTaskCoverage = $derived.by(() => {
		if (!tasksCoverage) return null;
		if (activeDueFilters.size === 0) {
			return { returned: tasksCoverage.returned, total: tasksCoverage.total };
		}
		return [...activeDueFilters].reduce(
			(summary, bucket) => {
				const coverage = tasksCoverage?.buckets[bucket];
				return {
					returned: summary.returned + (coverage?.returned ?? 0),
					total: summary.total + (coverage?.total ?? 0)
				};
			},
			{ returned: 0, total: 0 }
		);
	});

	async function loadMoreVisibleTasks() {
		for (const bucket of incompleteTaskBuckets) await loadMoreTasks(bucket);
	}

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

		const taskId = event.dataTransfer?.getData('text/plain') ?? draggingTaskId;
		dragOverColumn = null;
		draggingTaskId = null;
		if (!taskId) return;

		const idx = localTasks.findIndex((t) => t.id === taskId);
		if (idx === -1) return;
		const before = { ...localTasks[idx]! };
		const wasArchived = !!before.deleted_at;

		// No-op guard: dropping on the column the task already lives in.
		if (taskWorkflowColumn(before) === col.key) return;

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
		return tasksCoverage?.total ?? localTasks.filter((t) => !t.deleted_at).length;
	}
</script>

<section class="overflow-hidden border-y border-border/70" aria-label="Task kanban board">
	<header
		class="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-1 py-2.5"
	>
		<div class="flex min-w-0 items-center gap-2">
			<ListChecks class="h-4 w-4 shrink-0 text-muted-foreground" />
			<p class="truncate text-sm font-semibold text-foreground">
				{activeTaskCount()} tasks
			</p>
		</div>

		<div class="flex items-center gap-1.5">
			<button
				type="button"
				onclick={() => (showFilters = !showFilters)}
				aria-controls="task-board-filters"
				aria-expanded={showFilters}
				aria-label={activeDueFilters.size > 0
					? `Filters, ${activeDueFilters.size} active`
					: 'Filters'}
				class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none pressable
					{showFilters || activeDueFilters.size > 0
					? 'bg-accent/10 text-accent'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
			>
				<Filter class="h-3.5 w-3.5" />
				Filters
				{#if activeDueFilters.size > 0}
					<span
						class="inline-flex min-w-5 items-center justify-center rounded-md bg-accent px-1 text-2xs text-accent-foreground"
					>
						{activeDueFilters.size}
					</span>
				{/if}
			</button>
			<button
				type="button"
				onclick={() => void toggleArchivedColumn()}
				aria-controls="task-bucket-archived"
				aria-expanded={showArchived}
				aria-label={showArchived ? 'Hide archived tasks' : 'Show archived tasks'}
				class="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none pressable
					{showArchived
					? 'bg-muted text-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
			>
				<Archive class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">Archived</span>
				{#if archivedLoaded && archivedTotal > 0}
					<span class="text-2xs text-muted-foreground">{archivedTotal}</span>
				{/if}
			</button>
		</div>
	</header>

	{#if showFilters}
		<div
			id="task-board-filters"
			class="border-b border-border/60 bg-muted/15 px-3 py-3"
			transition:slide={slideMotion()}
		>
			<div
				class="flex flex-wrap items-center gap-2"
				role="group"
				aria-label="Due date filters"
			>
				<span class="micro-label mr-1 text-muted-foreground">Due date</span>
				{#each DUE_FILTERS as filter (filter.key)}
					{@const isActive = activeDueFilters.has(filter.key)}
					<button
						type="button"
						onclick={() => toggleDueFilter(filter.key)}
						aria-pressed={isActive}
						aria-label="Filter by {filter.label.toLowerCase()} tasks"
						class="inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pressable
							{isActive
							? 'border-accent/40 bg-accent/10 text-foreground'
							: 'border-border/70 bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
					>
						<filter.icon
							class="h-3.5 w-3.5 {filter.key === 'overdue'
								? 'text-destructive'
								: 'text-accent'}"
						/>
						<span>{filter.label}</span>
						<span class="text-2xs text-muted-foreground"
							>{dueFilterCount(filter.key)}</span
						>
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if selectedDueFilters.length > 0}
		<div
			class="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-3 py-2"
			aria-label="Active task filters"
		>
			{#each selectedDueFilters as filter (filter.key)}
				<button
					type="button"
					onclick={() => toggleDueFilter(filter.key)}
					aria-label="Remove {filter.label.toLowerCase()} filter"
					class="inline-flex min-h-[32px] items-center gap-1.5 rounded-md bg-accent/10 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
				>
					{filter.label}
					<X class="h-3 w-3 text-muted-foreground" />
				</button>
			{/each}
			<button
				type="button"
				onclick={clearDueFilters}
				class="min-h-[32px] rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
			>
				Clear filters
			</button>
		</div>
	{/if}

	{#snippet columnView(col: ColumnDef)}
		{@const items = tasksByColumn[col.key] ?? []}
		{@const isOver = dragOverColumn === col.key}
		{@const isArchive = col.key === 'archived'}
		<div
			id="task-bucket-{col.key}"
			data-column-key={col.key}
			tabindex="-1"
			class="kanban-column flex min-h-[220px] flex-col rounded-md border bg-card/45 transition-colors
				{isOver
				? 'border-foreground/60 bg-foreground/[0.06] ring-1 ring-foreground/20'
				: 'border-border/60'}"
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
					<span class="text-2xs shrink-0 text-muted-foreground">
						{isArchive && archivedLoaded ? archivedTotal : items.length}
					</span>
				</div>
				<span class="micro-label hidden shrink-0 text-muted-foreground/60 md:inline">
					{col.hint}
				</span>
			</div>

			<!-- Archived tasks are fetched only after the secondary column is opened. -->
			{#if isArchive && !archivedLoaded}
				<div class="px-3 pt-2">
					<button
						type="button"
						onclick={() => void loadArchived()}
						disabled={archivedLoading}
						class="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-2xs font-medium text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50 motion-reduce:transition-none pressable"
					>
						{#if archivedLoading}
							<LoaderCircle
								class="w-3.5 h-3.5 animate-spin motion-reduce:animate-none"
							/> Loading…
						{:else}
							<RefreshCw class="w-3.5 h-3.5" /> Try loading archived again
						{/if}
					</button>
					{#if archivedError}
						<p class="mt-1 text-xs text-destructive">{archivedError}</p>
					{/if}
				</div>
			{/if}

			<div class="flex-1 p-2 sm:p-2.5 space-y-2 overflow-y-auto max-h-[520px]">
				{#if items.length === 0}
					<div
						class="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground/70 italic"
					>
						{#if isArchive}
							{archivedLoaded
								? 'No archived tasks'
								: 'Drag a card here to archive it'}
						{:else if activeDueFilters.size > 0}
							No matching tasks
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
							class="group min-h-[44px] w-full rounded-md border border-border bg-card px-2.5 py-2 text-left shadow-none transition-all hover:border-foreground/20 hover:shadow-ink focus:outline-none focus-visible:shadow-ink-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable
								{isDragging ? 'opacity-40 shadow-ink-strong' : ''}
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
									class="mt-0.5 line-clamp-1 text-xs leading-snug text-muted-foreground"
								>
									{task.description}
								</p>
							{/if}
							{#if prio || due || assignee || archivedAt}
								<div class="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
									{#if prio && !isArchivedCard}
										<span class="text-2xs font-semibold {prio.className}"
											>{prio.label}</span
										>
									{/if}
									{#if due}
										<span
											class="inline-flex items-center gap-1 text-2xs font-medium {due.isOverdue
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
											class="inline-flex items-center gap-1 text-2xs text-muted-foreground"
										>
											<User class="w-3 h-3" />
											{assignee}
										</span>
									{/if}
									{#if archivedAt}
										<span
											class="inline-flex items-center gap-1 text-2xs italic text-muted-foreground/80"
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

				{#if isArchive && archivedLoaded && archivedHasMore}
					<button
						type="button"
						onclick={() => void loadArchived(true)}
						disabled={archivedLoading}
						class="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-2 py-2 text-2xs font-medium text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50 motion-reduce:transition-none pressable"
					>
						{#if archivedLoading}
							<LoaderCircle
								class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							/>
							Loading…
						{:else}
							Load more ({archivedServerReturned}/{archivedTotal})
						{/if}
					</button>
				{/if}
			</div>
		</div>
	{/snippet}

	<!-- Board: single horizontally-scrollable row. Four workflow columns share
	     the desktop width and keep a 270px minimum before the row scrolls. The
	     right-edge fade makes "more columns" obvious when macOS hides the
	     scrollbar (Hyperplexed: make scrollability visible). -->
	<div class="relative">
		<div class="kanban-scroll overflow-x-auto py-3">
			<div class="grid grid-flow-col auto-cols-[minmax(270px,1fr)] gap-3">
				{#each WORKFLOW_COLUMNS as col (col.key)}
					{@render columnView(col)}
				{/each}
				{#if showArchived}
					{@render columnView(ARCHIVED_COLUMN)}
				{/if}
			</div>
		</div>
		<div
			class="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
			aria-hidden="true"
		></div>
	</div>

	{#if incompleteTaskBuckets.length > 0 && visibleTaskCoverage}
		<footer
			class="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-3 py-2"
		>
			<div>
				<p class="text-xs text-muted-foreground">
					Showing {visibleTaskCoverage.returned} of {visibleTaskCoverage.total}
					{activeDueFilters.size > 0 ? 'matching tasks' : 'tasks'}
				</p>
				{#each incompleteTaskBuckets as bucket (bucket)}
					{#if taskBucketErrors[bucket]}
						<p class="text-xs text-destructive">{taskBucketErrors[bucket]}</p>
					{/if}
				{/each}
			</div>
			<button
				type="button"
				onclick={() => void loadMoreVisibleTasks()}
				disabled={loadingTaskBuckets.size > 0}
				aria-label="Load more tasks ({visibleTaskCoverage.returned}/{visibleTaskCoverage.total})"
				class="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 motion-reduce:transition-none pressable"
			>
				{#if loadingTaskBuckets.size > 0}
					<LoaderCircle class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
					Loading…
				{:else}
					Load more
				{/if}
			</button>
		</footer>
	{/if}
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

	@media (max-width: 639px) {
		.kanban-scroll {
			scroll-snap-type: x mandatory;
		}

		.kanban-column {
			scroll-snap-align: start;
		}

		.kanban-column[data-column-key='in_progress'] {
			order: 1;
		}

		.kanban-column[data-column-key='backlog'] {
			order: 2;
		}

		.kanban-column[data-column-key='blocked'] {
			order: 3;
		}

		.kanban-column[data-column-key='done'] {
			order: 4;
		}

		.kanban-column[data-column-key='archived'] {
			order: 5;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.task-just-completed {
			animation: none;
		}
	}
</style>
