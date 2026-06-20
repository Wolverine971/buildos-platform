<!-- apps/web/src/lib/components/project/v2/MobileTaskBoard.svelte -->
<!--
	MobileTaskBoard — mobile counterpart to TaskKanbanBoard.

	Single Tasks card with a horizontal status-tab strip underneath the
	header. Tabs match the desktop kanban buckets and surface counts so
	slipping work is visible in the tab strip even when not selected.

	  [Overdue][In progress][Scheduled][Blocked][Backlog][Done][Archived]

	Default selected tab: "In progress" — that's the right at-a-glance view
	when opening a project on a phone (what am I working on right now?).

	Same bucketing rules as TaskKanbanBoard (Overdue takes precedence over
	state). No drag-and-drop — HTML5 drag doesn't fire on touch. Tap a card
	to open the edit modal; state changes happen there.

	Archived lazy-loads on first selection of the Archived tab.
-->
<script lang="ts">
	import {
		Archive,
		AlertTriangle,
		CalendarClock,
		CheckCircle2,
		ChevronDown,
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
	import { slide } from 'svelte/transition';
	import { toastService } from '$lib/stores/toast.store';
	import { getRecentlyCreatedContext } from '$lib/stores/recentlyCreatedContext';
	import type { Task } from '$lib/types/onto';

	const recentlyCreated = getRecentlyCreatedContext();

	type BucketKey =
		| 'overdue'
		| 'in_progress'
		| 'scheduled'
		| 'blocked'
		| 'backlog'
		| 'done'
		| 'archived';

	type BucketDef = {
		key: BucketKey;
		label: string;
		shortLabel: string;
		accent: string;
		bg: string;
		/** Literal active-tab tint class (Tailwind needs literals, not derived strings). */
		activeBg?: string;
		icon: typeof Circle;
		/** Optional accent applied to count chip when bucket has items even
		    when its tab is not selected — used to keep Overdue visibly red. */
		populatedAccent?: string;
	};

	const BUCKETS: BucketDef[] = [
		{
			key: 'overdue',
			label: 'Overdue',
			shortLabel: 'Overdue',
			accent: 'text-destructive',
			bg: 'bg-destructive/10',
			activeBg: 'bg-destructive/5',
			icon: AlertTriangle,
			populatedAccent: 'text-destructive'
		},
		{
			key: 'in_progress',
			label: 'In progress',
			shortLabel: 'Active',
			accent: 'text-info',
			bg: 'bg-info/10',
			activeBg: 'bg-info/5',
			icon: Flame
		},
		{
			key: 'scheduled',
			label: 'Scheduled',
			shortLabel: 'Scheduled',
			accent: 'text-accent',
			bg: 'bg-accent/10',
			activeBg: 'bg-accent/5',
			icon: CalendarClock
		},
		{
			key: 'blocked',
			label: 'Blocked',
			shortLabel: 'Blocked',
			accent: 'text-warning',
			bg: 'bg-warning/10',
			activeBg: 'bg-warning/5',
			icon: PauseCircle
		},
		{
			key: 'backlog',
			label: 'Backlog',
			shortLabel: 'Backlog',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Circle
		},
		{
			key: 'done',
			label: 'Done',
			shortLabel: 'Done',
			accent: 'text-success',
			bg: 'bg-success/10',
			activeBg: 'bg-success/5',
			icon: CheckCircle2
		},
		{
			key: 'archived',
			label: 'Archived',
			shortLabel: 'Archived',
			accent: 'text-muted-foreground',
			bg: 'bg-muted/40',
			icon: Archive
		}
	];

	let {
		projectId,
		tasks,
		canEdit,
		onEditTask,
		onCreateTask
	}: {
		projectId: string;
		tasks: Task[];
		canEdit: boolean;
		onEditTask: (taskId: string) => void;
		onCreateTask?: () => void;
	} = $props();

	let activeTab = $state<BucketKey>('in_progress');
	let isExpanded = $state(true);

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}

	function selectTab(key: BucketKey) {
		activeTab = key;
		if (key === 'archived' && !archivedLoaded && !archivedLoading) {
			void loadArchived();
		}
	}

	// ----------------------------------------------------------------
	// Archived — lazy-loaded on first selection
	// ----------------------------------------------------------------
	let archivedTasks = $state<Task[]>([]);
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
			};
			archivedTasks = (body?.data?.tasks ?? []) as Task[];
			archivedTotal = body?.data?.total ?? archivedTasks.length;
			archivedLoaded = true;
		} catch (err) {
			archivedError = err instanceof Error ? err.message : 'Failed to load archived';
			toastService.error(archivedError);
		} finally {
			archivedLoading = false;
		}
	}

	// ----------------------------------------------------------------
	// Bucketing — mirrors TaskKanbanBoard
	// ----------------------------------------------------------------
	function bucketFor(t: Task): BucketKey {
		if (t.deleted_at) return 'archived';
		if (t.state_key === 'done') return 'done';
		const now = Date.now();
		const dueMs = t.due_at ? new Date(t.due_at).getTime() : null;
		if (dueMs !== null && dueMs < now) return 'overdue';
		if (t.state_key === 'todo') {
			const startMs = t.start_at ? new Date(t.start_at).getTime() : null;
			const future = (dueMs !== null && dueMs >= now) || (startMs !== null && startMs >= now);
			return future ? 'scheduled' : 'backlog';
		}
		if (t.state_key === 'in_progress') return 'in_progress';
		if (t.state_key === 'blocked') return 'blocked';
		return 'backlog';
	}

	const tasksByBucket = $derived.by(() => {
		const buckets: Record<BucketKey, Task[]> = {
			overdue: [],
			in_progress: [],
			scheduled: [],
			blocked: [],
			backlog: [],
			done: [],
			archived: []
		};
		for (const t of tasks) {
			if (t.deleted_at) {
				buckets.archived.push(t);
				continue;
			}
			buckets[bucketFor(t)]!.push(t);
		}
		for (const t of archivedTasks) {
			if (!buckets.archived.some((existing) => existing.id === t.id)) {
				buckets.archived.push(t);
			}
		}

		// Sort: priority first (lower = higher priority), then due-date
		// (soonest first for active; latest first for done/archived).
		for (const key of Object.keys(buckets) as BucketKey[]) {
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

	const activeCount = $derived(tasks.filter((t) => !t.deleted_at).length);

	function countFor(bucket: BucketDef): number {
		if (bucket.key === 'archived' && archivedLoaded) return archivedTotal;
		return tasksByBucket[bucket.key]?.length ?? 0;
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

	function archivedAtLabel(task: Task): string | null {
		if (!task.deleted_at) return null;
		const date = new Date(task.deleted_at);
		const diffMs = Date.now() - date.getTime();
		const diffDay = Math.round(diffMs / (1000 * 60 * 60 * 24));
		if (diffDay < 1) return 'today';
		if (diffDay === 1) return 'yesterday';
		if (diffDay < 14) return `${diffDay}d ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function assigneeLabel(task: Task): string | null {
		const list = task.assignees ?? [];
		if (!list.length) return null;
		const first = list[0]!;
		const name = first.name?.trim() || first.email?.split('@')[0] || null;
		if (!name) return null;
		return list.length > 1 ? `${name} +${list.length - 1}` : name;
	}

	function emptyMessage(key: BucketKey): string {
		switch (key) {
			case 'overdue':
				return 'Nothing overdue. Nice.';
			case 'in_progress':
				return 'Nothing active right now.';
			case 'scheduled':
				return 'Nothing scheduled.';
			case 'blocked':
				return 'Nothing blocked.';
			case 'backlog':
				return 'Backlog is empty.';
			case 'done':
				return 'Nothing completed yet.';
			case 'archived':
				return 'No archived tasks.';
		}
	}
</script>

<section
	class="w-full min-w-0 max-w-full bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	aria-label="Mobile task board"
>
	<!-- Header: matches ProjectDocumentsSection's pattern — header button
		 toggles expand; separate icon-only `+` (when canEdit) and chevron
		 buttons sit on the right. -->
	<header
		class="flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 {isExpanded
			? 'border-b border-border/60'
			: ''}"
	>
		<button
			type="button"
			onclick={toggleExpanded}
			aria-expanded={isExpanded}
			aria-controls="mob-task-body"
			class="flex items-center gap-2 flex-1 min-w-0 text-left hover:bg-muted/60 rounded-lg transition-colors pressable"
		>
			<div
				class="w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg bg-accent/10 flex items-center justify-center shrink-0"
			>
				<ListChecks class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent" />
			</div>
			<div class="min-w-0">
				<p class="text-xs sm:text-sm font-semibold text-foreground">Tasks</p>
				<p class="text-[10px] sm:text-xs text-muted-foreground">
					{activeCount} active
				</p>
			</div>
		</button>
		<div class="flex items-center gap-1 sm:gap-2 shrink-0">
			{#if canEdit && onCreateTask}
				<button
					type="button"
					onclick={onCreateTask}
					class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
					aria-label="Add task"
				>
					<Plus class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
				</button>
			{/if}
			<button
				type="button"
				onclick={toggleExpanded}
				class="p-1 sm:p-1.5 rounded-md hover:bg-muted transition-colors pressable"
				aria-label={isExpanded ? 'Collapse tasks' : 'Expand tasks'}
			>
				<ChevronDown
					class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground transition-transform duration-[120ms] {isExpanded
						? 'rotate-180'
						: ''}"
				/>
			</button>
		</div>
	</header>

	{#if isExpanded}
		<div id="mob-task-body" transition:slide={{ duration: 140 }}>
			<!-- Status tabs: dedicated scroll viewport so the flex strip can grow
		 wider than the card and scroll horizontally on touch. Edge fade
		 hints at scrollability. -->
			<div class="relative border-b border-border/60 bg-muted/15">
				<div class="overflow-x-auto overscroll-x-contain no-scrollbar">
					<div role="tablist" aria-label="Task status" class="flex w-max min-w-full">
						{#each BUCKETS as bucket (bucket.key)}
							{@const count = countFor(bucket)}
							{@const isActive = activeTab === bucket.key}
							{@const isPopulated = count > 0}
							<button
								role="tab"
								type="button"
								id="task-tab-{bucket.key}"
								aria-selected={isActive}
								aria-controls="task-panel-{bucket.key}"
								tabindex={isActive ? 0 : -1}
								onclick={() => selectTab(bucket.key)}
								class="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset border-b-2 min-h-[44px]
							{isActive
									? `${bucket.accent} ${bucket.activeBg ?? bucket.bg} border-current`
									: 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent'}"
							>
								<bucket.icon
									class="w-3.5 h-3.5 shrink-0 {isActive
										? bucket.accent
										: isPopulated && bucket.populatedAccent
											? bucket.populatedAccent
											: 'text-muted-foreground'}"
								/>
								<span>{bucket.shortLabel}</span>
								{#if count > 0 || isActive}
									<span
										class="text-[10px] tabular-nums rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-semibold
									{isActive
											? 'bg-background/80 text-foreground border border-border/40'
											: isPopulated && bucket.populatedAccent
												? `${bucket.populatedAccent} bg-destructive/10`
												: 'text-muted-foreground bg-muted/60'}"
									>
										{count}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>
				<!-- Right-edge fade so users see there's more to scroll. Hidden
			 on the rightmost scroll position via the pointer-events-none
			 wrapper; the fade itself doesn't intercept touches. -->
				<div
					class="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent"
					aria-hidden="true"
				></div>
			</div>

			<!-- Active tab panel -->
			{#each BUCKETS as bucket (bucket.key)}
				{#if activeTab === bucket.key}
					{@const items = tasksByBucket[bucket.key] ?? []}
					{@const isArchive = bucket.key === 'archived'}
					<div
						id="task-panel-{bucket.key}"
						role="tabpanel"
						aria-labelledby="task-tab-{bucket.key}"
						class="p-2.5 space-y-1.5 min-h-[160px]"
					>
						{#if isArchive && !archivedLoaded && archivedLoading}
							<div
								class="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground"
							>
								<LoaderCircle class="w-3.5 h-3.5 animate-spin" />
								Loading archived…
							</div>
						{:else if isArchive && archivedError && !archivedLoaded}
							<div class="px-2 py-3 space-y-2">
								<p class="text-xs text-destructive">{archivedError}</p>
								<button
									type="button"
									onclick={() => void loadArchived()}
									class="w-full inline-flex items-center justify-center gap-1.5 text-[11px] font-medium text-foreground/80 hover:text-foreground bg-muted/30 hover:bg-muted/60 border border-border/60 rounded-md px-2 py-1.5 transition-colors pressable"
								>
									<RefreshCw class="w-3 h-3" /> Retry
								</button>
							</div>
						{:else if items.length === 0}
							<div
								class="flex flex-col items-center justify-center gap-2 py-10 text-center"
							>
								<div
									class="w-10 h-10 rounded-full {bucket.bg} flex items-center justify-center"
								>
									<bucket.icon class="w-5 h-5 {bucket.accent}" />
								</div>
								<p class="text-xs text-muted-foreground italic max-w-[220px]">
									{emptyMessage(bucket.key)}
								</p>
							</div>
						{:else}
							{#each items as task (task.id)}
								{@const due = dueLabel(task)}
								{@const prio = priorityLabel(task.priority)}
								{@const assignee = assigneeLabel(task)}
								{@const archivedAt = archivedAtLabel(task)}
								{@const isArchivedCard = !!task.deleted_at}
								{@const justCreated = recentlyCreated?.has(task.id) ?? false}
								<button
									type="button"
									onclick={() => onEditTask(task.id)}
									class="w-full min-w-0 text-left bg-background hover:bg-muted/50 active:bg-muted border border-border/60 rounded-md px-3 py-2.5 transition-colors pressable min-h-[44px]
										{justCreated ? 'entity-just-created' : ''}"
								>
									<p
										class="text-sm font-medium text-foreground line-clamp-2 leading-snug break-words
									{bucket.key === 'done' || isArchivedCard ? 'line-through text-muted-foreground' : ''}"
									>
										{task.title}
									</p>
									{#if prio || due || assignee || archivedAt}
										<div
											class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5"
										>
											{#if prio && !isArchivedCard}
												<span
													class="text-[11px] font-semibold {prio.className}"
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
													class="text-[11px] text-muted-foreground/70 italic"
												>
													archived {archivedAt}
												</span>
											{/if}
										</div>
									{/if}
								</button>
							{/each}
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</section>

<style>
	/* Hide horizontal scrollbar on the tab strip — keep scroll behavior. */
	.no-scrollbar {
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
</style>
