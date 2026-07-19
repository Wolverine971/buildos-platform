<!-- apps/web/src/lib/components/project/v2/PulseStrip.svelte -->
<!--
	PulseStrip — v2 component

	Two layouts in one component, CSS-toggled by viewport:

	Desktop (sm+): two-column "what's happening" header
		- Left: Recently Done — derived from project activity logs
		- Right: Up Next — upcoming scheduled work, sorted by date

	Mobile (< sm): single card with a segmented Recent / Up next tab strip.
		Only one list is visible at a time. Tap targets and meta rows are
		tuned for thumb use.

	Tiles are dense so the page reads as a status board, not a doc index.
	Click a tile to open its entity.
-->
<script lang="ts">
	import {
		ArrowRight,
		Calendar,
		Clock,
		FileText,
		Flag,
		History,
		ListChecks,
		Sparkles,
		Target
	} from '$lib/icons/lucide';
	import type { ProjectLogEntityType, ProjectLogEntryWithMeta } from '@buildos/shared-types';
	import type { Goal, Milestone, OntoEvent, Task } from '$lib/types/onto';
	import { fetchProjectLogs } from '$lib/components/project/project-page-data-controller';
	import { getEventStartMs, isEventPast } from '$lib/components/project/project-event-filters';
	import { handleRovingTabKeydown } from '$lib/components/project/v2/board-a11y';

	type UpcomingKind = 'task' | 'milestone' | 'goal' | 'event';

	type UpcomingItem = {
		id: string;
		kind: UpcomingKind;
		title: string;
		date: Date;
		state?: string | null;
		isOverdue: boolean;
	};

	let {
		projectId,
		tasks,
		milestones,
		goals,
		events,
		loadActivity = true,
		mode = 'pulse',
		onOpenEntity
	}: {
		projectId: string;
		tasks: Task[];
		milestones: Milestone[];
		goals: Goal[];
		events: OntoEvent[];
		loadActivity?: boolean;
		mode?: 'pulse' | 'workspace';
		onOpenEntity: (kind: ProjectLogEntityType, id: string) => void;
	} = $props();

	let logs = $state.raw<ProjectLogEntryWithMeta[]>([]);
	let logsLoading = $state(true);
	let logsLoadingMore = $state(false);
	let logsError = $state<string | null>(null);
	let logsTotal = $state(0);
	let logsHasMore = $state(false);
	let loadedLogsSignature = $state<string | null>(null);
	let showAllUpcoming = $state(false);

	let mobileTab = $state<'next' | 'recent'>('recent');

	// Roving-tabindex order must match the rendered tab order (recent, next).
	const MOBILE_TAB_ORDER = ['recent', 'next'] as const;
	let mobileTabButtons = $state<HTMLButtonElement[]>([]);

	function onMobileTabKeydown(event: KeyboardEvent, index: number) {
		handleRovingTabKeydown(
			event,
			index,
			MOBILE_TAB_ORDER.length,
			(target) => (mobileTab = MOBILE_TAB_ORDER[target]!),
			(target) => mobileTabButtons[target]?.focus()
		);
	}

	const currentLogsSignature = $derived(`${projectId}:${mode}`);
	const surfaceLabel = $derived(mode === 'workspace' ? 'Project activity' : 'Project pulse');
	const viewsLabel = $derived(
		mode === 'workspace' ? 'Project activity views' : 'Project pulse views'
	);

	async function loadLogs(
		requestProjectId = projectId,
		append = false,
		requestMode: 'pulse' | 'workspace' = mode
	) {
		const requestSignature = `${requestProjectId}:${requestMode}`;
		if (append) {
			if (logsLoadingMore || !logsHasMore) return;
			logsLoadingMore = true;
		} else {
			logsLoading = true;
		}
		logsError = null;
		try {
			const page = await fetchProjectLogs({
				projectId: requestProjectId,
				limit: requestMode === 'workspace' ? 20 : 12,
				offset: append ? logs.length : 0
			});
			if (currentLogsSignature !== requestSignature) return;
			logs = append ? [...logs, ...page.logs] : page.logs;
			logsTotal = page.total;
			logsHasMore = page.hasMore;
			loadedLogsSignature = requestSignature;
		} catch (err) {
			if (currentLogsSignature !== requestSignature) return;
			logsError = err instanceof Error ? err.message : 'Failed to load activity';
		} finally {
			if (currentLogsSignature === requestSignature) {
				if (append) {
					logsLoadingMore = false;
				} else {
					logsLoading = false;
				}
			}
		}
	}

	// Effect runs once after first mount AND every time projectId changes, but
	// only after the page lets secondary requests start.
	$effect(() => {
		const currentProjectId = projectId;
		const signature = currentLogsSignature;
		if (loadedLogsSignature !== signature) {
			logs = [];
			logsError = null;
			logsLoading = true;
			logsLoadingMore = false;
			logsTotal = 0;
			logsHasMore = false;
			showAllUpcoming = false;
		}
		if (!loadActivity || loadedLogsSignature === signature) return;
		void loadLogs(currentProjectId, false, mode);
	});

	// ----------------------------------------------------------------
	// Recently Done — collapse logs into one tile per entity
	// ----------------------------------------------------------------

	type RecentTile = {
		key: string;
		entityType: ProjectLogEntityType;
		entityId: string;
		name: string;
		action: string;
		when: Date;
		actor?: string | null;
		source?: string | null;
	};

	const recentTiles = $derived.by<RecentTile[]>(() => {
		const seen = new Set<string>();
		const out: RecentTile[] = [];
		for (const log of logs) {
			const key = mode === 'workspace' ? log.id : `${log.entity_type}:${log.entity_id}`;
			if (mode === 'pulse') {
				if (seen.has(key)) continue;
				seen.add(key);
			}
			out.push({
				key,
				entityType: log.entity_type,
				entityId: log.entity_id,
				name: log.entity_name || `${log.entity_type}`,
				action: log.action,
				when: new Date(log.created_at),
				actor: log.actor_display_name ?? log.changed_by_name ?? null,
				source: log.change_source ?? null
			});
			if (mode === 'pulse' && out.length >= 6) break;
		}
		return out;
	});

	// ----------------------------------------------------------------
	// Up Next — upcoming dated work
	// ----------------------------------------------------------------

	const allUpcomingItems = $derived.by<UpcomingItem[]>(() => {
		const items: UpcomingItem[] = [];
		const nowMs = Date.now();

		for (const t of tasks) {
			if (t.state_key === 'done') continue;
			const ref = t.due_at || t.start_at;
			if (!ref) continue;
			const date = new Date(ref);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: t.id,
				kind: 'task',
				title: t.title,
				date,
				state: t.state_key,
				isOverdue: dateMs < nowMs
			});
		}

		for (const m of milestones) {
			const state = m.effective_state_key ?? m.state_key;
			if (state === 'completed') continue;
			if (!m.due_at) continue;
			const date = new Date(m.due_at);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: m.id,
				kind: 'milestone',
				title: m.title,
				date,
				state,
				isOverdue: dateMs < nowMs
			});
		}

		for (const g of goals) {
			if (g.state_key === 'achieved' || g.state_key === 'abandoned') continue;
			if (!g.target_date) continue;
			const date = new Date(g.target_date);
			const dateMs = date.getTime();
			if (!Number.isFinite(dateMs)) continue;
			items.push({
				id: g.id,
				kind: 'goal',
				title: g.name,
				date,
				state: g.state_key,
				isOverdue: dateMs < nowMs
			});
		}

		for (const event of events) {
			if (event.deleted_at) continue;
			if (event.state_key === 'cancelled' || event.state_key === 'canceled') continue;
			const startMs = getEventStartMs(event);
			if (startMs === null || isEventPast(event, nowMs)) continue;
			const date = new Date(startMs < nowMs ? nowMs : startMs);
			items.push({
				id: event.id,
				kind: 'event',
				title: event.title,
				date,
				state: event.state_key,
				isOverdue: false
			});
		}

		// Sort: overdue first (oldest first), then upcoming (soonest first)
		items.sort((a, b) => {
			if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
			return a.date.getTime() - b.date.getTime();
		});

		return items;
	});
	const upcomingItems = $derived(
		mode === 'workspace'
			? showAllUpcoming
				? allUpcomingItems
				: allUpcomingItems.slice(0, 12)
			: allUpcomingItems.slice(0, 6)
	);

	// ----------------------------------------------------------------
	// Display helpers
	// ----------------------------------------------------------------

	function relativeTime(date: Date): string {
		const diffMs = Date.now() - date.getTime();
		const diffSec = Math.round(diffMs / 1000);
		if (diffSec < 60) return 'just now';
		const diffMin = Math.round(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return `${diffHr}h ago`;
		const diffDay = Math.round(diffHr / 24);
		if (diffDay < 7) return `${diffDay}d ago`;
		const diffWk = Math.round(diffDay / 7);
		if (diffWk < 4) return `${diffWk}w ago`;
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	function relativeFuture(date: Date): { label: string; isOverdue: boolean } {
		const diffMs = date.getTime() - Date.now();
		const diffMin = Math.round(diffMs / 60000);
		if (diffMin === 0) return { label: 'now', isOverdue: false };
		if (diffMin < 0) {
			const past = Math.abs(diffMin);
			if (past < 60) return { label: `${past}m late`, isOverdue: true };
			const hrs = Math.round(past / 60);
			if (hrs < 24) return { label: `${hrs}h late`, isOverdue: true };
			const days = Math.round(hrs / 24);
			return { label: `${days}d late`, isOverdue: true };
		}
		if (diffMin < 60) return { label: `in ${diffMin}m`, isOverdue: false };
		const diffHr = Math.round(diffMin / 60);
		if (diffHr < 24) return { label: `in ${diffHr}h`, isOverdue: false };
		const diffDay = Math.round(diffHr / 24);
		if (diffDay < 14) return { label: `in ${diffDay}d`, isOverdue: false };
		return {
			label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
			isOverdue: false
		};
	}

	function entityIcon(kind: ProjectLogEntityType | UpcomingKind) {
		switch (kind) {
			case 'task':
				return ListChecks;
			case 'milestone':
				return Flag;
			case 'goal':
				return Target;
			case 'plan':
			case 'event':
				return Calendar;
			case 'document':
			case 'note':
			case 'requirement':
				return FileText;
			default:
				return Sparkles;
		}
	}

	function entityAccent(kind: ProjectLogEntityType | UpcomingKind): string {
		switch (kind) {
			case 'task':
				return 'text-info';
			case 'milestone':
				return 'text-warning';
			case 'goal':
				return 'text-accent';
			case 'plan':
				return 'text-accent';
			case 'event':
				return 'text-info';
			case 'document':
			case 'note':
			case 'requirement':
				return 'text-success';
			default:
				return 'text-muted-foreground';
		}
	}

	function actionVerb(action: string): string {
		switch (action) {
			case 'created':
				return 'added';
			case 'updated':
				return 'updated';
			case 'deleted':
				return 'removed';
			default:
				return action;
		}
	}

	function sourceLabel(source: string | null): string {
		switch (source) {
			case 'chat':
				return 'chat';
			case 'brain_dump':
				return 'brain dump';
			case 'form':
				return 'form';
			case 'api':
				return 'api';
			case 'agent_call':
				return 'agent call';
			default:
				return '';
		}
	}

	function activityActorPhrase(tile: RecentTile): string {
		if (tile.actor) {
			return `${tile.actor} ${actionVerb(tile.action)}`;
		}
		return actionVerb(tile.action);
	}
</script>

<!-- Mobile layout (< sm): segmented tabs, one list visible at a time -->
<section
	class="sm:hidden bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	aria-label={surfaceLabel}
>
	<div role="tablist" aria-label={viewsLabel} class="flex border-b border-border/60">
		<button
			bind:this={mobileTabButtons[0]}
			role="tab"
			type="button"
			id="pulse-tab-recent"
			aria-selected={mobileTab === 'recent'}
			aria-controls="pulse-panel-recent"
			tabindex={mobileTab === 'recent' ? 0 : -1}
			onclick={() => (mobileTab = 'recent')}
			onkeydown={(e) => onMobileTabKeydown(e, 0)}
			class="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable {mobileTab ===
			'recent'
				? 'text-foreground bg-muted/40 border-b-2 border-accent -mb-px'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-b-2 border-transparent'}"
		>
			<History
				class="w-3.5 h-3.5 {mobileTab === 'recent'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			/>
			<span>{mode === 'workspace' ? 'History' : 'Recent'}</span>
			{#if !logsLoading && (mode === 'workspace' ? logsTotal : recentTiles.length) > 0}
				<span class="text-2xs text-muted-foreground/80">
					({mode === 'workspace' ? logsTotal : recentTiles.length})
				</span>
			{/if}
		</button>
		<button
			bind:this={mobileTabButtons[1]}
			role="tab"
			type="button"
			id="pulse-tab-next"
			aria-selected={mobileTab === 'next'}
			aria-controls="pulse-panel-next"
			tabindex={mobileTab === 'next' ? 0 : -1}
			onclick={() => (mobileTab = 'next')}
			onkeydown={(e) => onMobileTabKeydown(e, 1)}
			class="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable {mobileTab ===
			'next'
				? 'text-foreground bg-muted/40 border-b-2 border-accent -mb-px'
				: 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-b-2 border-transparent'}"
		>
			<ArrowRight
				class="w-3.5 h-3.5 {mobileTab === 'next'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			/>
			<span>Up next</span>
			{#if upcomingItems.length > 0}
				<span class="text-2xs text-muted-foreground/80">
					({mode === 'workspace' ? allUpcomingItems.length : upcomingItems.length})
				</span>
			{/if}
		</button>
	</div>

	{#if mobileTab === 'next'}
		<div
			id="pulse-panel-next"
			role="tabpanel"
			aria-labelledby="pulse-tab-next"
			class="p-2 space-y-1.5"
		>
			{#if upcomingItems.length === 0}
				<p class="text-xs text-muted-foreground px-2 py-4 text-center italic">
					Nothing scheduled. Add a date to a task, milestone, goal, or event to see it
					here.
				</p>
			{:else}
				{#each upcomingItems as item (item.id)}
					{@const Icon = entityIcon(item.kind)}
					{@const future = relativeFuture(item.date)}
					<button
						type="button"
						onclick={() => onOpenEntity(item.kind, item.id)}
						class="min-h-[44px] w-full rounded-md border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted motion-reduce:transition-none pressable"
					>
						<div class="flex items-start gap-2.5 min-w-0">
							<Icon class="w-4 h-4 mt-0.5 shrink-0 {entityAccent(item.kind)}" />
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-foreground line-clamp-1">
									{item.title}
								</p>
								<p class="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs">
									<span class="capitalize text-muted-foreground">{item.kind}</span
									>
									<span class="text-muted-foreground/50">·</span>
									<span
										class="inline-flex items-center gap-1 {future.isOverdue
											? 'text-destructive font-medium'
											: 'text-muted-foreground'}"
									>
										<Clock class="w-3 h-3 shrink-0" />
										{future.label}
									</span>
									{#if item.kind === 'task' && item.state === 'in_progress'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-info font-medium">in progress</span>
									{:else if item.kind === 'task' && item.state === 'blocked'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-destructive font-medium">blocked</span>
									{/if}
								</p>
							</div>
						</div>
					</button>
				{/each}
				{#if mode === 'workspace' && allUpcomingItems.length > 12}
					<button
						type="button"
						class="workspace-list-action"
						aria-expanded={showAllUpcoming}
						onclick={() => (showAllUpcoming = !showAllUpcoming)}
					>
						{showAllUpcoming
							? 'Show fewer upcoming items'
							: `Show all ${allUpcomingItems.length} upcoming items`}
					</button>
				{/if}
			{/if}
		</div>
	{:else}
		<div
			id="pulse-panel-recent"
			role="tabpanel"
			aria-labelledby="pulse-tab-recent"
			class="p-2 space-y-1.5"
		>
			{#if logsLoading}
				{#each Array(3) as _, i (i)}
					<div
						class="h-14 animate-pulse rounded-md border border-border/60 bg-muted/40 motion-reduce:animate-none"
					></div>
				{/each}
			{:else if logsError}
				<p class="text-xs text-destructive px-2 py-3">{logsError}</p>
			{:else if recentTiles.length === 0}
				<p class="text-xs text-muted-foreground px-2 py-4 text-center italic">
					Nothing logged yet. As you work, recent edits show up here.
				</p>
			{:else}
				{#each recentTiles as tile (tile.key)}
					{@const Icon = entityIcon(tile.entityType)}
					<button
						type="button"
						onclick={() => onOpenEntity(tile.entityType, tile.entityId)}
						class="min-h-[44px] w-full rounded-md border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-muted motion-reduce:transition-none pressable"
					>
						<div class="flex items-start gap-2.5 min-w-0">
							<Icon class="w-4 h-4 mt-0.5 shrink-0 {entityAccent(tile.entityType)}" />
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium text-foreground line-clamp-1">
									{tile.name}
								</p>
								<p class="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">
									<span>{activityActorPhrase(tile)}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span class="capitalize">{tile.entityType}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span>{relativeTime(tile.when)}</span>
								</p>
							</div>
						</div>
					</button>
				{/each}
				{#if mode === 'workspace' && logsHasMore}
					<button
						type="button"
						class="workspace-list-action"
						disabled={logsLoadingMore}
						onclick={() => void loadLogs(projectId, true, mode)}
					>
						{logsLoadingMore
							? 'Loading more activity…'
							: `Load more activity (${logs.length}/${logsTotal})`}
					</button>
				{/if}
			{/if}
		</div>
	{/if}
</section>

<!-- Desktop layout (sm+): side-by-side at md+, stacked at sm -->
<section class="hidden sm:grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4" aria-label={surfaceLabel}>
	<!-- Recently Done -->
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	>
		<header
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60"
		>
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-md bg-muted/60 flex items-center justify-center">
					<History class="w-3.5 h-3.5 text-muted-foreground" />
				</div>
				<div>
					<p class="text-xs sm:text-sm font-semibold text-foreground">
						{mode === 'workspace' ? 'Change history' : 'Recent activity'}
					</p>
					<p class="text-2xs text-muted-foreground sm:text-xs">
						{mode === 'workspace'
							? 'Recorded changes across this project'
							: "What's moved in the last few days"}
					</p>
				</div>
			</div>
			{#if !logsLoading}
				<span class="micro-label text-muted-foreground/70">
					{mode === 'workspace' ? logsTotal : recentTiles.length}
				</span>
			{/if}
		</header>

		<div class="p-2 sm:p-3 space-y-1.5">
			{#if logsLoading}
				{#each Array(3) as _, i (i)}
					<div
						class="h-12 animate-pulse rounded-md border border-border/60 bg-muted/40 motion-reduce:animate-none"
					></div>
				{/each}
			{:else if logsError}
				<p class="text-xs text-destructive px-1 py-2">{logsError}</p>
			{:else if recentTiles.length === 0}
				<p class="text-xs text-muted-foreground px-1 py-3 italic">
					Nothing logged yet. As you work, recent edits show up here.
				</p>
			{:else}
				{#each recentTiles as tile (tile.key)}
					{@const Icon = entityIcon(tile.entityType)}
					<button
						type="button"
						onclick={() => onOpenEntity(tile.entityType, tile.entityId)}
						class="group min-h-[44px] w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
					>
						<div class="flex items-start gap-2 min-w-0">
							<Icon
								class="w-3.5 h-3.5 mt-0.5 shrink-0 {entityAccent(tile.entityType)}"
							/>
							<div class="min-w-0 flex-1">
								<p
									class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
								>
									{tile.name}
								</p>
								<p
									class="mt-0.5 line-clamp-1 text-2xs text-muted-foreground sm:text-xs"
								>
									<span>{activityActorPhrase(tile)}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span class="capitalize">{tile.entityType}</span>
									<span class="mx-1 text-muted-foreground/50">·</span>
									<span>{relativeTime(tile.when)}</span>
									{#if tile.source && sourceLabel(tile.source)}
										<span class="mx-1 text-muted-foreground/50">·</span>
										<span class="text-muted-foreground/80"
											>via {sourceLabel(tile.source)}</span
										>
									{/if}
								</p>
							</div>
						</div>
					</button>
				{/each}
				{#if mode === 'workspace' && logsHasMore}
					<button
						type="button"
						class="workspace-list-action"
						disabled={logsLoadingMore}
						onclick={() => void loadLogs(projectId, true, mode)}
					>
						{logsLoadingMore
							? 'Loading more activity…'
							: `Load more activity (${logs.length}/${logsTotal})`}
					</button>
				{/if}
			{/if}
		</div>
	</div>

	<!-- Up Next -->
	<div
		class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak overflow-hidden"
	>
		<header
			class="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/60"
		>
			<div class="flex items-center gap-2">
				<div class="w-7 h-7 rounded-md bg-warning/10 flex items-center justify-center">
					<ArrowRight class="w-3.5 h-3.5 text-warning" />
				</div>
				<div>
					<p class="text-xs sm:text-sm font-semibold text-foreground">Up next</p>
					<p class="text-2xs text-muted-foreground sm:text-xs">
						Scheduled tasks, milestones, goals &amp; events
					</p>
				</div>
			</div>
			{#if upcomingItems.length > 0}
				<span class="micro-label text-muted-foreground/70">
					{mode === 'workspace' ? allUpcomingItems.length : upcomingItems.length}
				</span>
			{/if}
		</header>

		<div class="p-2 sm:p-3 space-y-1.5">
			{#if upcomingItems.length === 0}
				<p class="text-xs text-muted-foreground px-1 py-3 italic">
					Nothing scheduled. Add a date to a task, milestone, goal, or event to see it
					here.
				</p>
			{:else}
				{#each upcomingItems as item (item.id)}
					{@const Icon = entityIcon(item.kind)}
					{@const future = relativeFuture(item.date)}
					<button
						type="button"
						onclick={() => onOpenEntity(item.kind, item.id)}
						class="group min-h-[44px] w-full rounded-md border border-border/60 bg-background px-2.5 py-2 text-left transition-colors hover:border-border hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none pressable"
					>
						<div class="flex items-start gap-2 min-w-0">
							<Icon class="w-3.5 h-3.5 mt-0.5 shrink-0 {entityAccent(item.kind)}" />
							<div class="min-w-0 flex-1">
								<p
									class="text-xs sm:text-sm font-medium text-foreground line-clamp-1"
								>
									{item.title}
								</p>
								<p class="mt-0.5 flex items-center gap-1.5 text-2xs sm:text-xs">
									<span class="capitalize text-muted-foreground">{item.kind}</span
									>
									<span class="text-muted-foreground/50">·</span>
									<Clock
										class="w-3 h-3 shrink-0 {future.isOverdue
											? 'text-destructive'
											: 'text-muted-foreground'}"
									/>
									<span
										class={future.isOverdue
											? 'text-destructive font-medium'
											: 'text-muted-foreground'}
									>
										{future.label}
									</span>
									{#if item.kind === 'task' && item.state === 'in_progress'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-info font-medium">in progress</span>
									{:else if item.kind === 'task' && item.state === 'blocked'}
										<span class="text-muted-foreground/50">·</span>
										<span class="text-destructive font-medium">blocked</span>
									{/if}
								</p>
							</div>
						</div>
					</button>
				{/each}
				{#if mode === 'workspace' && allUpcomingItems.length > 12}
					<button
						type="button"
						class="workspace-list-action"
						aria-expanded={showAllUpcoming}
						onclick={() => (showAllUpcoming = !showAllUpcoming)}
					>
						{showAllUpcoming
							? 'Show fewer upcoming items'
							: `Show all ${allUpcomingItems.length} upcoming items`}
					</button>
				{/if}
			{/if}
		</div>
	</div>
</section>

<style>
	.workspace-list-action {
		display: inline-flex;
		min-height: 44px;
		width: 100%;
		align-items: center;
		justify-content: center;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		color: hsl(var(--accent));
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			background-color 120ms ease,
			color 120ms ease;
	}

	.workspace-list-action:hover:not(:disabled) {
		background: hsl(var(--accent) / 0.08);
	}

	.workspace-list-action:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}

	.workspace-list-action:disabled {
		cursor: wait;
		opacity: 0.6;
	}

	@media (prefers-reduced-motion: reduce) {
		.workspace-list-action {
			transition: none;
		}
	}
</style>
